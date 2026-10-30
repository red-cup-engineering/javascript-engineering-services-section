import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { testPlan } from "../src/package-test-plan.mjs";
import { isStandardTest, standardizePackageTests, testsRunBy } from "../src/standardize-package-tests.mjs";

const standardize = (command, files) => {
  const manifest = { name: "@x/regression", scripts: { test: command, check: "check-package-syntax" } };
  return standardizePackageTests(manifest, testPlan({ files, manifest }), { range: "workspace:*" });
};

test("separate option operands and quoting survive migration and a second pass", () => {
  for (const flags of [
    "--test-concurrency 1",
    "--max-old-space-size 256 --test-concurrency 1 --test-timeout 15000",
    '--test-name-pattern "slow smoke" --test-reporter tap',
    "--test-name-pattern='no tests' --test-concurrency=1",
    "--import './setup module.mjs' --test-concurrency 1",
  ]) {
    const result = standardize(`node --test ${flags} test/unit.test.mjs`, ["test/unit.test.mjs", "src/other.test.mjs"]);
    assert.equal(result.manifest.scripts.test, `run-package-tests ${flags}`);
    assert.deepEqual(result.newlyRun, ["src/other.test.mjs"]);
    assert.equal(isStandardTest(result.manifest.scripts.test), true);
    const again = standardizePackageTests(result.manifest, testPlan({ files: ["test/unit.test.mjs", "src/other.test.mjs"], manifest: result.manifest }), { range: "workspace:*" });
    assert.equal(again.changed, false);
  }
  assert.deepEqual([...testsRunBy("node --test --test-concurrency 1 test/unit.test.mjs", ["test/unit.test.mjs", "1"])], ["test/unit.test.mjs"]);
});

test("a command selecting a nonstandard file stays exactly as written, including globs and bare discovery", () => {
  for (const command of [
    "node --test test/smoke.mjs", "  node --test './test/smoke.mjs'  ",
    "node --test test/*.mjs", 'node --test "test/**/*.mjs"', "node --test",
    "node --test --test-concurrency 1 test/unit.test.mjs test/smoke.mjs",
  ]) {
    const result = standardize(command, ["test/smoke.mjs", "test/unit.test.mjs"]);
    assert.equal(result.manifest.scripts.test, command);
    assert.equal(result.test, null);
    assert.equal(result.changed, false);
    assert.match(result.kept, /outside the standard plan/u);
    assert.deepEqual(result.newlyRun, []);
  }
});

test("excluded files remain visible to migration without being activated in the standard plan", () => {
  const files = ["test/unit.test.mjs", "test/fixtures/fail.test.mjs", "vendor/fail.test.mjs", "inner/package.json", "inner/fail.test.mjs"];
  const plan = testPlan({ files });
  assert.deepEqual(plan.tests, ["test/unit.test.mjs"]);
  assert.deepEqual(plan.files, files);
  assert.equal(Object.isFrozen(plan.files), true);
  for (const command of ['node --test "**/*.test.mjs"', "node --test inner/fail.test.mjs", "node --test vendor/fail.test.mjs"]) {
    const result = standardize(command, files);
    assert.equal(result.manifest.scripts.test, command);
    assert.match(result.kept, /outside the standard plan/u);
  }
});

test("uncertain flags, missing operands, unsupported globs and selected directories fail closed", () => {
  for (const command of [
    "node --test --future-option 1 test/unit.test.mjs", "node --test --test-concurrency",
    "node --test --test-concurrency --test-only test/unit.test.mjs", "node --test --test-name-pattern 'unterminated",
    "node --test 'test/[us]*.mjs'", "node --test 'test/{unit,smoke}.mjs'", "node --test ../other.test.mjs",
    "node --test test/missing.test.mjs", "node --test test", "node --test test/*", 'node --test "test/*"',
    "node --test test/unit.test.mjs --test-concurrency 1",
  ]) {
    const result = standardize(command, ["test/unit.test.mjs", "test/deep/other.test.mjs"]);
    assert.equal(result.manifest.scripts.test, command, command);
    assert.equal(result.test, null, command);
    assert.ok(result.kept, command);
  }
  const missingListing = standardizePackageTests({ scripts: { test: "node --test test/unit.test.mjs" } }, { tests: ["test/unit.test.mjs"], check: [] }, { range: "workspace:*" });
  assert.match(missingListing.kept, /complete package file listing/u);
});

test("default Node discovery is compared using its test names and type-stripping flag", () => {
  const files = ["src/helper.mjs", "src/one.test.mjs", "src/two-test.mjs", "src/three_test.js", "src/test-four.cjs", "src/test.ts", "test/smoke.mjs", "node_modules/x/test/no.test.mjs"];
  assert.deepEqual([...testsRunBy("node --test", files)], files.slice(1, -1));
  assert.deepEqual([...testsRunBy("node --test --no-strip-types", files)], files.slice(1, -1).filter((file) => !file.endsWith(".ts")));
});

const codemod = fileURLToPath(new URL("../scripts/standardize-package-tests.mjs", import.meta.url));
const runner = fileURLToPath(new URL("../scripts/run-package-tests.mjs", import.meta.url));
const pass = 'import { test } from "node:test"; test("unit passes", () => {});\n';
const fail = 'import { test } from "node:test"; test("smoke must still fail", () => { throw new Error("preserved failure"); });\n';
function fixture(t, command, files) {
  const root = mkdtempSync(join(tmpdir(), "standardize-test-regression-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, text, options) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text, options); };
  write("package.json", JSON.stringify({ name: "@x/regression", scripts: { test: command } }, null, 2) + "\n");
  for (const [path, text] of Object.entries(files)) write(path, text);
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  delete environment.PACKAGE_TEST_DIRECTORY;
  const options = { cwd: root, encoding: "utf8", env: environment };
  for (const args of [["init", "--quiet"], ["add", "."]]) {
    const result = spawnSync("git", args, options);
    assert.equal(result.status, 0, result.stderr);
  }
  write("node_modules/.bin/run-package-tests", `#!${process.execPath}\nimport ${JSON.stringify(pathToFileURL(runner).href)};\n`, { mode: 0o755 });
  environment.PATH = `${join(root, "node_modules/.bin")}:${environment.PATH}`;
  return {
    write,
    run: () => spawnSync("sh", ["-c", JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts.test], options),
    migrate: () => {
      const result = spawnSync(process.execPath, [codemod, "--write"], options);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      return { report: JSON.parse(result.stdout), manifest: JSON.parse(readFileSync(join(root, "package.json"), "utf8")) };
    },
  };
}

for (const command of ["node --test test/smoke.mjs", "node --test test/*.mjs", 'node --test "test/**/*.mjs"', "node --test"]) {
  test(`actual CLI keeps a failing smoke test failing: ${command}`, (t) => {
    const pkg = fixture(t, command, { "test/smoke.mjs": fail });
    assert.equal(pkg.run().status, 1);
    const { report, manifest } = pkg.migrate();
    const after = pkg.run();
    assert.equal(after.status, 1, after.stdout + after.stderr);
    assert.equal(manifest.scripts.test, command);
    assert.equal(report.summary.testChanged, 0);
    assert.equal(report.summary.kept, 1);
    assert.match(report.packages[0].kept, /standard plan/u);
    assert.match(after.stdout + after.stderr, /preserved failure/u);
  });
}

test("actual CLI retains a mixed glob and nested-package selection without shrinking it", (t) => {
  const command = 'node --test "**/*.test.mjs"';
  const pkg = fixture(t, command, { "test/unit.test.mjs": pass, "inner/package.json": '{"name":"@x/inner"}', "inner/fail.test.mjs": fail });
  assert.equal(pkg.run().status, 1);
  const { report, manifest } = pkg.migrate();
  assert.equal(manifest.scripts.test, command);
  assert.match(report.packages.find(({ root }) => root === ".").kept, /inner\/fail\.test\.mjs/u);
  assert.equal(pkg.run().status, 1);
});

test("actual CLI preserves separate concurrency and quoted name-pattern operands through the runner", (t) => {
  const command = 'node --test --test-concurrency 1 --test-name-pattern "unit passes" test/unit.test.mjs';
  const pkg = fixture(t, command, { "test/unit.test.mjs": pass + fail.replace('import { test } from "node:test"; ', "") });
  const before = pkg.run();
  assert.equal(before.status, 0, before.stdout + before.stderr);
  const { report, manifest } = pkg.migrate();
  const after = pkg.run();
  assert.equal(after.status, 0, after.stdout + after.stderr);
  assert.equal(manifest.scripts.test, 'run-package-tests --test-concurrency 1 --test-name-pattern "unit passes"');
  assert.equal(report.summary.testChanged, 1);
  const receipt = JSON.parse(after.stdout.trim().split("\n").at(-1));
  assert.equal(receipt.ok, true);
  assert.equal(receipt.planned, 1);
  assert.equal(receipt.files, 1);
  assert.equal(receipt.passed, 1);
  assert.equal(receipt.failed, 0);
  assert.equal(pkg.migrate().report.summary.testChanged, 0);
});


test("an eligible failing standard test still fails after actual CLI migration", (t) => {
  const pkg = fixture(t, "node --test --test-concurrency 1 test/unit.test.mjs", { "test/unit.test.mjs": fail });
  assert.equal(pkg.run().status, 1);
  const { manifest } = pkg.migrate();
  assert.equal(manifest.scripts.test, "run-package-tests --test-concurrency 1");
  const after = pkg.run();
  assert.equal(after.status, 1, after.stdout + after.stderr);
  const receipt = JSON.parse(after.stdout.trim().split("\n").at(-1));
  assert.equal(receipt.ok, false);
  assert.equal(receipt.planned, 1);
  assert.equal(receipt.ran, 1);
  assert.equal(receipt.failed, 1);
});


test("actual CLI detects an untracked failing file selected by an existing glob", (t) => {
  const command = "node --test test/*.mjs";
  const pkg = fixture(t, command, { "test/unit.test.mjs": pass });
  pkg.write("test/smoke.mjs", fail);
  assert.equal(pkg.run().status, 1);
  const { manifest, report } = pkg.migrate();
  const after = pkg.run();
  assert.equal(after.status, 1, after.stdout + after.stderr);
  assert.equal(manifest.scripts.test, command);
  assert.match(report.packages.find(({ root }) => root === ".").kept, /test\/smoke\.mjs/u);
});


for (const command of ["node --test test/*.mjs", 'node --test "test/**/*.mjs"', "node --test", "node --test test/smoke.mjs"]) {
  test(`actual CLI preserves an ignored failing smoke test: ${command}`, (t) => {
    const pkg = fixture(t, command, { "test/unit.test.mjs": pass, ".gitignore": "test/smoke.mjs\n" });
    pkg.write("test/smoke.mjs", fail);
    assert.equal(pkg.run().status, 1);
    const { manifest, report } = pkg.migrate();
    const after = pkg.run();
    assert.equal(after.status, 1, after.stdout + after.stderr);
    assert.equal(manifest.scripts.test, command);
    assert.equal(report.summary.testChanged, 0);
    assert.match(report.packages.find(({ root }) => root === ".").kept, /ignored paths|cannot be safely resolved/u);
  });
}

test("ignored paths do not block an explicit, fully evidenced standard file", (t) => {
  const pkg = fixture(t, "node --test --test-concurrency 1 test/unit.test.mjs", { "test/unit.test.mjs": pass, ".gitignore": "test/smoke.mjs\n" });
  pkg.write("test/smoke.mjs", fail);
  assert.equal(pkg.run().status, 0);
  const { manifest } = pkg.migrate();
  assert.equal(manifest.scripts.test, "run-package-tests --test-concurrency 1");
  assert.equal(pkg.run().status, 0);
});
