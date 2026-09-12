import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const repository = resolve(directory, "../..");
const outputDirectory = resolve(directory, "dist");
const checkOnly = process.argv.includes("--check");

const targets = [
  [resolve(repository, "apps/tui/src/index.tsx"), "tui.mjs"],
  [resolve(repository, "apps/tui/src/notifier.ts"), "notifier.mjs"],
];

await mkdir(outputDirectory, { recursive: true });

for (const [entryPoint, filename] of targets) {
  const options = {
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    jsx: "automatic",
    packages: "bundle",
    alias: {
      "react-devtools-core": resolve(directory, "devtools-stub.mjs"),
    },
    banner: {
      js: 'import { createRequire as __bubblesCreateRequire } from "node:module"; const require = __bubblesCreateRequire(import.meta.url);',
    },
    outfile: resolve(outputDirectory, filename),
    logLevel: "warning",
  };

  if (checkOnly) {
    await build({ ...options, write: false });
  } else {
    await build(options);
  }
}

const manifest = JSON.parse(
  await readFile(resolve(repository, "manifest.json"), "utf8"),
);
if (!manifest.kinds?.includes("service") || !manifest.kinds?.includes("bar-widget")) {
  throw new Error("Omarchy manifest must expose service and bar-widget kinds.");
}
