"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { SendHorizontal } from "lucide-react";
import { useSendMessage, useTypingIndicator } from "@/hooks/use-send-message";
import { cn } from "@/lib/utils";
import type { ChatService } from "@bubbles/shared";

const MAX_ROWS = 6;

export function Composer({
  chatGuid,
  service,
}: {
  chatGuid: string;
  service: ChatService | null;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const send = useSendMessage(chatGuid);
  const typing = useTypingIndicator(chatGuid);
  const isSms = service === "SMS";

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
    el.style.height = `${Math.min(el.scrollHeight, lineHeight * MAX_ROWS)}px`;
  }

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;

    // Clear optimistically so typing can continue while the request is inflight.
    setText("");
    setError(null);
    requestAnimationFrame(resize);
    typing.stop();

    try {
      await send.mutateAsync({ text: trimmed });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message failed to send.");
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function onFormSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  return (
    <form
      onSubmit={onFormSubmit}
      className="flex flex-col gap-1 border-t border-border bg-background px-3 py-2.5"
    >
      {error ? (
        <p role="alert" className="px-1 text-xs text-red-500">
          {error}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          placeholder={isSms ? "SMS" : "iMessage"}
          aria-label="Message"
          onChange={(e) => {
            setText(e.target.value);
            resize();
            if (e.target.value) typing.start();
            else typing.stop();
          }}
          onKeyDown={onKeyDown}
          onBlur={typing.stop}
          className="max-h-40 min-h-9 flex-1 resize-none rounded-2xl border border-border bg-surface px-3.5 py-2 text-sm outline-none focus:border-accent"
        />

        <button
          type="submit"
          disabled={!text.trim() || send.isPending}
          aria-label="Send message"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full transition-opacity",
            isSms
              ? "bg-bubble-out-sms text-bubble-out-sms-fg"
              : "bg-bubble-out text-bubble-out-fg",
            (!text.trim() || send.isPending) && "opacity-40",
          )}
        >
          <SendHorizontal className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}
