import type { Message } from "@/lib/types";

/**
 * The chat.db row ID of a message.
 *
 * The server exposes this as `originalROWID` — its own `ROWID` column is not
 * serialised on `/message/query` responses. The raw-SQL `where` clause used for
 * incremental sync filters on `message.ROWID`, which is the same underlying
 * value, so this is what the watermark must be built from.
 */
export function messageRowId(message: Message): number | undefined {
  const rowId = message.ROWID ?? message.originalROWID;
  return typeof rowId === "number" ? rowId : undefined;
}

/**
 * Highest row ID present in a set of messages.
 *
 * This is the watermark for incremental sync. Returns 0 when no message
 * carries a usable row ID, which tells the caller to fall back to a
 * timestamp-based window.
 *
 * Optimistic messages are skipped: their row ID is absent, and a temporary
 * client-side record must never advance the watermark.
 */
export function newestRowId(messages: Message[]): number {
  let highest = 0;
  for (const message of messages) {
    if (message.guid?.startsWith("temp")) continue;
    const rowId = messageRowId(message);
    if (rowId !== undefined && rowId > highest) highest = rowId;
  }
  return highest;
}

/** Newest message timestamp, used when row IDs are unavailable. */
export function newestTimestamp(messages: Message[]): number {
  let newest = 0;
  for (const message of messages) {
    if (message.guid?.startsWith("temp")) continue;
    const date = message.dateCreated ?? 0;
    if (date > newest) newest = date;
  }
  return newest;
}

/**
 * Decide how to fetch the delta since the last sync.
 *
 * Prefers a row-ID window; falls back to a timestamp window when the cached
 * messages predate row IDs being stored, and reports `none` when there is
 * nothing cached to delta against — in which case a normal initial load runs.
 */
export type DeltaWindow =
  | { kind: "rowId"; startRowId: number }
  | { kind: "timestamp"; after: number }
  | { kind: "none" };

export function deltaWindow(messages: Message[]): DeltaWindow {
  if (messages.length === 0) return { kind: "none" };

  const rowId = newestRowId(messages);
  if (rowId > 0) return { kind: "rowId", startRowId: rowId };

  const after = newestTimestamp(messages);
  if (after > 0) return { kind: "timestamp", after };

  return { kind: "none" };
}
