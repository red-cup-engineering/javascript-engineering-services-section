#!/usr/bin/env node
// run-package-tests: run the current package's test plan with node --test. Arguments are node flags
// (--test-concurrency=1, --test-timeout=15000, --max-old-space-size=256 …) passed through as given. A test
// whose declared requirement this environment does not meet is not run: it is named on stderr as a `requires`
// line and listed in the report. The last line on stdout is one JSON report,
//   {"kind":"package-test-run.v1","ok":…,"package":…,"planned":…,"files":…,"ran":…,"passed":…,"failed":…,"requires":[…]}
// counting the tests node ran (ran = passed + failed + skipped + todo), so a caller can tell "requires" from
// "fails". Exits non-zero when any test that ran failed.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { testPlan, unmetRequirements } from "../src/package-test-plan.mjs";
import { packageFiles, packageResolvesFrom } from "../src/package-files.mjs";

const directory = resolve(process.env.PACKAGE_TEST_DIRECTORY ?? process.cwd());
const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
const plan = testPlan({ files: packageFiles(directory), manifest });
if (plan.problems.length) {
  for (const problem of plan.problems) process.stderr.write(`run-package-tests: ${problem}\n`);
  process.exit(2);
}
const requires = [], run = [];
for (const test of plan.tests) {
  const unmet = unmetRequirements(plan.requirements[test], { environment: process.env, exists: existsSync, hasPackage: (name) => packageResolvesFrom(directory, name) });
  if (unmet.length) requires.push({ test, unmet });
  else run.push(test);
}
for (const { test, unmet } of requires) process.stderr.write(`requires ${test}: ${unmet.map(({ kind, value }) => `${kind} ${value}`).join("; ")}\n`);

const report = (counts, status) => {
  process.stdout.write(`\n${JSON.stringify({ kind: "package-test-run.v1", ok: status === 0, package: manifest.name ?? null, planned: plan.tests.length, files: run.length, ...counts, requires })}\n`);
  process.exit(status);
};
if (run.length === 0) report({ ran: 0, passed: 0, failed: 0 }, 0);

// The caller's reporter (or node's default) to stdout, and a TAP copy to read the counts from.
const flags = process.argv.slice(2);
const scratch = mkdtempSync(join(tmpdir(), "run-package-tests-"));
const tap = join(scratch, "report.tap");
const reporters = flags.some((flag) => flag.startsWith("--test-reporter")) ? []
  : [`--test-reporter=${process.stdout.isTTY ? "spec" : "tap"}`, "--test-reporter-destination=stdout"];
// Its own test run, even when started from inside another (node --test marks a child with NODE_TEST_CONTEXT).
const { NODE_TEST_CONTEXT, ...environment } = process.env;
const result = spawnSync(process.execPath, [...flags, ...reporters, "--test-reporter=tap", `--test-reporter-destination=${tap}`, "--test", ...run], { cwd: directory, stdio: "inherit", env: environment });
const summary = (() => { try { return readFileSync(tap, "utf8"); } catch { return ""; } })();
rmSync(scratch, { recursive: true, force: true });
const count = (name) => Number(new RegExp(`^# ${name} (\\d+)$`, "mu").exec(summary)?.[1] ?? 0);
const passed = count("pass"), failed = count("fail") + count("cancelled");
report({ ran: passed + failed + count("skipped") + count("todo"), passed, failed }, result.status === 0 && failed === 0 ? 0 : (result.status || 1));
