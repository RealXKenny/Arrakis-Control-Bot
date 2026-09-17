import { randomUUID } from "node:crypto";

export function encodeMapChat(funcomId: string, message: string, displayName?: string): { id: string; body: Buffer } {
  const id = randomUUID().replaceAll("-", "").toUpperCase();
  const payload = {
    m_Id: id,
    m_ChannelType: "Map",
    m_SubChannelId: "",
    m_bUseSpoofedUserName: Boolean(displayName),
    m_SpoofedUserNameFrom: { m_TableId: "", m_Key: "", m_UnlocalizedName: displayName ?? "" },
    m_FuncomIdFrom: funcomId,
    m_UserNameTo: "",
    m_Message: { m_UnlocalizedMessage: message, m_LocalizedMessage: { m_TableId: "", m_Key: "", m_FormatArgs: [] } },
    m_Timestamp: new Date().toISOString().slice(0, 19).replaceAll("-", ".").replace("T", "-").replaceAll(":", "."),
    m_OriginLocation: { X: 0, Y: 0, Z: 0 },
    m_HasSeenMessage: false,
  };
  // The supplied game protocol requires decimal tokens, which JSON.stringify otherwise normalizes to integers.
  const content = JSON.stringify(payload).replace('"m_OriginLocation":{"X":0,"Y":0,"Z":0}', '"m_OriginLocation":{"X":0.0,"Y":0.0,"Z":0.0}');
  return { id, body: Buffer.from(JSON.stringify({ Type: "TextChat", content })) };
}

export function decodeMapChat(body: Buffer): { id: string; sender: string; text: string } | null {
  if (body.length > 64 * 1024) return null;
  try {
    const envelope = JSON.parse(body.toString("utf8"));
    if (envelope?.Type !== "TextChat") return null;
    const raw = envelope.content ?? envelope.Content;
    const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (payload?.m_ChannelType !== "Map" || payload.m_UserNameTo) return null;
    if (typeof payload.m_FuncomIdFrom !== "string" || !payload.m_FuncomIdFrom.trim()
      || typeof payload.m_Message?.m_UnlocalizedMessage !== "string" || !payload.m_Message.m_UnlocalizedMessage.trim()
      || typeof payload.m_Id !== "string" || !payload.m_Id) return null;
    return { id: payload.m_Id, sender: payload.m_FuncomIdFrom, text: payload.m_Message.m_UnlocalizedMessage };
  } catch {
    return null;
  }
}
