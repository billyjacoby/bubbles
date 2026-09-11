import { queryContacts } from "@/lib/api/contacts";
import { addressKeys, buildContactIndex, lookupContact } from "@/lib/contacts";
import type { Connection } from "@/lib/types";

/**
 * Coalescing window. Every Avatar that mounts in the same tick asks for its
 * photo independently; these are gathered into one request.
 */
const BATCH_WINDOW_MS = 50;

/**
 * Addresses per request. Measured against a real server: 10 avatars is ~780KB
 * in ~570ms and 30 is ~3MB in ~1.4s, so this keeps a single request around a
 * megabyte and a half.
 */
const MAX_BATCH = 20;

interface Waiter {
  resolve: (avatar: string | null) => void;
  reject: (error: unknown) => void;
}

interface PendingEntry {
  address: string;
  waiters: Waiter[];
}

const pending = new Map<string, PendingEntry>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(conn: Connection): Promise<void> {
  timer = null;

  const batch = [...pending.entries()].slice(0, MAX_BATCH);
  if (batch.length === 0) return;
  for (const [key] of batch) pending.delete(key);

  try {
    const contacts = await queryContacts(
      conn,
      batch.map(([, entry]) => entry.address),
      { withAvatars: true },
    );

    // Reuse the same matching rules as name resolution, so an avatar and a name
    // can never disagree about which contact an address belongs to.
    const index = buildContactIndex(contacts);

    for (const [, entry] of batch) {
      const avatar = lookupContact(index, entry.address)?.avatar ?? null;
      for (const waiter of entry.waiters) waiter.resolve(avatar);
    }
  } catch (error) {
    for (const [, entry] of batch) {
      for (const waiter of entry.waiters) waiter.reject(error);
    }
  }

  // Anything that arrived while the request was in flight.
  if (pending.size > 0) schedule(conn);
}

function schedule(conn: Connection): void {
  if (timer) return;
  // A full batch goes immediately; otherwise wait for stragglers.
  const delay = pending.size >= MAX_BATCH ? 0 : BATCH_WINDOW_MS;
  timer = setTimeout(() => void flush(conn), delay);
}

/**
 * Fetch one contact's photo, batched with any others requested at the same
 * time.
 *
 * Returns null when the contact has no photo — distinct from undefined, which
 * React Query rejects as a query result.
 */
export function loadContactAvatar(
  conn: Connection,
  address: string,
): Promise<string | null> {
  const key = addressKeys(address)[0];
  if (!key) return Promise.resolve(null);

  return new Promise<string | null>((resolve, reject) => {
    const entry = pending.get(key) ?? { address, waiters: [] };
    entry.waiters.push({ resolve, reject });
    pending.set(key, entry);
    schedule(conn);
  });
}
