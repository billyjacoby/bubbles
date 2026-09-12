import { parseArgs } from "node:util";
import { normalizeServerUrl, type Connection } from "@bubbles/shared";

export interface CliOptions {
  server?: string;
  password?: string;
  help: boolean;
  setup: boolean;
}

export function parseCli(argv: string[]): CliOptions {
  // pnpm forwards the conventional option separator to nested workspace
  // scripts, so tolerate it as well as direct `bubbles-tui` execution.
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args,
    options: {
      server: { type: "string", short: "s" },
      password: { type: "string", short: "p" },
      setup: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  const server = values.server ?? process.env.BLUEBUBBLES_URL;
  const password = values.password ?? process.env.BLUEBUBBLES_PASSWORD;

  return {
    help: values.help,
    setup: values.setup,
    server,
    password,
  };
}

export function resolveConnection(
  options: Pick<CliOptions, "server" | "password">,
  saved?: Connection,
): Connection | undefined {
  const server = options.server ?? saved?.serverUrl;
  const password = options.password ?? saved?.password;
  if (!server || !password) return undefined;
  return { serverUrl: normalizeServerUrl(server), password };
}

export const HELP = `Bubbles TUI

Usage:
  pnpm tui
  pnpm tui -- --server <url> --password <password>
  pnpm tui -- --setup

The first launch opens setup and saves a validated connection for next time.
Use --setup to replace it.

Environment:
  BLUEBUBBLES_URL       BlueBubbles server origin
  BLUEBUBBLES_PASSWORD  BlueBubbles server password

Keys:
  tab            switch chats/messages  j/k or arrows  navigate active pane
  enter/i        compose                 esc            leave composer
  r              refresh                 q              quit
  ctrl+c         quit
`;
