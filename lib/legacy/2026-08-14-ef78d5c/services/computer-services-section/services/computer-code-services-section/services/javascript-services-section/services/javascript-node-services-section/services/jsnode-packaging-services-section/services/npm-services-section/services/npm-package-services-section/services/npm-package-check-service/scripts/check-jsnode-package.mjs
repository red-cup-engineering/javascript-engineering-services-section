#!/usr/bin/env node
// CLI entrypoint for the package's single operation. Holds no logic of its
// own: it parses argv, calls the same checkJsnodePackage export the package
// "exports" field points at, and prints the resulting report.
//
// Usage:
//   node scripts/check-jsnode-package.mjs --directory <path> [--pretty]
//   npx check-jsnode-package --directory <path>

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { checkJsnodePackage } from "../src/check-jsnode-package.mjs";

function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      directory: { type: "string" },
      pretty: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  return values;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write("usage: check-jsnode-package --directory <path> [--pretty]\n");
    return;
  }

  if (!options.directory) {
    throw new TypeError("--directory is required");
  }

  const report = await checkJsnodePackage({ directory: options.directory });
  process.stdout.write(`${JSON.stringify(report, null, options.pretty ? 2 : undefined)}\n`);
  process.exitCode = report.violationCount > 0 ? 1 : 0;
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
