import { get, set, del } from "idb-keyval";
import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";

const CACHE_KEY = "bubbles-query-cache";

/**
 * Bump when the cached shape changes incompatibly.
 *
 * React Query discards a restored cache whose buster does not match, which is
 * the escape hatch if a release changes how messages or conversations are
 * stored.
 */
export const CACHE_BUSTER = "v1";

/** Discard anything older than this rather than showing stale history. */
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Persist the query cache to IndexedDB.
 *
 * IndexedDB rather than localStorage: a conversation feed plus contact avatars
 * runs to several megabytes, well past localStorage's ~5MB ceiling, and
 * idb-keyval stores structured clones directly so there is no JSON
 * stringify/parse cost on every write.
 */
export function createIdbPersister(): Persister {
  return {
    persistClient: (client: PersistedClient) => set(CACHE_KEY, client),
    restoreClient: () => get<PersistedClient>(CACHE_KEY),
    removeClient: () => del(CACHE_KEY),
  };
}
