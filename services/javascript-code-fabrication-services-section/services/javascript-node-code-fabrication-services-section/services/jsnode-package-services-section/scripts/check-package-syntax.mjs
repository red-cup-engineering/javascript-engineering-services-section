#!/usr/bin/env node
// check-package-syntax: node --check every JavaScript file of the current package's own code and tests (the
// plan's `check` files: not nested packages, node_modules, legacy, vendor or fixtures). Exits 1 naming each
// file that does not parse.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { testPlan } from "../src/package-test-plan.mjs";
import { packageFiles } from "../src/package-files.mjs";
import { packageCheckExecutionProblem } from "../src/package-check-outcome.mjs";

const directory = resolve(process.env.PACKAGE_TEST_DIRECTORY ?? process.cwd());
const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
const plan = testPlan({ files: packageFiles(directory), manifest });
const failed = [];
for (const file of plan.check) {
  let result;
  try { result = spawnSync(process.execPath, ["--check", file], { cwd: directory, encoding: "utf8" }); }
  catch (error) { result = { error }; }
  const problem = packageCheckExecutionProblem(result);
  if (problem !== null) failed.push({ file, problem });
  // Keep the complete native observations, including diagnostics from a
  // refused launch. A short or empty stdout is not evidence of a parsed file.
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}
for (const { file, problem } of failed) process.stderr.write(`check-package-syntax: ${file}\n${problem}\n`);
process.stdout.write(`check-package-syntax: ${plan.check.length - failed.length}/${plan.check.length} files parse\n`);
process.exit(failed.length ? 1 : 0);
