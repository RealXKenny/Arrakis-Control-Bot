import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DashboardOAuthService } from "../../../src/modules/dashboard/dashboardOAuth";

function setup() {
  const transactions = { create: vi.fn().mockResolvedValue(undefined), consume: vi.fn().mockResolvedValue("v".repeat(43)) };
  const sessions = { create: vi.fn().mockResolvedValue("session-token") };
  const identity = { authorizationUrl: vi.fn().mockReturnValue("https://discord.example/authorize"),
    exchangeCode: vi.fn().mockResolvedValue("123456789012345678") };
  return { service: new DashboardOAuthService(transactions, sessions, identity), transactions, sessions, identity };
}

describe("dashboard OAuth coordination", () => {
  it("creates independent state and PKCE verifier and exchanges a valid callback", async () => {
    const { service, transactions, sessions, identity } = setup();
    const { state, url } = await service.begin();
    const verifier = transactions.create.mock.calls[0][1] as string;
    expect(state).not.toBe(verifier);
    expect(identity.authorizationUrl).toHaveBeenCalledWith(state, createHash("sha256").update(verifier).digest("base64url"));
    expect(url).toBe("https://discord.example/authorize");
    expect(await service.complete(state, state, "code")).toBe("session-token");
    expect(transactions.consume).toHaveBeenCalledWith(state);
    expect(identity.exchangeCode).toHaveBeenCalledWith("code", "v".repeat(43));
    expect(sessions.create).toHaveBeenCalledWith("123456789012345678", 604800);
    expect(transactions.consume.mock.invocationCallOrder[0]).toBeLessThan(identity.exchangeCode.mock.invocationCallOrder[0]);
  });

  it("rejects a mismatched browser state without consuming or exchanging it", async () => {
    const { service, transactions, identity } = setup();
    await expect(service.complete("a".repeat(43), "b".repeat(43), "code")).rejects.toThrow("Invalid OAuth callback");
    expect(transactions.consume).not.toHaveBeenCalled();
    expect(identity.exchangeCode).not.toHaveBeenCalled();
  });

  it("does not exchange a replayed transaction or create a session on provider failure", async () => {
    const { service, transactions, identity, sessions } = setup();
    transactions.consume.mockResolvedValueOnce(null);
    await expect(service.complete("a".repeat(43), "a".repeat(43), "code")).rejects.toThrow("already used");
    expect(identity.exchangeCode).not.toHaveBeenCalled();
    identity.exchangeCode.mockRejectedValueOnce(new Error("offline"));
    await expect(service.complete("a".repeat(43), "a".repeat(43), "code")).rejects.toThrow("offline");
    expect(sessions.create).not.toHaveBeenCalled();
  });
});
