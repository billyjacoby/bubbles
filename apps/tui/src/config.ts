import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { normalizeServerUrl, type Connection } from "@bubbles/shared";

function configRoot(): string {
  if (process.platform === "win32" && process.env.APPDATA) {
    return process.env.APPDATA;
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
}

export function configFile(): string {
  return join(configRoot(), "bubbles", "config.json");
}

function parseConnection(value: unknown): Connection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.serverUrl !== "string" || typeof candidate.password !== "string") {
    return undefined;
  }
  if (!candidate.serverUrl.trim() || !candidate.password) return undefined;

  try {
    return {
      serverUrl: normalizeServerUrl(candidate.serverUrl),
      password: candidate.password,
    };
  } catch {
    return undefined;
  }
}

export async function loadConnection(path = configFile()): Promise<Connection | undefined> {
  try {
    return parseConnection(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return undefined;
  }
}

export async function saveConnection(
  connection: Connection,
  path = configFile(),
): Promise<void> {
  const directory = dirname(path);
  const temporary = `${path}.${process.pid}.tmp`;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700).catch(() => undefined);
  try {
    await writeFile(temporary, `${JSON.stringify(connection, null, 2)}\n`, {
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
