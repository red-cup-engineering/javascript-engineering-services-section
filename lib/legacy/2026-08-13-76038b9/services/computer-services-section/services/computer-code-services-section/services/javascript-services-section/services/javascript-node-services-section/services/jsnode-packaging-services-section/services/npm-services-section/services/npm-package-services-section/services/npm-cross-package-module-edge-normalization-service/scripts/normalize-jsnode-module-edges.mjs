#!/usr/bin/env node
// CLI entrypoint for the package's single operation: normalize relative
// cross-package JSNode module references in one source resource into
// explicit package dependency and export edges. Holds no logic of its own
// beyond argument parsing, file IO, and result printing; the operation
// itself lives in ../src.
//
// Usage:
//   node scripts/normalize-jsnode-module-edges.mjs --root <path> \
//     --path <source-file-relative-to-root> --carriers <carriers-json-file>
//
// --carriers points at a JSON file holding the array of package carrier
// records ({ path, directory, name, version, exports }) the operation
// resolves relative-import targets against.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { normalizeJsnodeModuleEdges } from "../src/normalize-jsnode-module-edges.mjs";

const { values } = parseArgs({
  options: {
    root: { type: "string" },
    path: { type: "string" },
    carriers: { type: "string" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  process.stdout.write("usage: normalize-jsnode-module-edges --root <path> --path <source-file-relative-to-root> --carriers <carriers-json-file>\n");
  process.exit(0);
}

if (!values.root || !values.path || !values.carriers) {
  console.error("error: --root, --path, and --carriers are required");
  process.exit(2);
}

const source = await readFile(resolve(values.root, values.path), "utf8");
const carriers = JSON.parse(await readFile(resolve(values.carriers), "utf8"));
const result = await normalizeJsnodeModuleEdges({ root: values.root, path: values.path, source, carriers });
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
