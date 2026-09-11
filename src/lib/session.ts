import "server-only";
import { cookies } from "next/headers";
import type { Connection } from "@/lib/types";

export const SESSION_COOKIE = "bb_session";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Read the stored connection.
 *
 * The cookie is httpOnly so it cannot be scraped from client JS. A server
 * component reads it here and hands it to the client provider, which keeps the
 * password out of `localStorage` while still allowing direct browser-to-server
 * calls.
 */
export async function getConnection(): Promise<Connection | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<Connection>;
    if (!parsed.serverUrl || !parsed.password) return null;
    return { serverUrl: parsed.serverUrl, password: parsed.password };
  } catch {
    return null;
  }
}

export async function setConnection(connection: Connection): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, JSON.stringify(connection), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearConnection(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
