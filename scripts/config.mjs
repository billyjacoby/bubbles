/**
 * Shared credential loading for the diagnostic scripts.
 *
 * Resolution order, first match wins:
 *   1. --url / --password flags
 *   2. BB_URL / BB_PASSWORD environment variables
 *   3. .env.local at the repo root (gitignored)
 *
 * Keeping the password in .env.local means it never has to be typed on a
 * command line, pasted into a chat, or committed.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);

for (const file of [".env.local", ".env"]) {
  const path = fileURLToPath(new URL(file, ROOT));
  if (existsSync(path)) {
    try {
      process.loadEnvFile(path);
    } catch {
      // Malformed env file — fall through to flags/environment.
    }
  }
}

const args = process.argv.slice(2);

function flag(name) {
  const index = args.indexOf(`--${name}`);
  return index !== -1 ? args[index + 1] : undefined;
}

/**
 * Resolve server credentials, or exit with instructions.
 *
 * Pass `{ required: false }` to get null instead of exiting, for scripts whose
 * offline checks are still worth running without a server.
 */
export function loadConfig({ required = true } = {}) {
  const rawUrl = flag("url") ?? process.env.BB_URL ?? "";
  const password = flag("password") ?? process.env.BB_PASSWORD ?? "";

  if (!rawUrl.trim() || !password.trim()) {
    if (!required) return null;
    console.error(
      "\nMissing server credentials.\n\n" +
        "Add them to .env.local at the repo root (gitignored):\n\n" +
        "  BB_URL=https://your-server\n" +
        "  BB_PASSWORD=your-password\n\n" +
        "Or pass them directly:\n\n" +
        "  --url https://your-server --password your-password\n",
    );
    process.exit(1);
  }

  const trimmed = rawUrl.trim().replace(/\/+$/, "");
  const origin = new URL(
    /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
  ).origin;

  return { origin, password };
}

/** A fetch wrapper that handles auth, tunnel headers and the API envelope. */
export function makeApi({ origin, password }) {
  return async function api(path, { method = "GET", query = {}, body } = {}) {
    const url = new URL(`${origin}/api/v1${path}`);
    url.searchParams.set("guid", password);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const res = await fetch(url, {
      method,
      headers: {
        "ngrok-skip-browser-warning": "true",
        skip_zrok_interstitial: "true",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120_000),
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `${path}: non-JSON response (status ${res.status}): ${text.slice(0, 160)}`,
      );
    }
    if (res.status !== 200) {
      const detail = json?.error?.message ?? json?.message ?? "";
      throw new Error(`${path}: status ${res.status} ${detail}`);
    }
    return { json, bytes: text.length };
  };
}
