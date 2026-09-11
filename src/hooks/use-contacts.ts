"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getContacts } from "@/lib/api/contacts";
import {
  buildContactIndex,
  lookupContact,
  type ContactIndex,
  type ResolvedContact,
} from "@/lib/contacts";
import { useConnection } from "@/components/connection-provider";
import type { NameResolver } from "@/lib/message-utils";

const EMPTY_INDEX: ContactIndex = new Map();

/**
 * The server's address book.
 *
 * Contacts change rarely and the payload is large, so this is cached
 * aggressively and never refetched on focus. Failures are non-fatal: the UI
 * falls back to formatted phone numbers.
 */
export function useContacts() {
  const conn = useConnection();

  return useQuery({
    queryKey: ["contacts"],
    queryFn: () => getContacts(conn, { withAvatars: true }),
    staleTime: 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });
}

export function useContactIndex(): ContactIndex {
  const { data } = useContacts();
  return useMemo(() => (data ? buildContactIndex(data) : EMPTY_INDEX), [data]);
}

/**
 * A stable address → name resolver for the display helpers.
 *
 * Returns undefined for unknown addresses so callers apply their own fallback.
 */
export function useNameResolver(): NameResolver {
  const index = useContactIndex();
  return useCallback(
    (address: string) => lookupContact(index, address)?.name,
    [index],
  );
}

/** Full contact record for an address, including avatar. */
export function useContactLookup(): (
  address: string | null | undefined,
) => ResolvedContact | undefined {
  const index = useContactIndex();
  return useCallback((address) => lookupContact(index, address), [index]);
}
