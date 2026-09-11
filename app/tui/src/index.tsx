#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { HELP, parseCli } from "./cli.js";

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
} else if (!options.connection) {
  process.stderr.write(`Missing BlueBubbles connection details.\n\n${HELP}`);
  process.exitCode = 1;
} else {
  render(<App connection={options.connection} />);
}
