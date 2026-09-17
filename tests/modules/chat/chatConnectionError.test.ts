import { describe, expect, it } from "vitest";
import { describeChatConnectionError } from "../../../src/infrastructure/amqp/chatConnectionError";

describe("safe RabbitMQ diagnostics", () => {
  it.each([
    ["ECONNREFUSED", "listener"],
    ["ETIMEDOUT", "firewall"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "hostname"],
    ["DEPTH_ZERO_SELF_SIGNED_CERT", "RABBITMQ_CA_FILE"],
    ["ERR_SSL_WRONG_VERSION_NUMBER", "plaintext"],
    [403, "ACCESS_REFUSED"],
    [404, "chat.map"],
  ])("classifies %s without exposing raw error text", (code, expected) => {
    const output = describeChatConnectionError({ code, message: "amqps://user:Top%40Secret@host/ Top@Secret" });
    expect(output).toContain(expected);
    expect(output).not.toContain("Secret");
    expect(output).not.toContain("amqps://");
  });

  it("recognizes authentication failures reported only in message text", () => {
    expect(describeChatConnectionError(new Error("Handshake terminated: 403 ACCESS_REFUSED user:secret"))).toContain("ACCESS_REFUSED");
  });

  it("summarizes aggregate connection errors and suppresses unknown values", () => {
    expect(describeChatConnectionError(new AggregateError([{ code: "ECONNREFUSED" }, { code: "ETIMEDOUT" }]))).toContain("ETIMEDOUT");
    for (const error of [null, "password", new Error("secret"), { code: "password" }, { code: "__proto__" }]) {
      expect(describeChatConnectionError(error)).toBe("Unrecognized failure; inspect the RabbitMQ server logs.");
    }
  });
});
