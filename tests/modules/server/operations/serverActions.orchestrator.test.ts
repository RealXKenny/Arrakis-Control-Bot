import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ call: vi.fn(), error: vi.fn() }));
vi.mock("@sapphire/framework", () => ({ container: { client: { duneApi: { call: mocks.call } }, logger: { error: mocks.error } } }));

import { executeServerAction } from "../../../../src/modules/server/operations/serverActions";

function interaction() {
  return { deferReply: vi.fn().mockResolvedValue(undefined), editReply: vi.fn().mockResolvedValue(undefined) };
}

describe("executeServerAction", () => {
  beforeEach(() => { mocks.call.mockReset(); mocks.error.mockReset(); });

  it("passes body and immediate-restart query options to the Console", async () => {
    mocks.call.mockResolvedValue({ queued: true, message: "Restart queued" });
    const subject = interaction();
    await executeServerAction(subject as never, "restart-service", { service: "dune-game" }, { restartQueue: "immediate" });
    expect(mocks.call).toHaveBeenCalledWith("POST", "/api/server/restart-service", { body: { service: "dune-game" }, query: { restartQueue: "immediate" } });
    expect(subject.deferReply).toHaveBeenCalledOnce();
    expect(subject.editReply).toHaveBeenCalledWith(expect.objectContaining({ allowedMentions: { parse: [] } }));
  });

  it("converts Console failures into an ephemeral result and audit log entry", async () => {
    const failure = new Error("409 restart conflict");
    mocks.call.mockRejectedValue(failure);
    const subject = interaction();
    await executeServerAction(subject as never, "restart-server");
    expect(mocks.error).toHaveBeenCalledWith("Unable to run /restart-server.", failure);
    expect(subject.editReply).toHaveBeenCalledOnce();
  });
});
