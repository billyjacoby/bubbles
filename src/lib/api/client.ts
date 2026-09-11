import type { ApiEnvelope, Connection } from "@/lib/types";

export class ApiError extends Error {
  // Declared as fields rather than constructor parameter properties: the
  // latter require a TypeScript transform, which stops Node loading this
  // module directly for tests.
  readonly status: number;
  readonly type?: string;

  constructor(message: string, status: number, type?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.type = type;
  }
}

/** Normalise whatever the user typed into a bare origin. */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return new URL(withScheme).origin;
}

/**
 * Headers some tunnel providers require to skip their interstitial page.
 * Mirrors the behaviour of the official client.
 */
function tunnelHeaders(serverUrl: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (serverUrl.includes("ngrok")) headers["ngrok-skip-browser-warning"] = "true";
  if (serverUrl.includes("zrok")) headers["skip_zrok_interstitial"] = "true";
  return headers;
}

export function buildUrl(
  conn: Connection,
  path: string,
  query: Record<string, string | number | boolean | null | undefined> = {},
): string {
  const url = new URL(`${conn.serverUrl}/api/v1${path}`);
  // The server authenticates purely on this query param — there is no header auth.
  url.searchParams.set("guid", conn.password);
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  /** Pre-built FormData for multipart endpoints; takes precedence over `body`. */
  formData?: FormData;
  signal?: AbortSignal;
}

/**
 * Issue a request against the BlueBubbles REST API and unwrap the envelope.
 *
 * The server only ever signals success with HTTP 200 — a 2xx that is not 200
 * is still treated as a failure, matching the reference client.
 */
export async function request<T>(
  conn: Connection,
  path: string,
  options: RequestOptions = {},
): Promise<ApiEnvelope<T>> {
  const { method = "GET", query, body, formData, signal } = options;

  const headers: Record<string, string> = tunnelHeaders(conn.serverUrl);
  let payload: BodyInit | undefined;

  if (formData) {
    payload = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(conn, path, query), {
      method,
      headers,
      body: payload,
      signal,
    });
  } catch {
    throw new ApiError(
      "Could not reach the BlueBubbles server. Check the URL, that the server is running, and that it allows requests from this origin.",
      0,
      "network",
    );
  }

  const text = await res.text();
  let json: ApiEnvelope<T> | undefined;
  try {
    json = text ? (JSON.parse(text) as ApiEnvelope<T>) : undefined;
  } catch {
    // Non-JSON body — usually a tunnel interstitial or a proxy error page.
  }

  if (res.status !== 200 || !json) {
    const detail = json?.error?.message ?? json?.message;
    throw new ApiError(
      detail ?? `Request failed with status ${res.status}`,
      res.status,
      json?.error?.type,
    );
  }

  return json;
}

/** Convenience wrapper for the common case of only needing `data`. */
export async function requestData<T>(
  conn: Connection,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const envelope = await request<T>(conn, path, options);
  return envelope.data;
}

/** Fetch raw bytes (attachments, chat icons). */
export function attachmentUrl(
  conn: Connection,
  guid: string,
  opts: { original?: boolean } = {},
): string {
  return buildUrl(conn, `/attachment/${encodeURIComponent(guid)}/download`, {
    original: opts.original ? true : undefined,
  });
}
