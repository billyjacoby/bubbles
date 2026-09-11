import { requestData } from "./client.js";
import type { Connection, ServerContact } from "../types.js";

/**
 * Fetch the address book from the server.
 *
 * Avatars are returned inline as base64, which makes the payload substantially
 * larger, so they are opt-in. `pnpm verify` reports the size both ways against
 * a real address book.
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
  { withAvatars = false }: { withAvatars?: boolean } = {},
): Promise<ServerContact[]> {
  return requestData<ServerContact[]>(conn, "/contact/query", {
    method: "POST",
    body: {
      addresses,
      // Note: unlike GET /contact, this endpoint only honours extraProperties
      // in the body — passing it as a query parameter is silently ignored.
      ...(withAvatars ? { extraProperties: ["avatar"] } : {}),
    },
  });
}
