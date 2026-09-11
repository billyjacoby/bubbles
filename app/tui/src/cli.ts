import { parseArgs } from "node:util";
import { normalizeServerUrl, type Connection } from "@bubbles/shared";

export interface CliOptions {
  connection?: Connection;
  help: boolean;
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
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  const server = values.server ?? process.env.BLUEBUBBLES_URL;
  const password = values.password ?? process.env.BLUEBUBBLES_PASSWORD;

  return {
    help: values.help,
    connection:
      server && password
        ? { serverUrl: normalizeServerUrl(server), password }
        : undefined,
  };
}

export const HELP = `Bubbles TUI

Usage:
  pnpm tui -- --server <url> --password <password>

Environment:
  BLUEBUBBLES_URL       BlueBubbles server origin
  BLUEBUBBLES_PASSWORD  BlueBubbles server password

Keys:
  j/k or arrows  select conversation     enter/i/tab  compose
  r              refresh                 esc          leave composer
  q              quit                    ctrl+c       quit
`;
