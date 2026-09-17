// Classify errors without echoing broker text, URLs, credentials or certificate details.
export function describeChatConnectionError(error: unknown): string {
  if (!error || typeof error !== "object") return "Unrecognized failure; inspect the RabbitMQ server logs.";
  const value = error as { code?: unknown; message?: unknown; errors?: unknown };
  if (Array.isArray(value.errors) && value.errors.length) {
    return [...new Set(value.errors.slice(0, 4).map(describeChatConnectionError))].join(" ");
  }
  const descriptions: Record<string, string> = {
    ECONNREFUSED: "ECONNREFUSED: the host refused the connection; check the AMQP listener and published port.",
    ETIMEDOUT: "ETIMEDOUT: connection timed out; check routing and firewall access from the bot machine.",
    ENOTFOUND: "ENOTFOUND: broker hostname could not be resolved.",
    EAI_AGAIN: "EAI_AGAIN: temporary DNS lookup failure.",
    EHOSTUNREACH: "EHOSTUNREACH: broker host is unreachable from the bot machine.",
    ENETUNREACH: "ENETUNREACH: broker network is unreachable from the bot machine.",
    ECONNRESET: "ECONNRESET: peer reset the connection; check that the port and AMQP/TLS protocol match, and inspect broker logs.",
    ERR_TLS_CERT_ALTNAME_INVALID: "ERR_TLS_CERT_ALTNAME_INVALID: broker hostname does not match its TLS certificate.",
    DEPTH_ZERO_SELF_SIGNED_CERT: "DEPTH_ZERO_SELF_SIGNED_CERT: configure RABBITMQ_CA_FILE with the trusted broker CA certificate.",
    SELF_SIGNED_CERT_IN_CHAIN: "SELF_SIGNED_CERT_IN_CHAIN: configure RABBITMQ_CA_FILE with the trusted broker CA certificate.",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "UNABLE_TO_VERIFY_LEAF_SIGNATURE: TLS certificate chain is incomplete or its CA is not trusted.",
    UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY: configure the broker CA certificate with RABBITMQ_CA_FILE.",
    CERT_HAS_EXPIRED: "CERT_HAS_EXPIRED: renew the expired TLS certificate.",
    ERR_SSL_WRONG_VERSION_NUMBER: "ERR_SSL_WRONG_VERSION_NUMBER: the endpoint may be a plaintext or HTTP port; verify the AMQPS listener port.",
    ENOENT: "ENOENT: the configured CA certificate file was not found on the bot machine.",
    EACCES: "EACCES: access denied to a local file or socket; check CA file permissions.",
    "403": "ACCESS_REFUSED (403): authentication or resource access was refused; check the password, URL encoding and vhost permissions.",
    "404": "NOT_FOUND (404): the requested broker resource does not exist; verify the game vhost and chat.map exchange.",
    "530": "NOT_ALLOWED (530): broker refused the operation; verify the vhost exists and inspect broker logs.",
  };
  const code = typeof value.code === "string" || typeof value.code === "number" ? String(value.code) : "";
  if (Object.hasOwn(descriptions, code)) return descriptions[code];
  const message = typeof value.message === "string" ? value.message : "";
  if (/ACCESS_REFUSED|\b403\b|login was refused/i.test(message)) return descriptions["403"];
  if (/NOT_FOUND|\b404\b/i.test(message)) return descriptions["404"];
  if (/NOT_ALLOWED|\b530\b/i.test(message)) return descriptions["530"];
  if (/wrong version number/i.test(message)) return descriptions.ERR_SSL_WRONG_VERSION_NUMBER;
  if (/handshake|opening handshake/i.test(message)) return "AMQP handshake failed; verify the listener protocol and inspect the broker authentication logs.";
  if (/timed?\s*out|timeout/i.test(message)) return descriptions.ETIMEDOUT;
  return "Unrecognized failure; inspect the RabbitMQ server logs.";
}
