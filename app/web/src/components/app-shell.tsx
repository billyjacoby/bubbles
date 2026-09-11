"use client";

import { useParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChatList } from "@/components/chat-list";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { useDeltaSync } from "@/hooks/use-delta-sync";
import { useUiStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";

const SIDEBAR_WIDTH_KEY = "bubbles-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 72;
const MAX_SIDEBAR_WIDTH = 560;
const COMPACT_SIDEBAR_WIDTH = 160;
const KEYBOARD_RESIZE_STEP = 16;

function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

export function AppShell({ children }: { children: ReactNode }) {
  // One socket for the whole app, owned by the shell.
  useRealtimeSync();
  // Catch up on anything missed while the app was closed or disconnected.
  useDeltaSync();

  const params = useParams<{ guid?: string }>();
  const hasThread = Boolean(params?.guid);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [resizing, setResizing] = useState(false);
  const resizingRef = useRef(false);
  const dragStart = useRef({ pointerX: 0, width: DEFAULT_SIDEBAR_WIDTH });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = Number.parseFloat(
        localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? "",
      );
      if (Number.isFinite(stored)) setSidebarWidth(clampSidebarWidth(stored));
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Collapsing is only meaningful with a thread on screen — otherwise it would
  // leave an empty window with no way back to the conversation list.
  const isCollapsed = hasThread && collapsed;
  const isCompact = sidebarWidth <= COMPACT_SIDEBAR_WIDTH;

  function saveSidebarWidth(width: number) {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    let next = sidebarWidth;
    if (event.key === "ArrowLeft") next -= KEYBOARD_RESIZE_STEP;
    else if (event.key === "ArrowRight") next += KEYBOARD_RESIZE_STEP;
    else if (event.key === "Home") next = MIN_SIDEBAR_WIDTH;
    else if (event.key === "End") next = MAX_SIDEBAR_WIDTH;
    else return;

    event.preventDefault();
    const clamped = clampSidebarWidth(next);
    setSidebarWidth(clamped);
    saveSidebarWidth(clamped);
  }

  function startResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { pointerX: event.clientX, width: sidebarWidth };
    resizingRef.current = true;
    setResizing(true);
  }

  function continueResize(event: PointerEvent<HTMLDivElement>) {
    if (!resizingRef.current) return;
    const delta = event.clientX - dragStart.current.pointerX;
    setSidebarWidth(clampSidebarWidth(dragStart.current.width + delta));
  }

  function stopResize(event: PointerEvent<HTMLDivElement>) {
    if (!resizingRef.current) return;
    const delta = event.clientX - dragStart.current.pointerX;
    const finalWidth = clampSidebarWidth(dragStart.current.width + delta);
    resizingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setSidebarWidth(finalWidth);
    setResizing(false);
    saveSidebarWidth(finalWidth);
  }

  return (
    <div className={cn("flex h-full", resizing && "cursor-col-resize select-none")}>
      <aside
        id="conversation-sidebar"
        aria-hidden={isCollapsed}
        style={{ width: isCollapsed ? 0 : sidebarWidth }}
        className={cn(
          "relative flex shrink-0 flex-col overflow-hidden border-border bg-surface",
          !resizing && "transition-[width] duration-200 ease-out",
          isCollapsed ? "border-r-0" : "border-r",
        )}
      >
        {/* Kept mounted while collapsed so scroll position and search survive. */}
        <div className="flex h-full flex-col" style={{ width: sidebarWidth }}>
          <ChatList compact={isCompact} />
        </div>

        {!isCollapsed ? (
          <div
            role="separator"
            aria-label="Resize conversation sidebar"
            aria-orientation="vertical"
            aria-valuemin={MIN_SIDEBAR_WIDTH}
            aria-valuemax={MAX_SIDEBAR_WIDTH}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onKeyDown={resizeWithKeyboard}
            onPointerDown={startResize}
            onPointerMove={continueResize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
            className={cn(
              "absolute inset-y-0 right-0 z-20 w-1 cursor-col-resize touch-none outline-none",
              "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent",
              "hover:after:bg-accent focus-visible:after:bg-accent",
              resizing && "after:bg-accent",
            )}
          />
        ) : null}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
