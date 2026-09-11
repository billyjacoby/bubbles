"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState, type ReactNode } from "react";
import {
  CACHE_BUSTER,
  CACHE_MAX_AGE_MS,
  createIdbPersister,
} from "@/lib/persister";

export function QueryProvider({ children }: { children: ReactNode }) {
  // Created lazily per-mount so server-rendered navigations never share a cache
  // between users.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Updates arrive by socket while connected, and by delta sync on
            // load, so time-based refetching would only duplicate work.
            staleTime: Infinity,
            // Must outlive the persisted cache: a query garbage-collected from
            // memory is dropped from the next write to IndexedDB too.
            gcTime: 24 * 60 * 60 * 1000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 1,
          },
        },
      }),
  );

  const [persister] = useState(() => createIdbPersister());

  return (
    // Children render immediately, but queries are held until the cache has
    // been restored — that is what stops a full refetch racing the restore.
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        buster: CACHE_BUSTER,
        maxAge: CACHE_MAX_AGE_MS,
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
