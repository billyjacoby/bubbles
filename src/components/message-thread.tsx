"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useMessages } from "@/hooks/use-queries";
import { useMarkRead } from "@/hooks/use-send-message";
import { flattenMessages } from "@/lib/cache";
import { buildThread } from "@/lib/thread";
import { formatDivider } from "@/lib/format";
import { systemEventText } from "@/lib/message-utils";
import { MessageBubble } from "@/components/message-bubble";
import { useUiStore } from "@/store/ui-store";
import { useNameResolver } from "@/hooks/use-contacts";

/** How close to the bottom counts as "following" the conversation. */
const PIN_THRESHOLD_PX = 200;

export function MessageThread({ chatGuid }: { chatGuid: string }) {
  const { data, isPending, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useMessages(chatGuid);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const markRead = useMarkRead(chatGuid);
  const resolve = useNameResolver();
  const typing = useUiStore((s) => s.typingChats.has(chatGuid));

  const messages = useMemo(() => flattenMessages(data), [data]);
  const items = useMemo(() => buildThread(messages), [messages]);

  const messageCount = messages.length;
  const latestGuid = messages[messageCount - 1]?.guid;
  const pageCount = data?.pages.length ?? 0;

  /** Which chat has had its initial jump-to-bottom applied. */
  const pinnedFor = useRef<string | null>(null);
  /** Whether the user is currently following the bottom of the thread. */
  const following = useRef(true);
  const previousHeight = useRef(0);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    previousHeight.current = el.scrollHeight;
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    following.current = distance < PIN_THRESHOLD_PX;
  }, []);

  // Switching conversations resets the follow state; the jump itself waits
  // until messages exist, since the container is empty until then.
  useEffect(() => {
    following.current = true;
    previousHeight.current = 0;
  }, [chatGuid]);

  // Initial landing position: pinned to the newest message. This is keyed on
  // the message count as well as the chat, because on first render the thread
  // is still loading and there is nothing to scroll to yet.
  useLayoutEffect(() => {
    if (messageCount === 0) return;
    if (pinnedFor.current === chatGuid) return;
    pinnedFor.current = chatGuid;
    scrollToBottom();
  }, [chatGuid, messageCount, scrollToBottom]);

  // Follow new messages, but only if the user has not scrolled away to read
  // history.
  useLayoutEffect(() => {
    if (pinnedFor.current !== chatGuid) return;
    if (following.current) scrollToBottom();
  }, [chatGuid, latestGuid, typing, scrollToBottom]);

  // Preserve reading position when older pages prepend above the viewport.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (following.current) return;
    if (previousHeight.current && el.scrollHeight > previousHeight.current) {
      el.scrollTop += el.scrollHeight - previousHeight.current;
    }
    previousHeight.current = el.scrollHeight;
  }, [pageCount]);

  // Images and videos resolve their height after layout, which would otherwise
  // leave the thread short of the bottom on first paint.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new ResizeObserver(() => {
      if (pinnedFor.current !== chatGuid) return;
      if (following.current) scrollToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [chatGuid, scrollToBottom]);

  useEffect(() => {
    if (messageCount > 0) markRead();
  }, [chatGuid, latestGuid, messageCount, markRead]);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="scrollbar-thin flex-1 overflow-y-auto px-4 py-3"
    >
      {/* The container stays mounted across loading and error states so the
          scroll position is never lost to a remount. */}
      <div ref={contentRef}>
        {error ? (
          <Centered tone="error">
            {error instanceof Error ? error.message : "Could not load messages."}
          </Centered>
        ) : null}

        {isPending ? <Centered>Loading messages…</Centered> : null}

        {!isPending && !error && messageCount === 0 ? (
          <Centered>No messages yet. Say something.</Centered>
        ) : null}

        {hasNextPage ? (
          <div className="flex justify-center pb-3">
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:bg-surface-hover disabled:opacity-50"
            >
              {isFetchingNextPage ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          {items.map((item) => {
            if (item.kind === "divider") {
              return (
                <p
                  key={item.id}
                  className="py-2 text-center text-[11px] font-medium text-muted"
                >
                  {formatDivider(item.timestamp)}
                </p>
              );
            }

            if (item.kind === "system") {
              return (
                <p key={item.id} className="py-1 text-center text-[11px] text-muted">
                  {systemEventText(item.message, resolve)}
                </p>
              );
            }

            return <MessageBubble key={item.id} {...item} />;
          })}
        </div>

        {typing ? <p className="px-1 pt-2 text-xs text-muted">Typing…</p> : null}
      </div>
    </div>
  );
}

function Centered({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div className="flex items-center justify-center p-6">
      <p className={tone === "error" ? "text-sm text-red-500" : "text-sm text-muted"}>
        {children}
      </p>
    </div>
  );
}
