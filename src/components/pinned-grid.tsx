"use client";

import Link from "next/link";
import { useState, type DragEvent } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { conversationChat } from "@/lib/conversations";
import { chatTitle, messageText } from "@/lib/message-utils";
import { useNameResolver } from "@/hooks/use-contacts";
import { usePinStore } from "@/store/pin-store";
import { useUiStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";
import type { ConversationListItem } from "@/hooks/use-queries";

/**
 * The pinned conversation grid, modelled on Messages.
 *
 * Pinned chats render as large circular avatars above the list rather than as
 * list rows, and are removed from the list below. A new incoming message
 * surfaces as a bubble floating above its avatar.
 */
export function PinnedGrid({
  items,
  activeGuid,
}: {
  items: ConversationListItem[];
  activeGuid: string | null;
}) {
  const reorder = usePinStore((s) => s.reorder);
  const [draggingGuid, setDraggingGuid] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  function onDrop(event: DragEvent, index: number) {
    event.preventDefault();
    const guid = event.dataTransfer.getData("text/plain");
    if (guid) reorder(guid, index);
    setDraggingGuid(null);
    setOverIndex(null);
  }

  return (
    <div className="border-b border-border p-3">
      <ul className="grid grid-cols-4 gap-x-1 gap-y-3">
        {items.map((item, index) => (
          <li
            key={item.chat.guid}
            onDragOver={(event) => {
              // Required for the element to be a valid drop target.
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setOverIndex(index);
            }}
            onDragLeave={() => setOverIndex((c) => (c === index ? null : c))}
            onDrop={(event) => onDrop(event, index)}
            className={cn(
              "rounded-lg transition-colors",
              overIndex === index && draggingGuid !== item.chat.guid
                ? "bg-surface-hover"
                : undefined,
            )}
          >
            <PinnedTile
              item={item}
              active={item.chat.guid === activeGuid}
              dragging={draggingGuid === item.chat.guid}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", item.chat.guid);
                event.dataTransfer.effectAllowed = "move";
                setDraggingGuid(item.chat.guid);
              }}
              onDragEnd={() => {
                setDraggingGuid(null);
                setOverIndex(null);
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PinnedTile({
  item,
  active,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  item: ConversationListItem;
  active: boolean;
  dragging: boolean;
  onDragStart: (event: DragEvent) => void;
  onDragEnd: () => void;
}) {
  const chat = conversationChat(item);
  const resolve = useNameResolver();
  const unpin = usePinStore((s) => s.toggle);
  const typing = useUiStore((s) => s.typingChats.has(chat.guid));

  const title = chatTitle(chat, resolve);
  // Only the first name, as Messages does — full names do not fit under a tile.
  const shortName = title.split(/[\s,]+/)[0] ?? title;

  // A bubble floats above the avatar for something genuinely new: someone
  // typing, or an unread message from them.
  const incomingPreview =
    !item.lastMessage.isFromMe && item.hasUnread
      ? messageText(item.lastMessage) ||
        (item.lastMessage.hasAttachments ? "Attachment" : "")
      : "";
  const bubbleText = typing ? "···" : incomingPreview;

  return (
    <div
      className={cn("group relative flex flex-col items-center", dragging && "opacity-40")}
    >
      {bubbleText ? (
        <div
          className={cn(
            "pointer-events-none absolute -top-1 left-1/2 z-10 max-w-[92px] -translate-x-1/2",
            "truncate rounded-xl rounded-bl-sm bg-bubble-in px-2 py-1",
            "text-[10px] leading-tight text-bubble-in-fg shadow-sm",
          )}
        >
          {bubbleText}
        </div>
      ) : null}

      <Link
        href={`/chats/${encodeURIComponent(chat.guid)}`}
        aria-current={active ? "page" : undefined}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title={title}
        className="flex w-full flex-col items-center gap-1 pt-3"
      >
        <span className="relative">
          <Avatar
            chat={chat}
            className={cn(
              "size-14 text-base",
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

        <span className="w-full truncate text-center text-[11px] text-muted">
          {shortName}
        </span>
      </Link>

      <button
        type="button"
        onClick={() => unpin(chat.guid)}
        title={`Unpin ${title}`}
        aria-label={`Unpin ${title}`}
        className={cn(
          "absolute right-0 top-2 rounded-full bg-border p-0.5 text-foreground",
          "hidden group-hover:block focus-visible:block",
        )}
      >
        <X className="size-3" aria-hidden />
      </button>
    </div>
  );
}
