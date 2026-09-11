"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectSocket, type MessageEvent } from "@bubbles/shared";
import { upsertFeedMessage, upsertMessage } from "@/lib/cache";
import { useConnection } from "@/components/connection-provider";
import { useUiStore } from "@/store/ui-store";
import { isReaction } from "@bubbles/shared";

/**
 * Keep the query cache in sync with server-pushed events.
 *
 * Mounted once, at the authenticated layout level, so a single socket serves
 * the whole app.
 */
export function useRealtimeSync(): void {
  const conn = useConnection();
  const client = useQueryClient();

  useEffect(() => {
    const applyMessage = (message: MessageEvent, isNew: boolean) => {
      const chatGuid = message.chats?.[0]?.guid;
      if (!chatGuid) return;

      upsertMessage(client, chatGuid, message);

      // Writing to the feed is what reorders the sidebar and refreshes the
      // preview, since the conversation list is derived from it.
      upsertFeedMessage(client, message);

      // Tapbacks attach to an existing bubble; they should not mark a
      // conversation unread.
      if (isNew && !message.isFromMe && !isReaction(message)) {
        useUiStore.getState().setUnread(chatGuid, true);
      }
    };

    const socket = connectSocket(conn, {
      onConnectionChange: (connected) =>
        useUiStore.getState().setSocketConnected(connected),

      onNewMessage: (message) => applyMessage(message, true),
      onUpdatedMessage: (message) => applyMessage(message, false),

      onTyping: (event) =>
        useUiStore.getState().setTyping(event.guid, event.display),

      onReadStatus: (event) =>
        useUiStore.getState().setUnread(event.chatGuid, !event.read),

      onChatsChanged: () => {
        // Group renames and membership changes alter chat metadata embedded in
        // the feed; a refetch is the simplest way to pick them up.
        void client.invalidateQueries({ queryKey: ["conversations"] });
      },
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      useUiStore.getState().setSocketConnected(false);
    };
  }, [conn, client]);
}
