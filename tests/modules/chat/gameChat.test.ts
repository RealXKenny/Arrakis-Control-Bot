import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Client, Message } from "discord.js";
import { parse as parseDotenv } from "dotenv";
import { loadChatBridgeConfig } from "../../../src/infrastructure/config/chatBridge";
import { encodeMapChat, decodeMapChat } from "../../../src/modules/chat/gameChatProtocol";
import { DiscordGameChatBridge } from "../../../src/modules/chat/DiscordGameChatBridge";
import { GameChatConnection } from "../../../src/infrastructure/amqp/GameChatConnection";
import { mapChatLabel } from "../../../src/modules/chat/mapChatLabel";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("amqplib", () => ({ connect }));
const route = { guildId: "123456789012345678", channelId: "234567890123456789", map: "HaggaBasin.0" };
const env = { RABBITMQ_URL: "amqps://5E121CE000000001:secret@remote.example.com:31982/", CHAT_BRIDGE_FUNCOM_ID: "Admin#0001", CHAT_BRIDGE_ROUTES: JSON.stringify([route]) };
const config = loadChatBridgeConfig(env)!;
const maps = ["HaggaBasin.0", "Survival_1.dim_1", "DeepDesert_1.0", "DeepDesert_1.dim_1", "SH_Arrakeen.0", "SH_HarkoVillage.0", "Survival_1.dim_0"];
const allRoutes = maps.map((map) => ({ ...route, map }));

function chatBody(type: string, recipient = ""): Buffer {
  const envelope = JSON.parse(encodeMapChat("Player#1234", "hello").body.toString());
  const payload = JSON.parse(envelope.content);
  payload.m_ChannelType = type;
  payload.m_UserNameTo = recipient;
  return Buffer.from(JSON.stringify({ Type: "TextChat", Content: JSON.stringify(payload) }));
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("chat configuration and game wire format", () => {
  it.each([
    ["HaggaBasin.0", "Hagga Basin"],
    ["Survival_1.dim_1", "Hagga Basin PvP"],
    ["DeepDesert_1.0", "Deep Desert PvP"],
    ["DeepDesert_1.dim_1", "Deep Desert PvE"],
    ["SH_Arrakeen.0", "Arrakeen"],
    ["SH_HarkoVillage.0", "Harko Village"],
    ["Survival_1.dim_0", "World Overmap"],
    ["FutureMap.dim_42", "FutureMap.dim_42"],
  ])("labels %s as %s without changing routing", (key, label) => {
    expect(mapChatLabel(key)).toBe(label);
  });
  it("rejects proximity and other non-map traffic", () => {
    for (const type of ["Proximity", "Whisper", "Whispers", "Guild", "Party", "Local", "Unknown"]) {
      expect(decodeMapChat(chatBody(type))).toBeNull();
    }
    expect(decodeMapChat(chatBody("Map", "Recipient#1234"))).toBeNull();
  });

  it("supports all seven maps on one channel and future exact map keys", () => {
    const routes = [...allRoutes, { ...route, map: "FutureMap.dim_42" }];
    expect(loadChatBridgeConfig({ ...env, CHAT_BRIDGE_ROUTES: JSON.stringify(routes) })?.routes).toEqual(routes);
    expect(() => loadChatBridgeConfig({ ...env, CHAT_BRIDGE_ROUTES: JSON.stringify([...allRoutes, route]) })).toThrow("CHAT_BRIDGE_ROUTES");
    expect(() => loadChatBridgeConfig({ ...env, CHAT_BRIDGE_ROUTES: JSON.stringify([route, { ...route, guildId: "345678901234567890", map: maps[1] }]) })).toThrow("CHAT_BRIDGE_ROUTES");
  });
  it("enables an explicit display name only when configured and rejects invalid names", () => {
    expect(loadChatBridgeConfig(env)?.displayName).toBeUndefined();
    expect(loadChatBridgeConfig({ ...env, CHAT_BRIDGE_DISPLAY_NAME: " Arrakis Control " })?.displayName).toBe("Arrakis Control");
    expect(() => loadChatBridgeConfig({ ...env, CHAT_BRIDGE_DISPLAY_NAME: "a".repeat(81) })).toThrow("CHAT_BRIDGE_DISPLAY_NAME");
    expect(() => loadChatBridgeConfig({ ...env, CHAT_BRIDGE_DISPLAY_NAME: "Arrakis\nControl" })).toThrow("CHAT_BRIDGE_DISPLAY_NAME");
  });

  it("sets explicit sender fields while preserving the map envelope and native sender ID", () => {
    const encoded = encodeMapChat("ArrakisControl#0001", "[Discord] Kenny: hello", "Arrakis Control");
    const envelope = JSON.parse(encoded.body.toString());
    expect(envelope.Type).toBe("TextChat");
    expect(envelope.Content).toBeUndefined();
    expect(typeof envelope.content).toBe("string");
    expect(JSON.parse(envelope.content)).toMatchObject({
      m_ChannelType: "Map", m_SubChannelId: "", m_bUseSpoofedUserName: true,
      m_FuncomIdFrom: "ArrakisControl#0001",
      m_SpoofedUserNameFrom: { m_TableId: "", m_Key: "", m_UnlocalizedName: "Arrakis Control" },
      m_Message: { m_UnlocalizedMessage: "[Discord] Kenny: hello" },
    });
  });
  it("preserves the Funcom discriminator in quoted dotenv configuration", () => {
    const parsed = parseDotenv('CHAT_BRIDGE_FUNCOM_ID="ArrakisControl#0001"');
    expect(loadChatBridgeConfig({ ...env, ...parsed })?.funcomId).toBe("ArrakisControl#0001");
  });
  it("validates an explicit TLS certificate name without changing the broker address", () => {
    const configured = loadChatBridgeConfig({ ...env, RABBITMQ_TLS_SERVERNAME: "dune-rmq-game" })!;
    expect(configured.tlsServername).toBe("dune-rmq-game");
    expect(new URL(configured.url).hostname).toBe("remote.example.com");
    expect(() => loadChatBridgeConfig({ ...env, RABBITMQ_TLS_SERVERNAME: "bad/name" })).toThrow("RABBITMQ_TLS_SERVERNAME");
    expect(() => loadChatBridgeConfig({ ...env, RABBITMQ_URL: env.RABBITMQ_URL.replace("amqps:", "amqp:"), RABBITMQ_TLS_SERVERNAME: "dune-rmq-game" })).toThrow("RABBITMQ_TLS_SERVERNAME");
  });
  it("is opt-in, validates mappings and preserves a remote TLS endpoint", () => {
    expect(loadChatBridgeConfig({})).toBeUndefined();
    expect(config.url).toBe("amqps://5E121CE000000001:secret@remote.example.com:31982/%2F?heartbeat=30");
    expect(() => loadChatBridgeConfig({ ...env, RABBITMQ_URL: "https://remote.example.com" })).toThrow("RABBITMQ_URL");
    expect(() => loadChatBridgeConfig({ ...env, CHAT_BRIDGE_FUNCOM_ID: "" })).toThrow("CHAT_BRIDGE_FUNCOM_ID");
    expect(() => loadChatBridgeConfig({ ...env, CHAT_BRIDGE_ROUTES: JSON.stringify([route, route]) })).toThrow("CHAT_BRIDGE_ROUTES");
    expect(() => loadChatBridgeConfig({ ...env, CHAT_BRIDGE_ROUTES: JSON.stringify([{ ...route, map: "#" }]) })).toThrow("CHAT_BRIDGE_ROUTES");
  });

  it("encodes the exact map envelope, native identity, UTC time and decimal origin", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-17T20:01:02Z"));
    const message = encodeMapChat("Player#1234", "hello");
    expect(message.id).toMatch(/^[A-F0-9]{32}$/);
    const outer = JSON.parse(message.body.toString());
    expect(outer.Type).toBe("TextChat");
    expect(outer.Content).toBeUndefined();
    expect(outer.content).toContain('"m_OriginLocation":{"X":0.0,"Y":0.0,"Z":0.0}');
    expect(JSON.parse(outer.content)).toMatchObject({ m_Timestamp: "2026.09.17-20.01.02", m_bUseSpoofedUserName: false, m_ChannelType: "Map" });
    expect(decodeMapChat(message.body)).toEqual({ id: message.id, sender: "Player#1234", text: "hello" });
  });

  it("ignores malformed, oversized, private and non-chat messages", () => {
    for (const body of [Buffer.from("invalid"), Buffer.alloc(65537), Buffer.from("null"), Buffer.from('{"Type":"Other"}')]) expect(decodeMapChat(body)).toBeNull();
    const outer = JSON.parse(encodeMapChat("Player#1234", "private").body.toString());
    const payload = JSON.parse(outer.content);
    payload.m_ChannelType = "Whisper";
    expect(decodeMapChat(Buffer.from(JSON.stringify({ Type: "TextChat", Content: JSON.stringify(payload) })))).toBeNull();
  });
});

function mockBroker() {
  const channel = Object.assign(new EventEmitter(), {
    checkExchange: vi.fn().mockResolvedValue({}), assertQueue: vi.fn().mockResolvedValue({ queue: "amq.gen-test" }),
    bindQueue: vi.fn().mockResolvedValue({}), prefetch: vi.fn().mockResolvedValue({}), consume: vi.fn().mockResolvedValue({}),
    publish: vi.fn().mockImplementation((_exchange, _key, _body, _options, callback) => { callback(null); return true; }),
    ack: vi.fn(), nack: vi.fn(),
  });
  const connection = Object.assign(new EventEmitter(), {
    createConfirmChannel: vi.fn().mockResolvedValue(channel),
    close: vi.fn().mockImplementation(() => { connection.emit("close"); return Promise.resolve(); }),
  });
  connect.mockResolvedValue(connection);
  return { channel, connection };
}

describe("RabbitMQ lifecycle", () => {

  it("binds exact maps, confirms publishing, acknowledges received messages and closes cleanly", async () => {
    const { channel, connection } = mockBroker();
    const receive = vi.fn().mockResolvedValue(undefined);
    const transport = new GameChatConnection({ ...config, tlsServername: "dune-rmq-game" }, receive, vi.fn());
    transport.start();
    await vi.waitFor(() => expect(channel.consume).toHaveBeenCalled());
    expect(connect).toHaveBeenCalledWith(config.url, expect.objectContaining({ servername: "dune-rmq-game", rejectUnauthorized: true }));
    expect(channel.bindQueue).toHaveBeenCalledWith("amq.gen-test", "chat.map", "HaggaBasin.0");
    const encoded = encodeMapChat(config.funcomId, "hello");
    await transport.publish(route.map, encoded.id, encoded.body);
    expect(channel.publish).toHaveBeenCalledWith("chat.map", route.map, encoded.body, expect.objectContaining({
      userId: "5E121CE000000001", type: "text_chat", appId: "fls_backend", mandatory: true,
      contentType: "Content", headers: { redirect_exchange: Buffer.from("chat.map") },
    }), expect.any(Function));
    const incoming = { fields: { routingKey: route.map }, content: encoded.body };
    channel.consume.mock.calls[0][1](incoming);
    await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledWith(incoming));
    expect(receive).toHaveBeenCalledWith(route.map, encoded.body);
    await transport.stop();
    expect(connection.close).toHaveBeenCalled();
    await expect(transport.publish(route.map, encoded.id, encoded.body)).rejects.toThrow("offline");
  });

  it("retries failed connections without logging credentials and stops retrying at shutdown", async () => {
    vi.useFakeTimers();
    connect.mockRejectedValue(new Error("secret endpoint error"));
    const warn = vi.fn();
    const transport = new GameChatConnection(config, vi.fn(), warn);
    transport.start();
    await vi.advanceTimersByTimeAsync(3_100);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret");
    await transport.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it("reconnects after channel closure and rejects a pending publish on disconnect", async () => {
    vi.useFakeTimers();
    const { channel, connection } = mockBroker();
    const transport = new GameChatConnection(config, vi.fn(), vi.fn());
    transport.start();
    await vi.advanceTimersByTimeAsync(0);
    channel.publish.mockImplementation(() => true);
    const pending = transport.publish(route.map, "id", Buffer.from("{}"));
    const rejected = expect(pending).rejects.toThrow("disconnected");
    channel.emit("close");
    await rejected;
    expect(connection.close).toHaveBeenCalled();
    mockBroker();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(connect).toHaveBeenCalledTimes(2);
    await transport.stop();
  });
});

describe("Discord chat routing", () => {
  it("tags Discord owners on every map using the role ID without player-link requests", async () => {
    const { channel } = mockBroker();
    const { bridge, client, info } = setup(undefined, allRoutes, "owner-role");
    const getCurrentPlayer = vi.fn().mockRejectedValue(new Error("No verification available"));
    Object.assign(client, { discordAdapter: { getCurrentPlayer } });
    bridge.start();
    await vi.waitFor(() => expect(channel.consume).toHaveBeenCalled());
    const roles = new Map([["owner-role", {}]]);
    const message = { id: "345678901234567890", guildId: route.guildId, channelId: route.channelId, content: "hello", author: { bot: false, username: "Kenny" }, member: { displayName: "Kenny", roles: { cache: roles } }, reply: vi.fn() };
    await bridge.sendToGame(message as unknown as Message);
    expect(channel.publish).toHaveBeenCalledTimes(7);
    for (const call of channel.publish.mock.calls) {
      expect(decodeMapChat(call[2])).toMatchObject({ sender: config.funcomId, text: "[Discord] [Owner] Kenny: hello" });
    }
    expect(getCurrentPlayer).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("RabbitMQ accepted 7/7 map publishes."));
    expect(info.mock.calls.flat().join(" ")).not.toContain("game-client display is not confirmed");
    roles.clear();
    await bridge.sendToGame(message as unknown as Message);
    expect(decodeMapChat(channel.publish.mock.lastCall?.[2])?.text).toBe("[Discord] Kenny: hello");
    await bridge.sendToGame({ ...message, member: null } as unknown as Message);
    expect(decodeMapChat(channel.publish.mock.lastCall?.[2])?.text).toBe("[Discord] Kenny: hello");
    await bridge.stop();
  });

  it("does not infer Owner status from another role or from game sender names", async () => {
    const { channel } = mockBroker();
    const { bridge, send } = setup(undefined, config.routes, "owner-role");
    bridge.start();
    await vi.waitFor(() => expect(channel.consume).toHaveBeenCalled());
    await bridge.sendToGame({ guildId: route.guildId, channelId: route.channelId, content: "hello", author: { bot: false, username: "Kenny" }, member: { roles: { cache: new Map([["another-role", {}]]) } }, reply: vi.fn() } as unknown as Message);
    expect(decodeMapChat(channel.publish.mock.calls[0][2])?.text).toBe("[Discord] Kenny: hello");
    await bridge.sendToDiscord(route.map, encodeMapChat("Kenny#1234", "hello").body);
    expect(send.mock.calls[0][0].content).not.toContain("[Owner]");
    await bridge.stop();
  });
  function setup(displayName?: string, routes = config.routes, ownerRoleId?: string) {
    const send = vi.fn().mockResolvedValue({});
    const channel = { isSendable: () => true, guildId: route.guildId, send };
    const client = Object.assign(new EventEmitter(), { guilds: { cache: new Map([[route.guildId, {}]]) }, channels: { fetch: vi.fn().mockResolvedValue(channel) } });
    const info = vi.fn();
    const bridge = new DiscordGameChatBridge(client as unknown as Client, { ...config, displayName, routes }, vi.fn(), info, ownerRoleId);
    return { bridge, client, send, info };
  }

  it("binds and relays all seven maps with independent IDs and continues after a rejected map", async () => {
    const { channel } = mockBroker();
    const { bridge, info, send } = setup(undefined, allRoutes);
    bridge.start();
    await vi.waitFor(() => expect(channel.consume).toHaveBeenCalled());
    expect(channel.bindQueue.mock.calls.map((call) => call[2])).toEqual(maps);
    channel.publish.mockImplementation((_exchange, key, _body, _options, callback) => {
      callback(key === maps[1] ? new Error("rejected") : null);
      return true;
    });
    const reply = vi.fn().mockResolvedValue({});
    await bridge.sendToGame({ id: "345678901234567890", guildId: route.guildId, channelId: route.channelId, content: "hello", author: { bot: false, username: "Kenny" }, reply } as unknown as Message);
    expect(channel.publish.mock.calls.map((call) => call[1])).toEqual(maps);
    expect(new Set(channel.publish.mock.calls.map((call) => call[3].messageId)).size).toBe(7);
    expect(info).toHaveBeenCalledWith(expect.stringContaining("RabbitMQ accepted 6/7"));
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("Hagga Basin PvP") }));
    expect(info.mock.calls.flat().join(" ")).not.toContain("Kenny: hello");
    const body = encodeMapChat("Player#1234", "test").body;
    for (const map of maps) {
      await bridge.sendToDiscord(map, body);
      await bridge.sendToDiscord(map, body);
    }
    expect(send).toHaveBeenCalledTimes(7);
    expect(send.mock.calls.map(([message]) => message.content)).toEqual([
      "Hagga Basin", "Hagga Basin PvP", "Deep Desert PvP", "Deep Desert PvE", "Arrakeen", "Harko Village", "World Overmap",
    ].map((label) => `**[${label}] Player#1234:** test`));
    await bridge.stop();
  });

  it("suppresses echoes, duplicate IDs and unmapped maps, and disables Discord mentions", async () => {
    const { bridge, send } = setup();
    await bridge.sendToDiscord(route.map, encodeMapChat(config.funcomId, "echo").body);
    const body = encodeMapChat("Player#1234", "@everyone hello").body;
    await bridge.sendToDiscord("DeepDesert_1.0", body);
    expect(send).not.toHaveBeenCalled();
    await bridge.sendToDiscord(route.map, body);
    await bridge.sendToDiscord(route.map, body);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ allowedMentions: { parse: [] } }));
  });

  it("publishes human messages with author attribution but ignores bots and other channels", async () => {
    const { channel } = mockBroker();
    const { bridge, info } = setup("Arrakis Control");
    bridge.start();
    await vi.waitFor(() => expect(channel.consume).toHaveBeenCalled());
    const message = { guildId: route.guildId, channelId: route.channelId, content: "hello", cleanContent: "hello", author: { bot: false, username: "Kenny" }, reply: vi.fn().mockResolvedValue({}) };
    await bridge.sendToGame(message as unknown as Message);
    expect(decodeMapChat(channel.publish.mock.calls[0][2])?.text).toBe("[Discord] Kenny: hello");
    const payload = JSON.parse(JSON.parse(channel.publish.mock.calls[0][2].toString()).content);
    expect(payload.m_bUseSpoofedUserName).toBe(true);
    expect(payload.m_SpoofedUserNameFrom.m_UnlocalizedName).toBe("Arrakis Control");
    expect(info).toHaveBeenCalledWith(expect.stringContaining("RabbitMQ accepted 1/1 map publishes."));
    expect(info.mock.calls.flat().join(" ")).not.toContain("Kenny: hello");
    await bridge.sendToGame({ ...message, author: { bot: true } } as unknown as Message);
    await bridge.sendToGame({ ...message, channelId: "other" } as unknown as Message);
    expect(channel.publish).toHaveBeenCalledTimes(1);
    await bridge.stop();
    await bridge.sendToGame(message as unknown as Message);
    expect(message.reply).toHaveBeenCalledWith(expect.objectContaining({ allowedMentions: { parse: [], repliedUser: false } }));
  });

  it("does not consume guilds owned by another shard", () => {
    const { bridge, client } = setup();
    client.guilds.cache.clear();
    bridge.start();
    expect(connect).not.toHaveBeenCalled();
  });
});
