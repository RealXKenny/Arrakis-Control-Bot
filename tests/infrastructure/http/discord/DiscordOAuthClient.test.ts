import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscordOAuthClient } from "../../../../src/infrastructure/http/discord/DiscordOAuthClient";

const client = () => new DiscordOAuthClient("123456789012345678", "synthetic-secret", "https://dashboard.example/callback");
afterEach(() => vi.unstubAllGlobals());

describe("Discord OAuth transport", () => {
  it("builds an identify-only PKCE authorization URL", () => {
    const url = new URL(client().authorizationUrl("state", "challenge"));
    expect(url.origin).toBe("https://discord.com");
    expect(url.searchParams.get("scope")).toBe("identify");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state");
  });

  it("exchanges a code and reads only the verified Discord identity", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "synthetic-token", token_type: "Bearer" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "223456789012345678" })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await client().exchangeCode("code", "verifier")).toBe("223456789012345678");
    const [tokenUrl, tokenOptions] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe("https://discord.com/api/oauth2/token");
    expect(tokenOptions.redirect).toBe("error");
    expect(tokenOptions.body.get("code_verifier")).toBe("verifier");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer synthetic-token");
  });

  it("rejects insecure redirects and malformed or oversized responses", async () => {
    expect(() => new DiscordOAuthClient("123456789012345678", "secret", "http://dashboard.example/callback")).toThrow();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "bad token", token_type: "Bearer" })))
      .mockResolvedValueOnce(new Response("x".repeat(32_769)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(client().exchangeCode("code", "verifier")).rejects.toThrow("Invalid Discord OAuth response");
    await expect(client().exchangeCode("code", "verifier")).rejects.toThrow("too large");
  });
});
