import { randomUUID } from "node:crypto";

import { isRecord } from "../../shared/validation/isRecord";

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
  // Dev note: The game insists on decimal robes, even when the number underneath is whole.
  const content = JSON.stringify(payload).replace('"m_OriginLocation":{"X":0,"Y":0,"Z":0}', '"m_OriginLocation":{"X":0.0,"Y":0.0,"Z":0.0}');
  return { id, body: Buffer.from(JSON.stringify({ Type: "TextChat", content })) };
}

export function decodeMapChat(body: Buffer): { id: string; sender: string; text: string } | null {
  if (body.length > 64 * 1024) return null;
  try {
    const envelope: unknown = JSON.parse(body.toString("utf8"));
    if (!isRecord(envelope) || envelope.Type !== "TextChat") return null;
    const raw = envelope.content ?? envelope.Content;
    const payload: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!isRecord(payload) || payload.m_ChannelType !== "Map" || payload.m_UserNameTo) return null;
    const message = isRecord(payload.m_Message) ? payload.m_Message.m_UnlocalizedMessage : undefined;
    const sender = payload.m_FuncomIdFrom;
    const id = payload.m_Id;
    if (typeof sender !== "string" || !sender.trim() || typeof message !== "string" || !message.trim() || typeof id !== "string" || !id) return null;
    return { id, sender, text: message };
  } catch {
    return null;
  }
}
