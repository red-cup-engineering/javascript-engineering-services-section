#!/usr/bin/env node
// CLI entrypoint for the package's single operation. Holds no logic of its
// own: it parses argv, calls the same createNpmPackage export the package
// "exports" field points at, and prints the resulting receipt as JSON.
//
// Usage:
//   node scripts/create-npm-package.mjs --name @scope/thing-service \
//     --description "Does one thing." [--directory <parent-dir>] \
//     [--version 0.0.1] [--type module] [--license <spdx>] [--author <text>]

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { createNpmPackage } from "../src/create-npm-package.mjs";

export { createNpmPackage };

const USAGE =
  "usage: create-npm-package --name <@scope/leaf> --description <text> " +
  "[--directory <dir>] [--version <semver>] [--type <module|commonjs>] " +
  "[--license <spdx>] [--author <text>]\n";

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: "string" },
      description: { type: "string" },
      directory: { type: "string", default: "." },
      version: { type: "string", default: "0.0.1" },
      type: { type: "string", default: "module" },
      license: { type: "string" },
      author: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  return values;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }
  if (!options.name || !options.description) {
    process.stderr.write(USAGE);
    process.exitCode = 2;
    return;
  }

  const receipt = await createNpmPackage(options);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
