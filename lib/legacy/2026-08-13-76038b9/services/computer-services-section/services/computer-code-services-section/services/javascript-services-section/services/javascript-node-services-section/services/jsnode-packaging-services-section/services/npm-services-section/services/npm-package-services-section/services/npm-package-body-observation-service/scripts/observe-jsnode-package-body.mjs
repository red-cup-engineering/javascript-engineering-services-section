#!/usr/bin/env node
// CLI entrypoint for the package's single operation: observe the named
// JSNode package carriers and their active source resources beneath one
// explicit repository root. Holds no logic of its own beyond argument
// parsing and result printing; the operation itself lives in ../src.
//
// Usage:
//   node scripts/observe-jsnode-package-body.mjs --root <path>

import { parseArgs } from "node:util";
import { observeJsnodePackageBody } from "../src/observe-jsnode-package-body.mjs";

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  process.stdout.write("usage: observe-jsnode-package-body --root <path>\n");
  process.exit(0);
}

if (!values.root) {
  console.error("error: --root is required (e.g. --root .)");
  process.exit(2);
}

const observation = await observeJsnodePackageBody({ root: values.root });
process.stdout.write(`${JSON.stringify(observation, null, 2)}\n`);
