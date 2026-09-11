"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { chatAddress, chatInitials, isGroup } from "@/lib/message-utils";
import { useContactLookup, useNameResolver } from "@/hooks/use-contacts";
import type { Chat } from "@/lib/types";

/**
 * Conversation avatar: the contact's photo when one is known, otherwise
 * initials derived from the resolved name.
 *
 * Group chats always fall back to initials — the server exposes a group icon
 * per chat, but fetching one per row would cost a request each.
 */
export function Avatar({ chat, className }: { chat: Chat; className?: string }) {
  const lookup = useContactLookup();
  const resolve = useNameResolver();
  const [imageFailed, setImageFailed] = useState(false);

  const contact = isGroup(chat) ? undefined : lookup(chatAddress(chat));
  const initials = chatInitials(chat, resolve);

  const base =
    "flex size-10 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-border text-xs font-semibold text-muted";

  if (contact?.avatar && !imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={contact.avatar}
        alt=""
        aria-hidden
        onError={() => setImageFailed(true)}
        className={cn(base, "object-cover", className)}
      />
    );
  }

  return (
    <div aria-hidden className={cn(base, className)}>
      {initials}
    </div>
  );
}
