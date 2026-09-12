"use client";

import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { Message } from "@bubbles/shared";

export type MessagePages = InfiniteData<Message[], number>;

/**
 * Insert or replace a message inside paged query data.
 *
 * Matching is by GUID first, then by `tempGuid` — the latter is how an
 * optimistic bubble gets reconciled with the server's real record, whether that
 * record arrives via the HTTP response or the socket echo.
 *
 * Returns the same reference when nothing changed so React Query can skip the
 * re-render.
 */
function upsertIntoPages(
  existing: MessagePages | undefined,
  message: Message & { tempGuid?: string },
): MessagePages | undefined {
  if (!existing) return existing;

  const candidateGuids = new Set(
    [message.guid, message.tempGuid].filter(Boolean) as string[],
  );

  let replaced = false;
  const pages = existing.pages.map((page) =>
    page.map((current) => {
      if (replaced) return current;
      if (!candidateGuids.has(current.guid)) return current;
      replaced = true;
      // Merge rather than overwrite: `updated-message` payloads are partial and
      // would otherwise drop attachments, handles or chats already loaded.
      return { ...current, ...message, guid: message.guid };
    }),
  );

  if (replaced) return { ...existing, pages };

  // New message — the first page holds the newest entries.
  const [first = [], ...rest] = pages;
  return { ...existing, pages: [[message, ...first], ...rest] };
}

/** Update a single conversation's thread. */
export function upsertMessage(
  client: QueryClient,
  chatGuid: string,
  message: Message & { tempGuid?: string },
): void {
  client.setQueryData<MessagePages>(queryKeys.messages(chatGuid), (existing) =>
    upsertIntoPages(existing, message),
  );
}

/**
 * Update the global conversation feed.
 *
 * The sidebar is derived from this feed, so writing the message here is what
 * moves a conversation to the top and refreshes its preview — there is no
 * separate chat list to keep in step.
 */
export function upsertFeedMessage(
  client: QueryClient,
  message: Message & { tempGuid?: string },
): void {
  client.setQueryData<MessagePages>(queryKeys.conversations, (existing) =>
    upsertIntoPages(existing, message),
  );
}

/** Flatten a per-chat thread into a single oldest-to-newest list. */
export function flattenMessages(data: MessagePages | undefined): Message[] {
  if (!data) return [];
  // Pages are newest-first and each page is itself newest-first.
  return data.pages.flat().slice().reverse();
}

/** Flatten the conversation feed, preserving its newest-first order. */
export function flattenFeed(data: MessagePages | undefined): Message[] {
  return data ? data.pages.flat() : [];
}
