import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Connection, Message, ServerContact } from "@bubbles/shared";
import { configFile } from "./config.js";

const CACHE_VERSION = 1;

export interface TuiCache {
  feed: Message[];
  contacts: ServerContact[];
  contactsUpdatedAt: number;
  threads: Record<string, Message[]>;
}

interface CacheFile extends TuiCache {
  version: number;
  connectionKey: string;
}

export function emptyCache(): TuiCache {
  return { feed: [], contacts: [], contactsUpdatedAt: 0, threads: {} };
}

export function cacheFile(): string {
  return join(dirname(configFile()), "cache.json");
}

function connectionKey(connection: Connection): string {
  return createHash("sha256")
    .update(connection.serverUrl)
    .update("\0")
    .update(connection.password)
    .digest("hex");
}

function parseCache(value: unknown, connection: Connection): TuiCache | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<CacheFile>;
  if (
    candidate.version !== CACHE_VERSION ||
    candidate.connectionKey !== connectionKey(connection) ||
    !Array.isArray(candidate.feed) ||
    !Array.isArray(candidate.contacts) ||
    !candidate.threads ||
    typeof candidate.threads !== "object"
  ) {
    return undefined;
  }

  const threads = Object.fromEntries(
    Object.entries(candidate.threads)
      .filter((entry): entry is [string, Message[]] => Array.isArray(entry[1]))
      .slice(-30),
  );
  return {
    feed: candidate.feed.slice(0, 750),
    contacts: candidate.contacts,
    contactsUpdatedAt:
      typeof candidate.contactsUpdatedAt === "number" ? candidate.contactsUpdatedAt : 0,
    threads,
  };
}

export async function loadCache(
  connection: Connection,
  path = cacheFile(),
): Promise<TuiCache | undefined> {
  try {
    return parseCache(JSON.parse(await readFile(path, "utf8")), connection);
  } catch {
    return undefined;
  }
}

export async function saveCache(
  connection: Connection,
  cache: TuiCache,
  path = cacheFile(),
): Promise<void> {
  const directory = dirname(path);
  const temporary = `${path}.${process.pid}.tmp`;
  const contents: CacheFile = {
    version: CACHE_VERSION,
    connectionKey: connectionKey(connection),
    ...cache,
    feed: cache.feed.slice(0, 750),
    threads: Object.fromEntries(Object.entries(cache.threads).slice(-30)),
  };

  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => undefined);
  try {
    await writeFile(temporary, `${JSON.stringify(contents)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporary, path);
    await chmod(path, 0o600).catch(() => undefined);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}
