"use client";

import { PanelLeft, PanelLeftClose, Pin, PinOff } from "lucide-react";
import { useChat } from "@/hooks/use-queries";
import { chatService, chatTitle, isGroup } from "@bubbles/shared";
import { conversationChat } from "@bubbles/shared";
import { Avatar } from "@/components/avatar";
import { Composer } from "@/components/composer";
import { MessageThread } from "@/components/message-thread";
import { useNameResolver } from "@/hooks/use-contacts";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";
import { usePinStore, MAX_PINS } from "@/store/pin-store";

export function ChatView({ chatGuid }: { chatGuid: string }) {
  const conversation = useChat(chatGuid);
  const resolve = useNameResolver();
  const chat = conversation ? conversationChat(conversation) : null;
  const service = chatService(chat ?? { guid: chatGuid });

  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const togglePin = usePinStore((s) => s.toggle);
  const isPinned = usePinStore((s) => s.pinned.includes(chatGuid));
  const pinCount = usePinStore((s) => s.pinned.length);
  const atPinLimit = !isPinned && pinCount >= MAX_PINS;

  return (
    <>
      <header className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-expanded={!collapsed}
          aria-controls="conversation-sidebar"
          title={collapsed ? "Show conversations" : "Hide conversations"}
          aria-label={collapsed ? "Show conversations" : "Hide conversations"}
          className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-foreground"
        >
          {collapsed ? (
            <PanelLeft className="size-4" aria-hidden />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden />
          )}
        </button>

        {chat ? <Avatar chat={chat} className="size-8" /> : null}

        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-sm font-semibold">
            {chat ? chatTitle(chat, resolve) : "Conversation"}
          </h2>
          {chat && isGroup(chat) ? (
            <span className="text-[11px] text-muted">
              {chat.participants?.length ?? 0} people
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => togglePin(chatGuid)}
          disabled={atPinLimit}
          aria-pressed={isPinned}
          title={
            atPinLimit
              ? `Unpin another conversation first (limit ${MAX_PINS})`
              : isPinned
                ? "Unpin conversation"
                : "Pin conversation"
          }
          aria-label={isPinned ? "Unpin conversation" : "Pin conversation"}
          className={cn(
            "ml-auto rounded-md p-1.5 hover:bg-surface-hover",
            isPinned ? "text-accent" : "text-muted hover:text-foreground",
            atPinLimit && "cursor-not-allowed opacity-40 hover:bg-transparent",
          )}
        >
          {isPinned ? (
            <PinOff className="size-4" aria-hidden />
          ) : (
            <Pin className="size-4" aria-hidden />
          )}
        </button>
      </header>

      <MessageThread chatGuid={chatGuid} service={service} />
      <Composer chatGuid={chatGuid} service={service} />
    </>
  );
}
