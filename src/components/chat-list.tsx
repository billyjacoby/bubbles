"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { LogOut, Search, WifiOff } from "lucide-react";
import { useConversations, type ConversationListItem } from "@/hooks/use-queries";
import { useUiStore } from "@/store/ui-store";
import { useNameResolver } from "@/hooks/use-contacts";
import { chatPreview, chatTitle } from "@/lib/message-utils";
import { conversationChat } from "@/lib/conversations";
import { formatListTimestamp } from "@/lib/format";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

export function ChatList() {
  const {
    conversations,
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((item) => {
      const chat = conversationChat(item);
      return `${chatTitle(chat, resolve)} ${chatPreview(chat, resolve)}`
        .toLowerCase()
        .includes(term);
    });
  }, [conversations, search, resolve]);

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-border p-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Messages</h1>
          <div className="flex items-center gap-2">
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

        {!isPending && !error && filtered.length === 0 ? (
          <ListMessage>
            {search ? "No matching conversations." : "No conversations yet."}
          </ListMessage>
        ) : null}

        <ul>
          {filtered.map((item) => (
            <li key={item.chat.guid}>
              <ChatRow item={item} active={item.chat.guid === activeGuid} />
            </li>
          ))}
        </ul>

        {!isPending && !error && hasNextPage ? (
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
}: {
  item: ConversationListItem;
  active: boolean;
}) {
  const chat = conversationChat(item);
  const resolve = useNameResolver();
  const typing = useUiStore((s) => s.typingChats.has(chat.guid));
  const preview = typing ? "Typing…" : chatPreview(chat, resolve);

  return (
    <Link
      href={`/chats/${encodeURIComponent(chat.guid)}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 transition-colors",
        active ? "bg-surface-hover" : "hover:bg-surface-hover",
      )}
    >
      <Avatar chat={chat} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {chatTitle(chat, resolve)}
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

      {item.hasUnread ? (
        <span
          aria-label="Unread"
          className="size-2 shrink-0 rounded-full bg-accent"
        />
      ) : null}
    </Link>
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
