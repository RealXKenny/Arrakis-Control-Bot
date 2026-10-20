import { Collection, type Client, type Message, type MessageCreateOptions } from "discord.js";
import { afterEach, expect, it, vi } from "vitest";
import { ensureBotControlPanel } from "../../../src/modules/administration/control/botControlPanel";
import { ensureStaffApplicationPanel } from "../../../src/modules/community/applications/staffApplicationPanel";
import { ensureFaqPanel } from "../../../src/modules/community/faq/faqPanel";
import { ensureRolePanel } from "../../../src/modules/community/roles/rolePanel";
import { ensureRulesPanel } from "../../../src/modules/community/rules/rulesPanel";
import { ensureVerificationPanel } from "../../../src/modules/community/verification/verificationPanel";
import { ensureBlueprintUploadPanel } from "../../../src/modules/players/blueprints/blueprintUploadPanel";
import { ensurePlayerLinkPanel } from "../../../src/modules/players/linking/playerLinkPanel";
import { ensureServerInfoPanel } from "../../../src/modules/server/information/serverInfoPanel";
import { ensureTicketPanel } from "../../../src/modules/tickets/ticketPanel";
import { createPanelStorage } from "../../helpers/panelStorage";

vi.mock("../../../src/shared/discord/imageFactory", () => ({
  createDuneBanner: () => ({ attachment: Buffer.from("banner"), name: "banner.png" }),
  createTicketSupportBanner: () => ({ attachment: Buffer.from("banner"), name: "banner.png" }),
}));
afterEach(() => vi.unstubAllEnvs());

function setup() {
  vi.stubEnv("ROLE_PVE_ID", "test-role");
  const messages = new Collection<string, Message>();
  const edit = vi.fn().mockResolvedValue(undefined);
  const fetch = vi.fn().mockImplementation((options: { message?: string }) => options.message
    ? messages.has(options.message) ? Promise.resolve(messages.get(options.message)) : Promise.reject({ code: 10008 })
    : Promise.resolve(messages));
  const send = vi.fn().mockImplementation((payload: MessageCreateOptions) => {
    const id = String(messages.size + 1);
    const message = { id, author: { id: "bot" }, components: payload.components ?? [], edit } as unknown as Message;
    messages.set(id, message);
    return Promise.resolve(message);
  });
  const channel = { id: "channel", isSendable: () => true, messages: { fetch }, send };
  const client = { user: { id: "bot" }, panelStorage: createPanelStorage(), tickets: {},
    staffApplications: { config: { panelChannelId: "channel" } }, channels: { fetch: vi.fn().mockResolvedValue(channel) } } as unknown as Client;
  return { client, messages, send, fetch, edit };
}

it.each([
  ["control center", ensureBotControlPanel, 1],
  ["staff applications", ensureStaffApplicationPanel, 1],
  ["FAQ", ensureFaqPanel, 1],
  ["roles", ensureRolePanel, 1],
  ["rules", ensureRulesPanel, 1],
  ["verification", ensureVerificationPanel, 1],
  ["blueprints", ensureBlueprintUploadPanel, 1],
  ["account links", ensurePlayerLinkPanel, 1],
  ["server information", ensureServerInfoPanel, 2],
  ["support tickets", ensureTicketPanel, 1],
] as const)("reuses saved %s messages after restart without scanning history", async (_label, publish, count) => {
  const f = setup();
  await publish(f.client, "channel");
  expect(f.send).toHaveBeenCalledTimes(count);
  f.fetch.mockClear();
  await publish({ ...f.client } as Client, "channel");
  expect(f.send).toHaveBeenCalledTimes(count);
  expect(f.edit).toHaveBeenCalledTimes(count);
  expect(f.fetch).toHaveBeenCalledTimes(count);
  for (const [options] of f.fetch.mock.calls) expect(options).toEqual({ message: expect.any(String), force: true });
});

it("recovers partial server-info publication without duplicating the saved first message", async () => {
  const f = setup();
  const successfulSend = f.send.getMockImplementation()!;
  f.send.mockImplementationOnce(successfulSend).mockRejectedValueOnce(new Error("second message failed"));
  await expect(ensureServerInfoPanel(f.client, "channel")).rejects.toThrow("second message failed");
  await ensureServerInfoPanel({ ...f.client } as Client, "channel");
  expect(f.messages.size).toBe(2);
  expect(f.edit).toHaveBeenCalledOnce();
  expect(f.send).toHaveBeenCalledTimes(3);
});
