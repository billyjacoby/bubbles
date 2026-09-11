import CryptoJS from "crypto-js";
import { io, type Socket } from "socket.io-client";
import type { Chat, Connection, Message } from "@/lib/types";

/** Wire envelope used by newer servers; older ones send the payload bare. */
interface ServerPayload {
  type?: string;
  subtype?: string | null;
  encrypted?: boolean;
  partial?: boolean;
  encoding?: "JSON_OBJECT" | "BASE64" | "JSON_STRING";
  encryptionType?: string;
  data?: unknown;
}

/**
 * Unwrap a socket payload.
 *
 * Servers vary: the body may be the object itself, a JSON string, or an
 * AES-encrypted blob keyed on the server password. Normalise all three.
 */
export function decodePayload<T>(raw: unknown, password: string): T | null {
  if (raw === null || raw === undefined) return null;

  let envelope: ServerPayload;
  if (typeof raw === "string") {
    try {
      envelope = JSON.parse(raw) as ServerPayload;
    } catch {
      return null;
    }
  } else {
    envelope = raw as ServerPayload;
  }

  // Legacy payloads have no `data` wrapper — the envelope *is* the payload.
  let data: unknown = "data" in envelope ? envelope.data : envelope;

  if (envelope.encrypted === true && typeof data === "string") {
    try {
      data = CryptoJS.AES.decrypt(data, password).toString(CryptoJS.enc.Utf8);
    } catch {
      return null;
    }
  }

  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      // A plain string payload is legitimate for some events.
      return data as T;
    }
  }

  return (data ?? null) as T | null;
}

/** Payload of `new-message` / `updated-message`. */
export type MessageEvent = Message & { chats?: Chat[]; tempGuid?: string };

export interface TypingEvent {
  /** Note: the server names this `guid`, not `chatGuid`. */
  guid: string;
  display: boolean;
}

export interface ReadStatusEvent {
  chatGuid: string;
  read: boolean;
}

export interface ChatsEvent {
  chats: Chat[];
}

export interface SocketHandlers {
  onNewMessage?: (message: MessageEvent) => void;
  onUpdatedMessage?: (message: MessageEvent) => void;
  onTyping?: (event: TypingEvent) => void;
  onReadStatus?: (event: ReadStatusEvent) => void;
  onChatsChanged?: (event: ChatsEvent) => void;
  onConnectionChange?: (connected: boolean) => void;
}

/**
 * Open a socket.io connection to the BlueBubbles server.
 *
 * Reconnection is deliberately uncapped: socket.io stops retrying permanently
 * once a finite `reconnectionAttempts` budget is exhausted, which would leave
 * the client silently stale after a long server outage.
 */
export function connectSocket(
  conn: Connection,
  handlers: SocketHandlers,
): Socket {
  const socket = io(conn.serverUrl, {
    query: { guid: conn.password },
    transports: ["websocket", "polling"],
    forceNew: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 60_000,
  });

  const decode = <T,>(raw: unknown) => decodePayload<T>(raw, conn.password);

  socket.on("connect", () => handlers.onConnectionChange?.(true));
  socket.on("disconnect", () => handlers.onConnectionChange?.(false));
  socket.on("connect_error", () => handlers.onConnectionChange?.(false));

  socket.on("new-message", (raw) => {
    const message = decode<MessageEvent>(raw);
    if (message?.guid) handlers.onNewMessage?.(message);
  });

  socket.on("updated-message", (raw) => {
    const message = decode<MessageEvent>(raw);
    if (message?.guid) handlers.onUpdatedMessage?.(message);
  });

  socket.on("typing-indicator", (raw) => {
    const event = decode<TypingEvent>(raw);
    if (event?.guid) handlers.onTyping?.(event);
  });

  socket.on("chat-read-status-changed", (raw) => {
    const event = decode<ReadStatusEvent>(raw);
    if (event?.chatGuid) handlers.onReadStatus?.(event);
  });

  for (const event of [
    "group-name-change",
    "participant-added",
    "participant-removed",
    "participant-left",
  ]) {
    socket.on(event, (raw) => {
      const payload = decode<ChatsEvent>(raw);
      if (payload?.chats?.length) handlers.onChatsChanged?.(payload);
    });
  }

  return socket;
}
