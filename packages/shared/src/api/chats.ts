import { requestData, request } from "./client.js";
import type { Chat, Connection, Message, ServerInfo } from "../types.js";

/** `with` options accepted by the chat endpoints. */
export const CHAT_WITH = ["participants", "lastMessage"] as const;

/**
 * `with` options for the conversation feed.
 *
 * `chats.participants` is what lets the sidebar render names without a second
 * round trip, and `attributedBody` carries the real preview text.
 */
export const FEED_WITH = [
  "chats",
  "chats.participants",
  "attributedBody",
  "handle",
] as const;

/**
 * `with` options for message queries. `attributedBody` is what carries the real
 * text on modern macOS, so it is not optional in practice.
 */
export const MESSAGE_WITH = [
  "attachment",
  "handle",
  "message.attributedBody",
  "message.messageSummaryInfo",
  "message.payloadData",
] as const;

export async function ping(conn: Connection): Promise<boolean> {
  const data = await requestData<{ message?: string } | string>(conn, "/ping");
  const message = typeof data === "string" ? data : data?.message;
  return message === "pong";
}

export function getServerInfo(conn: Connection): Promise<ServerInfo> {
  return requestData<ServerInfo>(conn, "/server/info");
}

export interface ChatQueryParams {
  offset?: number;
  limit?: number;
  /** "lastmessage" sorts by most recent activity. */
  sort?: "lastmessage" | null;
}

/**
 * Raw chat listing.
 *
 * WARNING: do not use this to build an ordered conversation list. The server
 * applies `sort` *after* `LIMIT/OFFSET`, so each page is sorted only within
 * itself and page membership is decided by row ID. A recently-active chat can
 * therefore sit near the end of the list. Use `queryRecentMessages` and derive
 * the conversation list from messages instead.
 *
 * This remains useful for looking up a single chat's metadata or counting.
 */
export async function queryChats(
  conn: Connection,
  { offset = 0, limit = 100, sort = "lastmessage" }: ChatQueryParams = {},
): Promise<{ chats: Chat[]; total?: number }> {
  const envelope = await request<Chat[]>(conn, "/chat/query", {
    method: "POST",
    body: { with: [...CHAT_WITH], offset, limit, sort },
  });
  return { chats: envelope.data ?? [], total: envelope.metadata?.total };
}

export interface RecentMessagesParams {
  offset?: number;
  limit?: number;
  /** ms since epoch */
  after?: number;
  before?: number;
}

/**
 * The newest messages across every conversation, newest first.
 *
 * This is the basis of the conversation list: ordering comes from the messages
 * themselves rather than the server's unreliable `lastmessage` join, which is
 * unpopulated for roughly half of all chats.
 */
export async function queryRecentMessages(
  conn: Connection,
  { offset = 0, limit = 1000, after, before }: RecentMessagesParams = {},
): Promise<Message[]> {
  const envelope = await request<Message[]>(conn, "/message/query", {
    method: "POST",
    body: {
      with: [...FEED_WITH],
      sort: "DESC",
      offset,
      limit,
      after: after ?? null,
      before: before ?? null,
    },
  });
  return envelope.data ?? [];
}

/**
 * Messages added since a known row ID — the incremental sync query.
 *
 * Row ID rather than a timestamp because it is monotonic: messages sharing a
 * millisecond cannot be skipped, and a server clock adjustment cannot cause the
 * window to miss anything. `where` takes raw SQL fragments with named args.
 */
export async function queryMessagesSinceRowId(
  conn: Connection,
  startRowId: number,
  { offset = 0, limit = 500 }: { offset?: number; limit?: number } = {},
): Promise<Message[]> {
  const envelope = await request<Message[]>(conn, "/message/query", {
    method: "POST",
    body: {
      with: [...FEED_WITH],
      where: [
        {
          statement: "message.ROWID > :startRowId",
          args: { startRowId },
        },
      ],
      sort: "DESC",
      offset,
      limit,
    },
  });
  return envelope.data ?? [];
}

export function getChat(conn: Connection, guid: string): Promise<Chat> {
  return requestData<Chat>(conn, `/chat/${encodeURIComponent(guid)}`, {
    // GET endpoints take `with` as a comma-joined string with no spaces.
    query: { with: "participants,lastmessage" },
  });
}

export interface ChatMessagesParams {
  offset?: number;
  limit?: number;
  sort?: "DESC" | "ASC";
  /** ms since epoch */
  before?: number;
  after?: number;
}

export function getChatMessages(
  conn: Connection,
  guid: string,
  { offset = 0, limit = 50, sort = "DESC", before, after }: ChatMessagesParams = {},
): Promise<Message[]> {
  return requestData<Message[]>(
    conn,
    `/chat/${encodeURIComponent(guid)}/message`,
    { query: { with: MESSAGE_WITH.join(","), sort, before, after, offset, limit } },
  );
}

export function markChatRead(conn: Connection, guid: string): Promise<unknown> {
  return requestData(conn, `/chat/${encodeURIComponent(guid)}/read`, {
    method: "POST",
  });
}

export function markChatUnread(conn: Connection, guid: string): Promise<unknown> {
  return requestData(conn, `/chat/${encodeURIComponent(guid)}/unread`, {
    method: "POST",
  });
}

export function setTyping(
  conn: Connection,
  guid: string,
  typing: boolean,
): Promise<unknown> {
  return requestData(conn, `/chat/${encodeURIComponent(guid)}/typing`, {
    method: typing ? "POST" : "DELETE",
  });
}
