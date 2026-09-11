import type {
  AttributedBody,
  Chat,
  Handle,
  Message,
  MessageSummaryInfo,
} from "@/lib/types";

/** The server sometimes returns a bare object where an array is documented. */
function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function attributedBodies(message: Message): AttributedBody[] {
  return toArray(message.attributedBody);
}

/**
 * The visible text of a message.
 *
 * `attributedBody` is authoritative when present — on modern macOS the plain
 * `text` column can be stale or empty even though the message has content.
 * Object-replacement characters (U+FFFC) stand in for inline attachments and
 * are stripped.
 */
export function messageText(message: Message): string {
  const body = attributedBodies(message)[0];
  const raw = body?.string ?? message.text ?? "";
  return raw.replace(/\uFFFC/g, "").replace(/\uFFFD/g, "").trim();
}

/** Optimistic bubbles are the ones still carrying their client-side temp GUID. */
export function isSending(message: Message): boolean {
  return message.isFromMe && message.guid.startsWith("temp");
}

export function hasFailed(message: Message): boolean {
  return (message.error ?? 0) > 0;
}

export function isSticker(message: Message): boolean {
  return (
    message.associatedMessageType === "sticker" &&
    Boolean(message.associatedMessageGuid)
  );
}

/** Tapbacks are rendered on their parent bubble, never as their own row. */
export function isReaction(message: Message): boolean {
  const type = message.associatedMessageType;
  if (!type || type === "sticker") return false;
  return Boolean(message.associatedMessageGuid);
}

/** Group renames, photo changes and similar render as centred system text. */
export function isSystemEvent(message: Message): boolean {
  const itemType = message.itemType ?? 0;
  return itemType === 2 || (itemType === 3 && (message.groupActionType ?? 0) > 0);
}

export function isReply(message: Message): boolean {
  return Boolean(message.threadOriginatorGuid);
}

/** The part of the parent message a reply is threaded to. */
export function replyPartIndex(message: Message): number {
  const part = message.threadOriginatorPart?.split(":")[0];
  const parsed = Number.parseInt(part ?? "", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Strip the server's positional prefixes off an associated-message GUID.
 * The raw value looks like `p:0/ABC-123` or `bp:ABC-123`.
 */
export function parseAssociatedGuid(raw: string | null | undefined): {
  guid: string | null;
  part: number;
} {
  if (!raw) return { guid: null, part: 0 };
  const withoutPrefix = raw.startsWith("bp:") ? raw.slice(3) : raw;
  const segments = withoutPrefix.split("/");
  const guid = segments[segments.length - 1] || null;

  let part = 0;
  const partMatch = /^p:(\d+)\//.exec(withoutPrefix);
  if (partMatch) part = Number.parseInt(partMatch[1], 10);

  return { guid, part };
}

function summaryInfo(message: Message): MessageSummaryInfo | undefined {
  return message.messageSummaryInfo?.[0];
}

/** A message whose only part was unsent should render as "Message deleted". */
export function isUnsent(message: Message): boolean {
  const info = summaryInfo(message);
  const retracted = info?.retractedParts ?? info?.rp ?? [];
  return retracted.length > 0 && Boolean(message.dateEdited);
}

export function isEdited(message: Message): boolean {
  return Boolean(message.dateEdited) && !isUnsent(message);
}

export function isGroup(chat: Chat): boolean {
  if (chat.style === 43) return true;
  if (chat.style === 45) return false;
  return (chat.participants?.length ?? 0) > 1;
}

/** The address portion of a chat GUID, e.g. `iMessage;-;+15551234567`. */
export function chatAddress(chat: Chat): string | null {
  const parts = chat.guid.split(";");
  return parts.length >= 3 ? parts.slice(2).join(";") : null;
}

/** Pretty-print a US-style phone number; pass anything else through. */
export function formatAddress(address: string): string {
  if (address.startsWith("urn:biz")) return "Business";
  if (address.includes("@")) return address;

  const digits = address.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return address;
}

export function handleName(handle: Handle, resolve?: NameResolver): string {
  return (
    resolve?.(handle.address) ||
    handle.formattedAddress?.trim() ||
    formatAddress(handle.address) ||
    "Unknown"
  );
}

/**
 * Resolves a raw handle address to a contact name, returning undefined when the
 * address is unknown. Supplied by the contacts layer; display helpers stay pure
 * so they remain directly testable.
 */
export type NameResolver = (address: string) => string | undefined;

/** Human label for a chat: explicit name, else the participant list. */
export function chatTitle(chat: Chat, resolve?: NameResolver): string {
  const explicit = chat.displayName?.trim();
  if (explicit) return explicit;

  const participants = chat.participants ?? [];
  if (participants.length > 0) {
    return participants.map((p) => handleName(p, resolve)).join(", ");
  }

  // One-on-one chats often come back with no participants, so fall back to the
  // address embedded in the chat GUID.
  const address = chatAddress(chat);
  if (!address) return chat.chatIdentifier || "Unknown";
  return resolve?.(address) || formatAddress(address);
}

export function chatInitials(chat: Chat, resolve?: NameResolver): string {
  const title = chatTitle(chat, resolve);
  const words = title.split(/[\s,]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (/^[\d(+]/.test(title)) return "#";
  return words
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** One-line preview for the sidebar. */
export function chatPreview(chat: Chat, resolve?: NameResolver): string {
  const last = chat.lastMessage;
  if (!last) return "No messages";

  if (isUnsent(last)) return "Message deleted";
  if (isSystemEvent(last)) return systemEventText(last, resolve);

  const text = messageText(last);
  if (text) return last.isFromMe ? `You: ${text}` : text;
  if (last.hasAttachments) return last.isFromMe ? "You: Attachment" : "Attachment";
  return "";
}

export function systemEventText(
  message: Message,
  resolve?: NameResolver,
): string {
  const who = message.isFromMe
    ? "You"
    : message.handle
      ? handleName(message.handle, resolve)
      : "Someone";
  if (message.itemType === 2) {
    return `${who} named the conversation "${message.groupTitle ?? ""}"`;
  }
  if (message.itemType === 3) {
    return message.groupActionType === 2
      ? `${who} removed the group photo`
      : `${who} changed the group photo`;
  }
  return "";
}

/** Sort key: most recently active chat first. */
export function chatSortKey(chat: Chat): number {
  return chat.lastMessage?.dateCreated ?? 0;
}

export function messageSortKey(message: Message): number {
  return message.dateCreated ?? 0;
}
