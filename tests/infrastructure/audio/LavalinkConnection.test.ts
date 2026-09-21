import type { Client } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MusicConfig } from "../../../src/infrastructure/config/music";

const mocks = vi.hoisted(() => ({
  joinVoiceChannel: vi.fn(),
  managerOn: vi.fn(),
  playerOn: vi.fn(),
}));

vi.mock("shoukaku", () => ({
  Connectors: {
    DiscordJS: class DiscordJsConnector {},
  },
  Shoukaku: class ShoukakuManager {
    public readonly players = new Map();
    public readonly nodes = new Map();
    public readonly joinVoiceChannel = mocks.joinVoiceChannel;
    public readonly on = mocks.managerOn;

    public getIdealNode(): undefined { return undefined; }
    public async leaveVoiceChannel(): Promise<void> {}
    public removeNode(): void {}
  },
}));

import { LavalinkConnection } from "../../../src/infrastructure/audio/LavalinkConnection";

const config: MusicConfig = {
  guildId: "100000000000000001",
  voiceChannelId: "100000000000000002",
  requestChannelId: "100000000000000003",
  url: "localhost:2333",
  password: "test-password",
  secure: false,
  searchPrefix: "scsearch",
  volume: 30,
  maxQueue: 100,
};

describe("LavalinkConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.joinVoiceChannel.mockResolvedValue({ on: mocks.playerOn });
  });

  it("joins the music lounge undeafened", async () => {
    const client = {
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
      },
    } as unknown as Client;
    const connection = new LavalinkConnection(client, config, {
      ready: vi.fn(),
      started: vi.fn(),
      ended: vi.fn(),
      failed: vi.fn(),
    });

    await connection.join(config.guildId, config.voiceChannelId, 2);

    expect(mocks.joinVoiceChannel).toHaveBeenCalledWith({
      guildId: config.guildId,
      channelId: config.voiceChannelId,
      shardId: 2,
      deaf: false,
    });
  });
});
