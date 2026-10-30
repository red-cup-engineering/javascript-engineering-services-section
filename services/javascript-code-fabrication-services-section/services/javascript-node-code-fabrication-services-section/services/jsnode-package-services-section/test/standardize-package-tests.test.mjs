import assert from "node:assert/strict";
import { test } from "node:test";
import { isStandardCheck, isStandardTest, standardizePackageTests, testsRunBy, TEST_PLAN_PACKAGE } from "../src/standardize-package-tests.mjs";

const plan = (tests, check = tests) => ({ files: [...new Set([...tests, ...check])], tests, check, requirements: {}, problems: [] });
const TESTS = ["src/a.test.mjs", "test/one.test.mjs", "test/deep/two.test.mjs"];

test("the standard forms: run-package-tests with node flags only, a check that begins with check-package-syntax", () => {
  assert.equal(isStandardTest("run-package-tests"), true);
  assert.equal(isStandardTest("run-package-tests --test-concurrency=1 --test-timeout=15000"), true);
  assert.equal(isStandardTest("run-package-tests && echo"), false);
  assert.equal(isStandardTest("node --test test/*.test.mjs"), false);
  assert.equal(isStandardCheck("check-package-syntax && npm run check:generated"), true);
  assert.equal(isStandardCheck("node --check src/*.mjs"), false);
});

test("what an old command ran: quoted globs are node's, unquoted ** is the shell's *, bare --test is everything", () => {
  assert.deepEqual([...testsRunBy("node --test test/*.test.mjs", TESTS)], ["test/one.test.mjs"]);
  assert.deepEqual([...testsRunBy('node --test "test/**/*.test.mjs"', TESTS)].sort(), ["test/deep/two.test.mjs", "test/one.test.mjs"]);
  assert.deepEqual([...testsRunBy("node --test test/**/*.test.mjs", TESTS)], ["test/deep/two.test.mjs"]);
  assert.deepEqual([...testsRunBy("node --test test/one.test.mjs src/a.test.mjs", TESTS)].sort(), ["src/a.test.mjs", "test/one.test.mjs"]);
  assert.deepEqual([...testsRunBy("node --test", TESTS)].length, 3);
  assert.deepEqual([...testsRunBy("node --test test", TESTS)], []);
});

test("a node --test command becomes the standard one, keeping its node flags and naming the tests it never ran", () => {
  const result = standardizePackageTests({ name: "@x/a", scripts: { test: "node --max-old-space-size=256 --test --test-concurrency=1 test/*.test.mjs" } }, plan(TESTS), { range: "workspace:*" });
  assert.equal(result.manifest.scripts.test, "run-package-tests --max-old-space-size=256 --test-concurrency=1");
  assert.deepEqual(result.newlyRun, ["src/a.test.mjs", "test/deep/two.test.mjs"]);
  assert.equal(result.manifest.devDependencies[TEST_PLAN_PACKAGE], "workspace:*");
});

test("hand-listed node --check steps become one check-package-syntax; other chained steps are kept", () => {
  const result = standardizePackageTests({ name: "@x/a", scripts: { test: "run-package-tests", check: "node --check src/a.mjs && node --check scripts/b.mjs && npm run check:generated" } }, plan(TESTS), { range: "0.1.0" });
  assert.equal(result.manifest.scripts.check, "check-package-syntax && npm run check:generated");
  assert.equal(result.test, null);
});

test("a package with tests and no runner gets one; one with no tests and no scripts is left alone", () => {
  const added = standardizePackageTests({ name: "@x/a" }, plan(["test/t.test.mjs"]), { range: "0.1.0" });
  assert.deepEqual(added.manifest.scripts, { test: "run-package-tests", check: "check-package-syntax" });
  assert.deepEqual(added.newlyRun, ["test/t.test.mjs"]);
  const empty = standardizePackageTests({ name: "@x/b" }, plan([], []), { range: "0.1.0" });
  assert.equal(empty.changed, false);
  const noOp = standardizePackageTests({ name: "@x/c", scripts: { test: "echo no tests && exit 0" } }, plan([], []), { range: "0.1.0" });
  assert.equal(noOp.manifest.scripts.test, "run-package-tests");
});

test("a test command that is not a node --test form is kept and reported, never rewritten", () => {
  for (const command of ["forge test", "pnpm run build && node --test test/*.test.mjs", "node test/_run_tests.mjs", "lake build"]) {
    const result = standardizePackageTests({ name: "@x/a", scripts: { test: command, check: "check-package-syntax" } }, plan(TESTS), { range: "0.1.0" });
    assert.equal(result.manifest.scripts.test, command);
    assert.match(result.kept, /not a node --test form/u);
  }
});

test("the test-plan package itself is left to run its own scripts", () => {
  assert.equal(standardizePackageTests({ name: TEST_PLAN_PACKAGE, scripts: { test: "node scripts/run-package-tests.mjs" } }, plan(TESTS), { range: "workspace:*" }).changed, false);
});
