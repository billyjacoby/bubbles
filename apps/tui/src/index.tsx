#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { HELP, parseCli, resolveConnection } from "./cli.js";
import { loadCache } from "./cache.js";
import { loadConnection } from "./config.js";
import { Root } from "./root.js";

let options;
try {
  options = parseCli(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Invalid options"}\n\n${HELP}`);
  process.exitCode = 1;
  process.exit();
}

if (options.help) {
  process.stdout.write(HELP);
} else {
  const saved = await loadConnection();
  const candidate = resolveConnection(options, saved);
  const initialConnection = options.setup ? undefined : candidate;
  const initialCache = initialConnection
    ? await loadCache(initialConnection)
    : undefined;
  render(
    <Root
      initialConnection={initialConnection}
      initialCache={initialCache}
      onboardingDefaults={candidate}
    />,
  );
}
