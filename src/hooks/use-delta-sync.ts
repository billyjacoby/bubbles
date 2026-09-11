"use client";

import { useCallback, useEffect, useRef } from "react";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import {
  queryMessagesSinceRowId,
  queryRecentMessages,
} from "@/lib/api/chats";
import {
  flattenFeed,
  upsertFeedMessage,
  upsertMessage,
  type MessagePages,
} from "@/lib/cache";
import { queryKeys } from "@/lib/query-keys";
import { deltaWindow } from "@/lib/sync";
import { useConnection } from "@/components/connection-provider";
import { useUiStore } from "@/store/ui-store";
import type { Message } from "@/lib/types";

const DELTA_PAGE_SIZE = 500;
/** Ceiling on a single catch-up, so a long absence cannot run unbounded. */
const MAX_DELTA_PAGES = 20;

/**
 * Fetch only what changed since the cached data was written.
 *
 * On a cold start the persisted cache is restored from IndexedDB and rendered
 * immediately; this then pulls the messages that arrived while the app was
 * closed, rather than refetching the whole conversation window.
 *
 * Runs on mount once restoration finishes, and again whenever the socket
 * reconnects — a dropped connection is exactly when messages get missed.
 */
export function useDeltaSync(): void {
  const conn = useConnection();
  const client = useQueryClient();
  const isRestoring = useIsRestoring();
  const socketConnected = useUiStore((s) => s.socketConnected);

  // Guards against overlapping runs: a reconnect during a slow catch-up would
  // otherwise issue the same queries twice.
  const running = useRef(false);

  const sync = useCallback(async () => {
    if (running.current) return;

    const feed = client.getQueryData<MessagePages>(queryKeys.conversations);
    const cached = flattenFeed(feed);
    const window = deltaWindow(cached);

    // Nothing cached — the normal initial query will populate the feed.
    if (window.kind === "none") return;

    running.current = true;
    useUiStore.getState().setSyncing(true);

    try {
      const collected: Message[] = [];

      for (let page = 0; page < MAX_DELTA_PAGES; page += 1) {
        const offset = page * DELTA_PAGE_SIZE;

        const batch =
          window.kind === "rowId"
            ? await queryMessagesSinceRowId(conn, window.startRowId, {
                offset,
                limit: DELTA_PAGE_SIZE,
              })
            : await queryRecentMessages(conn, {
                after: window.after,
                offset,
                limit: DELTA_PAGE_SIZE,
              });

        collected.push(...batch);
        if (batch.length < DELTA_PAGE_SIZE) break;
      }

      for (const message of collected) {
        // Writing to the feed reorders the sidebar and refreshes previews.
        upsertFeedMessage(client, message);

        // Threads that are not cached are left alone — upsertMessage is a no-op
        // when the query has no data, so unopened chats stay untouched.
        const chatGuid = message.chats?.[0]?.guid;
        if (chatGuid) upsertMessage(client, chatGuid, message);
      }
    } catch {
      // A failed catch-up is not worth interrupting the user: the socket keeps
      // the session live, and the next reconnect retries from the same
      // watermark.
    } finally {
      running.current = false;
      useUiStore.getState().setSyncing(false);
    }
  }, [conn, client]);

  // Wait for the persisted cache to land, or the watermark would be read from
  // an empty cache and the delta skipped.
  useEffect(() => {
    if (isRestoring) return;
    void sync();
  }, [isRestoring, sync]);

  useEffect(() => {
    if (isRestoring || !socketConnected) return;
    void sync();
  }, [isRestoring, socketConnected, sync]);
}
