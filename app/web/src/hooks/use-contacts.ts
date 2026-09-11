"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getContacts } from "@bubbles/shared";
import { loadContactAvatar } from "@/lib/avatar-loader";
import {
  buildContactIndex,
  lookupContact,
  addressKeys,
  type ContactIndex,
  type ResolvedContact,
} from "@bubbles/shared";
import { useConnection } from "@/components/connection-provider";
import type { NameResolver } from "@bubbles/shared";

const EMPTY_INDEX: ContactIndex = new Map();

/**
 * The server's address book, names only.
 *
 * Photos are deliberately excluded here and fetched per contact instead: on a
 * real 662-contact address book, names alone are 0.2MB in ~300ms while
 * including every photo is 8.7MB in ~3.2s, for avatars on 11% of contacts. That
 * cost would also be re-paid on every write of the persisted cache.
 *
 * Persisted with the rest of the cache, so a reload costs nothing. There is no
 * delta endpoint for contacts, so this query opts back into time-based
 * staleness to pick up edits. Failures are non-fatal: the UI falls back to
 * formatted phone numbers.
 */
export function useContacts() {
  const conn = useConnection();

  return useQuery({
    queryKey: ["contacts"],
    queryFn: () => getContacts(conn, { withAvatars: false }),
    staleTime: 6 * 60 * 60_000,
    gcTime: 7 * 24 * 60 * 60_000,
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

/** Contact record for an address — name only; use `useContactAvatar` for photos. */
export function useContactLookup(): (
  address: string | null | undefined,
) => ResolvedContact | undefined {
  const index = useContactIndex();
  return useCallback((address) => lookupContact(index, address), [index]);
}

/**
 * One contact's photo, fetched on demand and batched with any others requested
 * in the same tick.
 *
 * Only runs for addresses that resolved to a known contact, so short codes and
 * businesses never trigger a request. Each address is cached and persisted
 * separately, so a photo is fetched once and then survives reloads.
 */
export function useContactAvatar(address: string | null | undefined) {
  const conn = useConnection();
  const index = useContactIndex();

  const contact = lookupContact(index, address);
  const key = address ? addressKeys(address)[0] : undefined;

  const { data } = useQuery({
    queryKey: ["contact-avatar", key],
    queryFn: () => loadContactAvatar(conn, address!),
    enabled: Boolean(address) && Boolean(contact) && Boolean(key),
    staleTime: Infinity,
    gcTime: 7 * 24 * 60 * 60_000,
    retry: false,
  });

  // A photo delivered with the address book (if that is ever re-enabled) wins,
  // since it is already in hand.
  return contact?.avatar ?? data ?? null;
}
