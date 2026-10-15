#!/usr/bin/env node
// check-package-syntax: node --check every JavaScript file of the current package's own code and tests (the
// plan's `check` files: not nested packages, node_modules, legacy, vendor or fixtures). Exits 1 naming each
// file that does not parse.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { testPlan } from "../src/package-test-plan.mjs";
import { packageFiles } from "../src/package-files.mjs";

const directory = resolve(process.env.PACKAGE_TEST_DIRECTORY ?? process.cwd());
const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
const plan = testPlan({ files: packageFiles(directory), manifest });
const failed = [];
for (const file of plan.check) {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: directory, encoding: "utf8" });
  if (result.status !== 0) failed.push({ file, message: (result.stderr || result.stdout).trim().split("\n").slice(0, 6).join("\n") });
}
for (const { file, message } of failed) process.stderr.write(`check-package-syntax: ${file}\n${message}\n`);
process.stdout.write(`check-package-syntax: ${plan.check.length - failed.length}/${plan.check.length} files parse\n`);
process.exit(failed.length ? 1 : 0);
