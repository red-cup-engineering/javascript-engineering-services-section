#!/usr/bin/env node

import { parseArgs } from "node:util";

import { check561GroupJavascriptImportLattice } from "../src/javascript-package-import-lattice.mjs";

export { check561GroupJavascriptImportLattice };

if (import.meta.main) {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (positionals.length !== 1) {
    process.stderr.write("usage: check-561-group-javascript-import-lattice PACKAGE_DIRECTORY\n");
    process.exit(2);
  }
  const result = check561GroupJavascriptImportLattice(positionals[0]);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.deviations.length > 0) process.exitCode = 1;
}
