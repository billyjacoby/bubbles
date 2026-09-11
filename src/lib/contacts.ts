import type { ServerContact } from "@/lib/types";

/**
 * A contact resolved against a handle address.
 *
 * `avatar` is already a data URL, ready for an `<img src>`.
 */
export interface ResolvedContact {
  id: string;
  name: string;
  avatar?: string;
}

export type ContactIndex = ReadonlyMap<string, ResolvedContact>;

/** Emails match case-insensitively. */
export function normalizeEmail(address: string): string {
  return address.toLowerCase().trim();
}

/**
 * Keys a phone number can be matched on, most specific first.
 *
 * The reference client compares normalised strings exactly, which fails
 * whenever an address book stores a local number — `(727) 417-4794` — and the
 * handle carries the international form, `+17274174794`. Indexing the national
 * significant number (the trailing 10 digits, for NANP-style numbers) as well
 * lets those two meet.
 *
 * The trailing-10 key is deliberately only generated for numbers long enough to
 * have one, so short codes such as `22000` are matched exactly and never
 * collide with a longer number.
 */
export function phoneKeys(address: string): string[] {
  const digits = address.replace(/\D/g, "");
  if (!digits) return [];

  const keys = [digits];
  if (digits.length > 10) keys.push(digits.slice(-10));
  return keys;
}

/** All lookup keys for an address, most specific first. */
export function addressKeys(address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) return [];
  if (trimmed.includes("@")) return [normalizeEmail(trimmed)];
  // Business/system senders have no dialable form.
  if (trimmed.startsWith("urn:")) return [trimmed.toLowerCase()];
  return phoneKeys(trimmed);
}

export function contactName(contact: ServerContact): string {
  const display = contact.displayName?.trim();
  if (display) return display;

  const full = [contact.firstName, contact.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return full;
}

function avatarDataUrl(avatar: string | undefined): string | undefined {
  if (!avatar) return undefined;
  // The server sends bare base64; it may be PNG or JPEG, and browsers sniff
  // the actual format regardless of the declared one.
  return `data:image/jpeg;base64,${avatar}`;
}

/**
 * Build an address → contact lookup table.
 *
 * A contact is indexed under every address it carries, and under both the full
 * and national forms of each phone number. More specific keys win: an exact
 * full-number match is never displaced by a trailing-10 match from a different
 * contact.
 */
export function buildContactIndex(contacts: ServerContact[]): ContactIndex {
  const index = new Map<string, ResolvedContact>();
  // Track which keys came from an exact (most-specific) match so a looser key
  // from a later contact cannot overwrite them.
  const exact = new Set<string>();

  for (const contact of contacts) {
    const name = contactName(contact);
    if (!name) continue;

    const resolved: ResolvedContact = {
      id: contact.id ?? name,
      name,
      avatar: avatarDataUrl(contact.avatar),
    };

    const addresses = [
      ...(contact.phoneNumbers ?? []),
      ...(contact.emails ?? []),
    ];

    for (const entry of addresses) {
      if (!entry?.address) continue;
      const keys = addressKeys(entry.address);

      keys.forEach((key, position) => {
        const isExact = position === 0;
        if (exact.has(key) && !isExact) return;
        if (index.has(key) && !isExact) return;
        index.set(key, resolved);
        if (isExact) exact.add(key);
      });
    }
  }

  return index;
}

/** Resolve a handle address to a contact, if one is known. */
export function lookupContact(
  index: ContactIndex,
  address: string | null | undefined,
): ResolvedContact | undefined {
  if (!address) return undefined;
  for (const key of addressKeys(address)) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  return undefined;
}

/** Initials for an avatar placeholder, derived from a resolved name. */
export function initialsFor(name: string): string {
  const words = name.split(/[\s,]+/).filter(Boolean);
  if (words.length === 0) return "?";
  // A name that is really a phone number has no meaningful initials.
  if (/^[\d(+]/.test(name)) return "#";
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
