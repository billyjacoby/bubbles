"use client";

import { useMemo } from "react";
import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import {
  getChatMessages,
  getServerInfo,
  queryRecentMessages,
} from "@/lib/api/chats";
import { queryKeys } from "@/lib/query-keys";
import { flattenFeed } from "@/lib/cache";
import { deriveConversations, type Conversation } from "@/lib/conversations";
import { useConnection } from "@/components/connection-provider";
import { useUiStore } from "@/store/ui-store";
import type { Message } from "@/lib/types";

/**
 * Messages pulled per page of the conversation feed.
 *
 * Conversations are discovered by scanning messages, so this trades payload
 * size against how many distinct chats appear. Roughly 1000 messages surfaces
 * a month of activity on a busy account, in about a second.
 */
const FEED_PAGE_SIZE = 1000;
const MESSAGE_PAGE_SIZE = 50;

export function useServerInfo() {
  const conn = useConnection();
  return useQuery({
    queryKey: queryKeys.serverInfo,
    queryFn: () => getServerInfo(conn),
    staleTime: 5 * 60_000,
  });
}

/**
 * The conversation feed: newest messages across all chats.
 *
 * The sidebar is derived from this rather than `/chat/query`, which cannot
 * produce a correctly ordered list — see `queryChats` for the details.
 */
export function useConversationFeed() {
  const conn = useConnection();

  return useInfiniteQuery<
    Message[],
    Error,
    InfiniteData<Message[], number>,
    readonly unknown[],
    number
  >({
    queryKey: queryKeys.conversations,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      queryRecentMessages(conn, { offset: pageParam, limit: FEED_PAGE_SIZE }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < FEED_PAGE_SIZE
        ? undefined
        : allPages.length * FEED_PAGE_SIZE,
  });
}

export interface ConversationListItem extends Conversation {
  hasUnread: boolean;
}

/** The ordered sidebar list, with locally-tracked unread state applied. */
export function useConversations() {
  const query = useConversationFeed();
  const unreadOverrides = useUiStore((s) => s.unread);

  const conversations = useMemo(() => {
    const derived = deriveConversations(flattenFeed(query.data));
    return derived.map<ConversationListItem>((conversation) => {
      const override = unreadOverrides[conversation.chat.guid];
      return {
        ...conversation,
        hasUnread: override ?? conversation.chat.hasUnreadMessage ?? false,
      };
    });
  }, [query.data, unreadOverrides]);

  return { ...query, conversations };
}

/** Look up one conversation's chat record from the loaded feed. */
export function useChat(chatGuid: string | null) {
  const { conversations } = useConversations();
  return useMemo(
    () => conversations.find((c) => c.chat.guid === chatGuid),
    [conversations, chatGuid],
  );
}

/**
 * Messages for a chat, paged backwards through history.
 *
 * The server returns newest-first; pages are flattened and reversed at the call
 * site so the thread renders oldest-to-newest.
 */
export function useMessages(chatGuid: string | null) {
  const conn = useConnection();

  return useInfiniteQuery<
    Message[],
    Error,
    InfiniteData<Message[], number>,
    readonly unknown[],
    number
  >({
    queryKey: queryKeys.messages(chatGuid ?? ""),
    enabled: Boolean(chatGuid),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getChatMessages(conn, chatGuid!, {
        offset: pageParam,
        limit: MESSAGE_PAGE_SIZE,
        sort: "DESC",
      }),
    getNextPageParam: (lastPage, allPages) =>
      // A short page means we have reached the start of the conversation.
      lastPage.length < MESSAGE_PAGE_SIZE
        ? undefined
        : allPages.length * MESSAGE_PAGE_SIZE,
  });
}
