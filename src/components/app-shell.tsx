"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { ChatList } from "@/components/chat-list";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { useDeltaSync } from "@/hooks/use-delta-sync";
import { useUiStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  // One socket for the whole app, owned by the shell.
  useRealtimeSync();
  // Catch up on anything missed while the app was closed or disconnected.
  useDeltaSync();

  const params = useParams<{ guid?: string }>();
  const hasThread = Boolean(params?.guid);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);

  // Collapsing is only meaningful with a thread on screen — otherwise it would
  // leave an empty window with no way back to the conversation list.
  const isCollapsed = hasThread && collapsed;

  return (
    <div className="flex h-full">
      <aside
        id="conversation-sidebar"
        aria-hidden={isCollapsed}
        className={cn(
          "flex shrink-0 flex-col overflow-hidden border-border bg-surface transition-[width] duration-200 ease-out",
          isCollapsed ? "w-0 border-r-0" : "w-80 border-r",
        )}
      >
        {/* Kept mounted while collapsed so scroll position and search survive. */}
        <div className="flex h-full w-80 flex-col">
          <ChatList />
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
