"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LogOut, Pin, PinOff, RefreshCw, Search, WifiOff } from "lucide-react";
import { useConversations, type ConversationListItem } from "@/hooks/use-queries";
import { useUiStore } from "@/store/ui-store";
import { usePinStore, MAX_PINS } from "@/store/pin-store";
import { PinnedGrid } from "@/components/pinned-grid";
import { useNameResolver } from "@/hooks/use-contacts";
import { chatPreview, chatTitle } from "@/lib/message-utils";
import { conversationChat } from "@/lib/conversations";
import { formatListTimestamp } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

export function ChatList({ compact = false }: { compact?: boolean }) {
  const {
    conversations,
    pinned,
    unpinned,
    isPending,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useConversations();

  const [search, setSearch] = useState("");
  const resolve = useNameResolver();
  const params = useParams<{ guid?: string }>();
  const activeGuid = params?.guid ? decodeURIComponent(params.guid) : null;
  const socketConnected = useUiStore((s) => s.socketConnected);
  const syncing = useUiStore((s) => s.syncing);

  const searching = search.trim().length > 0;

  // Search spans both sections, so results come from the combined list and the
  // pinned grid is hidden while searching.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return unpinned;
    return conversations.filter((item) => {
      const chat = conversationChat(item);
      return `${chatTitle(chat, resolve)} ${chatPreview(chat, resolve)}`
        .toLowerCase()
        .includes(term);
    });
  }, [conversations, unpinned, search, resolve]);

  const visibleConversations = compact ? [...pinned, ...unpinned] : filtered;

  return (
    <>
      <header
        className={cn(
          "flex flex-col gap-3 border-b border-border p-3",
          compact && "hidden",
        )}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Messages</h1>
          <div className="flex items-center gap-2">
            {syncing ? (
              <span
                title="Catching up on new messages"
                className="flex items-center gap-1 text-xs text-muted"
              >
                <RefreshCw className="size-3.5 animate-spin" aria-hidden />
                Syncing
              </span>
            ) : null}
            {!socketConnected ? (
              <span
                title="Live updates are disconnected"
                className="flex items-center gap-1 text-xs text-muted"
              >
                <WifiOff className="size-3.5" aria-hidden />
                Offline
              </span>
            ) : null}
            <DisconnectButton />
          </div>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search loaded conversations"
            aria-label="Search conversations"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:border-accent"
          />
        </div>
      </header>

      <nav className="scrollbar-thin flex-1 overflow-y-auto">
        {isPending ? <ListMessage>Loading conversations…</ListMessage> : null}

        {error ? (
          <ListMessage tone="error">
            {error instanceof Error ? error.message : "Could not load chats."}
          </ListMessage>
        ) : null}

        {!compact && !searching ? (
          <PinnedGrid items={pinned} activeGuid={activeGuid} />
        ) : null}

        {!isPending && !error && visibleConversations.length === 0 ? (
          <ListMessage>
            {searching
              ? "No matching conversations."
              : pinned.length > 0
                ? "No other conversations."
                : "No conversations yet."}
          </ListMessage>
        ) : null}

        <ul>
          {visibleConversations.map((item) => (
            <li key={item.chat.guid}>
              <ChatRow
                item={item}
                active={item.chat.guid === activeGuid}
                compact={compact}
              />
            </li>
          ))}
        </ul>

        {!compact && !isPending && !error && hasNextPage ? (
          <div className="p-3">
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full rounded-lg border border-border px-3 py-2 text-xs text-muted hover:bg-surface-hover disabled:opacity-50"
            >
              {isFetchingNextPage ? "Loading…" : "Load older conversations"}
            </button>
          </div>
        ) : null}
      </nav>
    </>
  );
}

function ChatRow({
  item,
  active,
  compact,
}: {
  item: ConversationListItem;
  active: boolean;
  compact: boolean;
}) {
  const chat = conversationChat(item);
  const resolve = useNameResolver();
  const togglePin = usePinStore((s) => s.toggle);
  const pinCount = usePinStore((s) => s.pinned.length);
  const atPinLimit = !item.isPinned && pinCount >= MAX_PINS;
  const typing = useUiStore((s) => s.typingChats.has(chat.guid));
  const preview = typing ? "Typing…" : chatPreview(chat, resolve);
  const title = chatTitle(chat, resolve);

  if (compact) {
    return (
      <Link
        href={`/chats/${encodeURIComponent(chat.guid)}`}
        aria-current={active ? "page" : undefined}
        aria-label={title}
        title={title}
        className={cn(
          "flex justify-center py-2.5 transition-colors hover:bg-surface-hover",
          active && "bg-surface-hover",
        )}
      >
        <span className="relative">
          <Avatar
            chat={chat}
            className={cn(
              active && "ring-2 ring-accent ring-offset-2 ring-offset-surface",
            )}
          />
          {item.hasUnread ? (
            <span
              aria-label="Unread"
              className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-surface bg-accent"
            />
          ) : null}
        </span>
      </Link>
    );
  }

  return (
    // The pin control cannot live inside the link, so the row is a container
    // with the link and the control as siblings.
    <div
      className={cn(
        "group relative transition-colors",
        active ? "bg-surface-hover" : "hover:bg-surface-hover",
      )}
    >
      <Link
        href={`/chats/${encodeURIComponent(chat.guid)}`}
        aria-current={active ? "page" : undefined}
        className="flex items-center gap-3 py-2.5 pl-3 pr-10"
      >
        <Avatar chat={chat} />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1">
              {item.isPinned ? (
                <Pin
                  className="size-3 shrink-0 rotate-45 text-muted"
                  aria-hidden
                />
              ) : null}
              <span className="truncate text-sm font-medium">{title}</span>
            </span>
            <span className="shrink-0 text-[11px] text-muted">
              {formatListTimestamp(item.activity)}
            </span>
          </div>
          <span
            className={cn("truncate text-xs", typing ? "text-accent" : "text-muted")}
          >
            {preview}
          </span>
        </div>
      </Link>

      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
        {item.hasUnread ? (
          <span
            aria-label="Unread"
            className="size-2 rounded-full bg-accent group-hover:hidden"
          />
        ) : null}

        <button
          type="button"
          onClick={() => togglePin(chat.guid)}
          disabled={atPinLimit}
          aria-pressed={item.isPinned}
          title={
            atPinLimit
              ? `Unpin another conversation first (limit ${MAX_PINS})`
              : item.isPinned
                ? `Unpin ${title}`
                : `Pin ${title}`
          }
          aria-label={item.isPinned ? `Unpin ${title}` : `Pin ${title}`}
          className={cn(
            "rounded p-1 text-muted hover:bg-border hover:text-foreground",
            // Hidden until hover — and always reachable by keyboard.
            "hidden group-hover:block focus-visible:block",
            atPinLimit && "cursor-not-allowed opacity-40 hover:bg-transparent",
          )}
        >
          {item.isPinned ? (
            <PinOff className="size-3.5" aria-hidden />
          ) : (
            <Pin className="size-3.5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

function DisconnectButton() {
  const router = useRouter();

  async function disconnect() {
    await fetch("/api/session", { method: "DELETE" });
    router.replace("/setup");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void disconnect()}
      title="Disconnect from server"
      aria-label="Disconnect from server"
      className="rounded-md p-1 text-muted hover:bg-surface-hover hover:text-foreground"
    >
      <LogOut className="size-4" aria-hidden />
    </button>
  );
}

function ListMessage({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <p
      className={cn(
        "px-3 py-4 text-sm",
        tone === "error" ? "text-red-500" : "text-muted",
      )}
    >
      {children}
    </p>
  );
}
