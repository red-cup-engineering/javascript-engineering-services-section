import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admittedAssayNames, testRunCompletedAllAssays } from "../src/assay-completion.mjs";

const expected = ["double-value: positive", "double-value: clause assay negative"];
const run = source => {
  const dir = mkdtempSync(join(tmpdir(), "jsnode-test-completion-"));
  try {
    const path = join(dir, "generated.test.mjs");
    writeFileSync(path, source);
    return spawnSync(process.execPath, ["--test", "--test-reporter=tap", path], {
      cwd: dir, env: { TZ:"UTC" }, encoding:"utf8", timeout:10000,
    });
  } finally {
    rmSync(dir, { recursive: true, force:true });
  }
};

test("real Node tests must execute both admitted and independently derived cases", () => {
  const observed = run(`import test from "node:test";
import assert from "node:assert/strict";
test("double-value: positive", () => assert.equal(2*2,4));
test("double-value: clause assay negative", () => assert.equal(-2*2,-4));`);
  assert.equal(observed.status,0,observed.stderr);
  assert.equal(testRunCompletedAllAssays(observed.stdout, expected),true,observed.stdout);
});

test("a generated import that exits zero before tests run is never admitted", () => {
  // This behavior is observed on Node itself: the runner labels the file
  // successful even though the specified body checks were never entered.
  const observed = run("process.exit(0);");
  assert.equal(observed.status,0,observed.stdout);
  assert.match(observed.stdout,/# pass 1/u);
  assert.equal(testRunCompletedAllAssays(observed.stdout,expected),false);
});

test("a module's forged TAP lines are treated as comments by the trusted runner", () => {
  const observed = run(`console.log("ok 1 - double-value: positive");
console.log("ok 2 - double-value: clause assay negative");
process.exit(0);`);
  assert.equal(observed.status,0,observed.stderr);
  assert.equal(testRunCompletedAllAssays(observed.stdout,expected),false);
});

test("skipped, todo and cancelled test outcomes do not satisfy fabrication", () => {
  for (const code of [
    `import test from "node:test";
test.skip("double-value: positive",()=>{});
test("double-value: clause assay negative",()=>{});`,
    `import test from "node:test";
test.todo("double-value: positive");
test("double-value: clause assay negative",()=>{});`,
  ]) {
    const observed=run(code);
    assert.equal(observed.status,0,observed.stderr);
    assert.equal(testRunCompletedAllAssays(observed.stdout,expected),false);
  }
});

test("extra, missing or duplicate test names cannot obscure absent behavior", () => {
  const observed=run(`import test from "node:test";
test("double-value: positive",()=>{});
test("double-value: positive",()=>{});`);
  assert.equal(observed.status,0);
  assert.equal(testRunCompletedAllAssays(observed.stdout,expected),false);
  assert.equal(testRunCompletedAllAssays(observed.stdout,
    ["double-value: positive","double-value: positive"]),false);
});

test("expected labels are derived from the actual example and clause-test generation order", () => {
  const closure={
    operations:[{name:"double-value"},{name:"increment-value"}],
    examples:[{operation:"double-value",name:"positive"},
      {operation:"increment-value",name:"zero"}],
  };
  const cases=[
    {operation:"double-value",name:"negative"},
    {operation:"increment-value",name:"large"},
  ];
  assert.deepEqual(admittedAssayNames(closure,cases),[
    "double-value: positive","double-value: clause assay negative",
    "increment-value: zero","increment-value: clause assay large",
  ]);
  assert.equal(Object.isFrozen(admittedAssayNames(closure,cases)),true);
  assert.equal(testRunCompletedAllAssays("TAP version 13\n# tests 0\n# pass 0\n",[]),false);
});
