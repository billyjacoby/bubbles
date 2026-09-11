"use client";

import { AlertCircle } from "lucide-react";
import { AttachmentView } from "@/components/attachment-view";
import { REACTION_EMOJI } from "@/lib/constants";
import { formatTime } from "@/lib/format";
import {
  handleName,
  hasFailed,
  isEdited,
  isSending,
  isUnsent,
  messageService,
  messageText,
  type ChatService,
} from "@/lib/message-utils";
import { useNameResolver } from "@/hooks/use-contacts";
import { cn } from "@/lib/utils";
import type { Message, ReactionType } from "@/lib/types";

export interface RenderedMessage {
  message: Message;
  /** Tapbacks targeting this message, already grouped out of the main list. */
  reactions: Message[];
  /** The message being replied to, when it is loaded. */
  replyTo?: Message;
  /** Whether to show the sender name (groups, first of a run). */
  showSender: boolean;
  /** Whether this is the last bubble in a run from the same sender. */
  isTail: boolean;
  /** Current chat service, used when optimistic messages lack handle metadata. */
  service?: ChatService | null;
}

export function MessageBubble({
  message,
  reactions,
  replyTo,
  showSender,
  isTail,
  service,
}: RenderedMessage) {
  const resolve = useNameResolver();
  const fromMe = message.isFromMe;
  const text = messageText(message);
  const attachments = message.attachments ?? [];
  const unsent = isUnsent(message);
  const failed = hasFailed(message);
  const sending = isSending(message);
  const isSms = (messageService(message) ?? service) === "SMS";

  return (
    <div
      className={cn(
        "flex flex-col gap-0.5",
        fromMe ? "items-end" : "items-start",
      )}
    >
      {showSender && !fromMe && message.handle ? (
        <span className="px-3 text-[11px] text-muted">
          {handleName(message.handle, resolve)}
        </span>
      ) : null}

      {replyTo ? (
        <span
          className={cn(
            "max-w-[70%] truncate rounded-full bg-surface px-3 py-1 text-[11px] text-muted",
            fromMe ? "mr-1" : "ml-1",
          )}
        >
          ↪ {messageText(replyTo) || "Attachment"}
        </span>
      ) : null}

      <div className={cn("relative max-w-[70%]", reactions.length > 0 && "mt-3")}>
        {attachments.length > 0 ? (
          <div
            className={cn(
              "mb-1 flex flex-col gap-1",
              fromMe ? "items-end" : "items-start",
            )}
          >
            {attachments.map((attachment) => (
              <AttachmentView key={attachment.guid} attachment={attachment} />
            ))}
          </div>
        ) : null}

        {text || unsent ? (
          <div
            className={cn(
              "w-fit whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
              fromMe && isSms
                ? "ml-auto bg-bubble-out-sms text-bubble-out-sms-fg"
                : fromMe
                  ? "ml-auto bg-bubble-out text-bubble-out-fg"
                  : "bg-bubble-in text-bubble-in-fg",
              sending && "opacity-60",
              unsent && "border border-border bg-transparent italic text-muted",
              isTail && (fromMe ? "rounded-br-md" : "rounded-bl-md"),
            )}
          >
            {message.subject ? (
              <span className="block font-semibold">{message.subject}</span>
            ) : null}
            {unsent ? "This message was unsent" : text}
          </div>
        ) : null}

        {reactions.length > 0 ? (
          <ReactionPips reactions={reactions} fromMe={fromMe} />
        ) : null}
      </div>

      <span
        className={cn(
          "px-1 text-[10px]",
          failed ? "text-red-500" : "text-muted",
        )}
      >
        {failed ? (
          <span className="inline-flex items-center gap-1">
            <AlertCircle className="size-3" aria-hidden />
            Not delivered
          </span>
        ) : sending ? (
          "Sending…"
        ) : (
          <>
            {formatTime(message.dateCreated)}
            {isEdited(message) ? " · Edited" : ""}
            {fromMe && message.dateRead ? " · Read" : ""}
          </>
        )}
      </span>
    </div>
  );
}

function ReactionPips({
  reactions,
  fromMe,
}: {
  reactions: Message[];
  fromMe: boolean;
}) {
  // Collapse duplicates: one pip per reaction type, regardless of sender count.
  const types = Array.from(
    new Set(
      reactions
        .map((r) => r.associatedMessageType)
        .filter((t): t is string => Boolean(t) && !t!.startsWith("-")),
    ),
  );
  if (types.length === 0) return null;

  return (
    <div
      className={cn(
        "absolute -top-3 flex gap-0.5",
        fromMe ? "left-0 -translate-x-1/3" : "right-0 translate-x-1/3",
      )}
    >
      {types.map((type) => (
        <span
          key={type}
          className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[11px] leading-none shadow-sm"
        >
          {REACTION_EMOJI[type as ReactionType] ?? "•"}
        </span>
      ))}
    </div>
  );
}
