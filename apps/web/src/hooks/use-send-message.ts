"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { makeTempGuid, resolveSendMethod, sendText } from "@bubbles/shared";
import { markChatRead, setTyping } from "@bubbles/shared";
import { upsertFeedMessage, upsertMessage } from "@/lib/cache";
import { useConnection } from "@/components/connection-provider";
import { useServerInfo, useChat } from "@/hooks/use-queries";
import { useUiStore } from "@/store/ui-store";
import type { Message } from "@bubbles/shared";

export function useSendMessage(chatGuid: string) {
  const conn = useConnection();
  const client = useQueryClient();
  const { data: serverInfo } = useServerInfo();
  const conversation = useChat(chatGuid);

  return useMutation({
    mutationFn: async ({
      text,
      replyToGuid,
    }: {
      text: string;
      replyToGuid?: string | null;
    }) => {
      const tempGuid = makeTempGuid();

      const method = resolveSendMethod(
        { selectedMessageGuid: replyToGuid },
        Boolean(serverInfo?.private_api),
      );

      // Render the bubble immediately; the socket echo or the HTTP response
      // will replace it via the matching tempGuid. The chat record is attached
      // so the sidebar can reorder without waiting for the server.
      const optimistic: Message = {
        guid: tempGuid,
        text,
        isFromMe: true,
        dateCreated: Date.now(),
        threadOriginatorGuid: replyToGuid ?? null,
        chats: [conversation?.chat ?? { guid: chatGuid }],
      };
      upsertMessage(client, chatGuid, optimistic);
      upsertFeedMessage(client, optimistic);

      try {
        const saved = await sendText(conn, {
          chatGuid,
          message: text,
          tempGuid,
          method,
          selectedMessageGuid: replyToGuid ?? null,
          partIndex: replyToGuid ? 0 : null,
        });
        // The response omits `chats`; keep the optimistic copy so the message
        // stays attached to its conversation in the feed.
        const reconciled = { ...saved, tempGuid, chats: optimistic.chats };
        upsertMessage(client, chatGuid, reconciled);
        upsertFeedMessage(client, reconciled);
        return saved;
      } catch (error) {
        // Leave the bubble in place but flag it, so the text is not lost.
        const failed = { ...optimistic, error: 1 };
        upsertMessage(client, chatGuid, failed);
        upsertFeedMessage(client, failed);
        throw error;
      }
    },
  });
}

/** POST /chat/:guid/read, fire-and-forget. */
export function useMarkRead(chatGuid: string | null) {
  const conn = useConnection();

  return useCallback(() => {
    if (!chatGuid) return;
    useUiStore.getState().setUnread(chatGuid, false);
    void markChatRead(conn, chatGuid).catch(() => {
      // A failed read receipt is not worth surfacing to the user.
    });
  }, [conn, chatGuid]);
}

const TYPING_STOP_DELAY_MS = 5_000;

/**
 * Broadcast typing state, debounced.
 *
 * Only the Private API helper can deliver typing indicators; without it the
 * calls are skipped entirely rather than erroring on every keystroke.
 */
export function useTypingIndicator(chatGuid: string | null) {
  const conn = useConnection();
  const { data: serverInfo } = useServerInfo();
  const enabled = Boolean(serverInfo?.private_api) && Boolean(chatGuid);

  const activeRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (!activeRef.current || !chatGuid) return;
    activeRef.current = false;
    void setTyping(conn, chatGuid, false).catch(() => {});
  }, [conn, chatGuid]);

  const start = useCallback(() => {
    if (!enabled || !chatGuid) return;

    if (!activeRef.current) {
      activeRef.current = true;
      void setTyping(conn, chatGuid, true).catch(() => {});
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(stop, TYPING_STOP_DELAY_MS);
  }, [enabled, conn, chatGuid, stop]);

  // Switching chats or unmounting must clear the indicator on the other end.
  useEffect(() => stop, [stop]);

  return { start, stop };
}
