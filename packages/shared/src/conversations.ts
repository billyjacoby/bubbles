import type { Chat, Message } from "./types.js";

/**
 * Ordering key for a message. Kept local so this module has no runtime
 * imports, which lets it be exercised directly by scripts/verify-conversations.
 */
const activityOf = (message: Message): number => message.dateCreated ?? 0;

export interface Conversation {
  chat: Chat;
  /** The newest message seen for this chat in the loaded window. */
  lastMessage: Message;
  /** Ordering key — the last message's timestamp. */
  activity: number;
}

/**
 * Is `candidate` a more complete chat record than `current`?
 *
 * Chat objects embedded in messages vary in completeness: an optimistic send
 * attaches only a GUID, while a server payload carries participants and a
 * display name. Always keep the richest version.
 */
function isRicher(candidate: Chat, current: Chat): boolean {
  const score = (c: Chat) =>
    (c.participants?.length ? 2 : 0) +
    (c.displayName ? 1 : 0) +
    (c.style !== undefined ? 1 : 0);
  return score(candidate) > score(current);
}

/**
 * Build an ordered conversation list from a flat, newest-first message feed.
 *
 * The server cannot give us a correctly ordered chat list — `/chat/query`
 * applies its sort per page rather than globally — so recency is derived from
 * the messages themselves.
 *
 * Only conversations with a message inside the loaded window appear; loading
 * further back surfaces older ones.
 */
export function deriveConversations(messages: Message[]): Conversation[] {
  const byGuid = new Map<string, Conversation>();

  for (const message of messages) {
    const chat = message.chats?.[0];
    if (!chat?.guid) continue;

    const activity = activityOf(message);
    const existing = byGuid.get(chat.guid);

    if (!existing) {
      byGuid.set(chat.guid, { chat, lastMessage: message, activity });
      continue;
    }

    // Keep the newest message as the preview, but never downgrade the chat
    // record just because the newest message carried a thinner copy of it.
    if (activity > existing.activity) {
      existing.lastMessage = message;
      existing.activity = activity;
    }
    if (isRicher(chat, existing.chat)) {
      existing.chat = { ...chat, ...existing.chat, ...chat };
    }
  }

  return [...byGuid.values()].sort((a, b) => b.activity - a.activity);
}

/**
 * Attach the derived last message to the chat record, so existing helpers that
 * read `chat.lastMessage` (titles, previews) keep working unchanged.
 */
export function conversationChat(conversation: Conversation): Chat {
  return { ...conversation.chat, lastMessage: conversation.lastMessage };
}

/**
 * Split conversations into the pinned grid and the list below it.
 *
 * Pinned conversations are removed from the list entirely, as in Messages — a
 * pinned chat appears in the grid only, never twice.
 *
 * Pin order is positional and independent of activity, so a pinned
 * conversation holds its place whether or not it has new messages. Everything
 * else keeps its existing recency order.
 *
 * A pinned GUID with no matching conversation is skipped rather than dropped
 * from the pin list — it may simply be outside the loaded message window, and
 * reappears in place once the feed reaches it.
 */
export function partitionPins<T extends { chat: Chat }>(
  conversations: T[],
  pinnedGuids: string[],
): { pinned: T[]; unpinned: T[] } {
  if (pinnedGuids.length === 0) {
    return { pinned: [], unpinned: conversations };
  }

  const byGuid = new Map(conversations.map((c) => [c.chat.guid, c]));
  const pinnedSet = new Set(pinnedGuids);

  // Built by walking the pin list, so grid order follows the user's ordering
  // rather than the feed's.
  const pinned = pinnedGuids
    .map((guid) => byGuid.get(guid))
    .filter((c): c is T => c !== undefined);

  const unpinned = conversations.filter((c) => !pinnedSet.has(c.chat.guid));

  return { pinned, unpinned };
}
