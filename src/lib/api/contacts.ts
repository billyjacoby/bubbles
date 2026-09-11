import { requestData } from "@/lib/api/client";
import type { Connection, ServerContact } from "@/lib/types";

/**
 * Fetch the address book from the server.
 *
 * Avatars are returned inline as base64, which makes the payload substantially
 * larger, so they are opt-in. Run `pnpm diagnose:contacts` to measure the cost
 * against a given address book before enabling them.
 */
export function getContacts(
  conn: Connection,
  { withAvatars = false }: { withAvatars?: boolean } = {},
): Promise<ServerContact[]> {
  return requestData<ServerContact[]>(conn, "/contact", {
    query: withAvatars ? { extraProperties: "avatar" } : {},
  });
}

/** Look up a specific set of addresses rather than the whole address book. */
export function queryContacts(
  conn: Connection,
  addresses: string[],
): Promise<ServerContact[]> {
  return requestData<ServerContact[]>(conn, "/contact/query", {
    method: "POST",
    body: { addresses },
  });
}
