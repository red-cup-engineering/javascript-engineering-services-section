#!/usr/bin/env node
// CLI entrypoint for normalizeJsnodePackageDependencies. Reads a manifest
// JSON file plus optional provider maps, prints the normalized manifest
// JSON to stdout. Holds no logic of its own beyond argument parsing and
// I/O -- the operation itself lives in
// ../src/normalize-jsnode-package-dependencies.mjs.
//
// Usage:
//   node scripts/normalize-jsnode-package-dependencies.mjs \
//     --manifest <path-to-package.json> \
//     [--root <path>] \
//     [--providers-by-name <path-to-json>] \
//     [--providers-by-directory <path-to-json>]

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { normalizeJsnodePackageDependencies } from "../src/normalize-jsnode-package-dependencies.mjs";

export { normalizeJsnodePackageDependencies };

function usage() {
  return (
    "usage: normalize-jsnode-package-dependencies --manifest <path-to-package.json> " +
    "[--root <path>] [--providers-by-name <path-to-json>] [--providers-by-directory <path-to-json>]\n"
  );
}

async function loadProviderMap(path) {
  if (!path) return new Map();
  const entries = JSON.parse(await readFile(resolve(path), "utf8"));
  return new Map(Object.entries(entries));
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      manifest: { type: "string" },
      root: { type: "string" },
      "providers-by-name": { type: "string" },
      "providers-by-directory": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    process.stdout.write(usage());
    return;
  }
  if (!values.manifest) {
    process.stderr.write(usage());
    process.exitCode = 2;
    return;
  }

  const manifestPath = resolve(values.manifest);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const root = values.root ? resolve(values.root) : process.cwd();
  const providersByName = await loadProviderMap(values["providers-by-name"]);
  const providersByDirectory = await loadProviderMap(values["providers-by-directory"]);
  const result = normalizeJsnodePackageDependencies({ manifest, manifestPath, root, providersByName, providersByDirectory });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? "")) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
