"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useChat } from "@/hooks/use-queries";
import { chatTitle, isGroup } from "@/lib/message-utils";
import { conversationChat } from "@/lib/conversations";
import { Avatar } from "@/components/avatar";
import { Composer } from "@/components/composer";
import { MessageThread } from "@/components/message-thread";
import { useNameResolver } from "@/hooks/use-contacts";
import { useUiStore } from "@/store/ui-store";

export function ChatView({ chatGuid }: { chatGuid: string }) {
  const conversation = useChat(chatGuid);
  const resolve = useNameResolver();
  const chat = conversation ? conversationChat(conversation) : null;

  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

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
      </header>

      <MessageThread chatGuid={chatGuid} />
      <Composer chatGuid={chatGuid} />
    </>
  );
}
