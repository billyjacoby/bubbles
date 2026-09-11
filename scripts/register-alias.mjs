/**
 * Resolve the app's `@/*` path alias for Node.
 *
 * Without this, scripts could only import modules whose own imports are all
 * type-only (erased at strip time). This lets them load any app module, so
 * behaviour spanning several files is exercised directly rather than
 * reimplemented in the test.
 *
 * Usage: node --import ./scripts/register-alias.mjs <script>
 */

import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = new URL("../src/", import.meta.url);

/** Extensionless specifiers need a concrete file: `@/lib/x` -> `x.ts`. */
function withExtension(url) {
  if (/\.[cm]?[jt]sx?$/.test(url.pathname)) return url;

  for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
    const candidate = new URL(url.href + ext);
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }

  const index = new URL(`${url.href}/index.ts`);
  if (existsSync(fileURLToPath(index))) return index;

  return url;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = withExtension(new URL(specifier.slice(2), SRC));
      return nextResolve(target.href, context);
    }
    return nextResolve(specifier, context);
  },
});
