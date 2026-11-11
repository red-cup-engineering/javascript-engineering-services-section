import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { check561GroupJavascriptImportLattice, readJavascriptPackageSources } from "@red-cup-engineering/javascript-engineering-services-section/package-import-lattice";
import { resolveJavascriptPackageSource } from "../src/javascript-package-sources.mjs";

test("reads a package once and assays its src/scripts/apps import lattice", t => {
  const root = mkdtempSync(join(tmpdir(), "javascript-package-lattice-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "apps", "cli"), { recursive: true });
  writeFileSync(join(root, "src", "value.mjs"), "export const value = 1;\n");
  writeFileSync(join(root, "scripts", "read.mjs"), "import '../src/value.mjs';\n");
  writeFileSync(join(root, "apps", "cli", "main.mjs"), "import '../../scripts/read.mjs';\n");

  writeFileSync(join(root, "src", "value.d.mts"), "export declare const value: number;\n");
  for (const directory of ["src/legacy", "src/dist", "apps/cli/node_modules/example", "apps/child"]) {
    mkdirSync(join(root, directory), { recursive: true });
    writeFileSync(join(root, directory, "ignored.mjs"), "export const value = 0;\n");
  }
  writeFileSync(join(root, "apps", "child", "package.json"), '{"name":"child"}\n');

  assert.deepEqual(readJavascriptPackageSources(root).map(({ path }) => path), [
    "apps/cli/main.mjs",
    "scripts/read.mjs",
    "src/value.mjs",
  ]);
  assert.deepEqual(check561GroupJavascriptImportLattice(root).deviations, []);
  assert.equal(resolveJavascriptPackageSource("scripts/read.mjs", "../src/value", new Set(readJavascriptPackageSources(root).map(({ path }) => path))), "src/value.mjs");
});
