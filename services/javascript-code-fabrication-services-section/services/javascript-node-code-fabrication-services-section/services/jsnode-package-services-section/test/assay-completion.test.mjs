import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admittedAssayNames, assertAdmittedAssayNames, testRunCompletedAllAssays, receiveIsolatedAssayOutcome } from "../src/assay-completion.mjs";

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

test("the host's claimed success must also carry every actual complete assay", () => {
  const observed = run(`import test from "node:test";
test("double-value: positive",()=>{});
test("double-value: clause assay negative",()=>{});`);
  const record = { isolated: true, status: observed.status, signal: observed.signal,
    stdout: observed.stdout, stderr: observed.stderr, truncated: false, timedOut: false };
  assert.deepEqual(receiveIsolatedAssayOutcome(record,expected), {passed:true});
  for (const changed of [
    { isolated: false }, { isolated: null }, { status: null },
    { status: 0, stdout: "TAP version 13\\n# pass 0\\n" },
    { timedOut: true }, { truncated: true }, { signal: "SIGKILL" },
    { stdout: "x".repeat(2 * 1024 * 1024 + 1) },
  ]) {
    const result = receiveIsolatedAssayOutcome({...record,...changed},expected);
    assert.equal(result.passed,false);
    assert.notEqual(result.code,undefined);
  }
});

test("the actual Node exit-zero bypass remains refused even with a purported host result", () => {
  const observed = run("process.exit(0);");
  const record = { isolated: true, status: observed.status, signal: observed.signal,
    stdout: observed.stdout, stderr: observed.stderr };
  assert.equal(receiveIsolatedAssayOutcome(record,expected).code,"ASSAY_INCOMPLETE");
});

test("a failing host test is rejected without inventing a passing code-generation outcome", () => {
  const observed = run(`import test from "node:test";
test("double-value: positive",()=>{throw new Error("incorrect source");});
test("double-value: clause assay negative",()=>{});`);
  const result = receiveIsolatedAssayOutcome({isolated:true,status:observed.status,
    stdout:observed.stdout,stderr:observed.stderr,signal:observed.signal}, expected);
  assert.equal(result.passed,false);
  assert.equal(result.code,"ASSAY_TEST_FAILED");
  assert.match(result.failure,/not ok/u,
    "When actual Node TAP contains a failure case the receiver must retain it. Observed host stdout: "+
      JSON.stringify(observed.stdout.slice(0,1800)));
});

test("unattributed failing Node process produces an honest nonempty receipt, not a fabricated test failure", () => {
  for (const stdout of [
    "TAP version 13\n# tests 1\n# fail 1\n",
    "TAP version 13\n# Subtest: interrupted\n# tests 0\n",
    "",
  ]) {
    const result = receiveIsolatedAssayOutcome({
      isolated: true, status: 1, stdout, stderr: "",
    }, expected);
    assert.equal(result.passed, false);
    assert.equal(result.code, "ASSAY_TEST_FAILED");
    assert.match(result.failure, /exited status 1; no attributable TAP failure or stderr/u);
    assert.doesNotMatch(result.failure, /not ok/u,
      "unknown failure may not impersonate a particular test case");
  }
});

test("indented Node TAP failure remains correctly attributed to the observed case", () => {
  const result = receiveIsolatedAssayOutcome({
    isolated: true, status: 1, stderr: "",
    stdout: "TAP version 13\n    not ok 1 - double-value: clause assay negative\n# tests 1\n# fail 1\n",
  }, expected);
  assert.equal(result.passed, false);
  assert.equal(result.code, "ASSAY_TEST_FAILED");
  assert.match(result.failure, /not ok 1 - double-value: clause assay negative/u);
});


test("root test plan and sequential ordinals are proof obligations, not decorative TAP strings", () => {
  const counters = [
    "# tests 2", "# pass 2", "# fail 0",
    "# cancelled 0", "# skipped 0", "# todo 0",
  ].join("\n");
  const good = [
    "TAP version 13",
    "ok 1 - " + expected[0],
    "ok 2 - " + expected[1],
    "1..2", counters,
  ].join("\n");
  assert.equal(testRunCompletedAllAssays(good, expected), true);
  const variants = [
    {name: "no root plan; arbitrary ordinal labels", reason: "ROOT_PLAN_MISSING_OR_REPEATED", body: [
      "TAP version 13", "ok 21 - " + expected[0],
      "ok 48 - " + expected[1], counters,
    ].join("\n")},
    {name: "root plan contradicts the observed results", reason: "ROOT_PLAN_COUNT_MISMATCH", body: good.replace("1..2", "1..0")},
    {name: "duplicate test ordinal", reason: "ROOT_ORDINAL_MISMATCH", body: good.replace("ok 2 - ", "ok 1 - ")},
    {name: "root tests not consecutively numbered", reason: "ROOT_ORDINAL_MISMATCH", body: good.replace("ok 2 - ", "ok 3 - ")},
    {name: "indented nested results pose as root tests", reason: "ROOT_RESULTS_INCOMPLETE", body: good.replaceAll("\nok ", "\n    ok ")},
    {name: "repeated root plan", reason: "ROOT_PLAN_MISSING_OR_REPEATED", body: good.replace("1..2", "1..2\n1..2")},
  ];
  for (const {name, body, reason} of variants) {
    assert.equal(testRunCompletedAllAssays(body, expected), false, name);
    const received = receiveIsolatedAssayOutcome({
      isolated: true, status: 0, stdout: body, stderr: "",
      timedOut: false, truncated: false, signal: null,
    }, expected);
    assert.equal(received.passed, false, name);
    assert.equal(received.code, "ASSAY_INCOMPLETE", name);
    assert.equal(received.reason,reason,"typed proof source: "+name);
  }
});

const receivedRoots = expected.map((name, index) => `ok ${index + 1} - ${name}`);
const receivedCounters = ["# tests 2", "# pass 2", "# fail 0", "# cancelled 0", "# skipped 0", "# todo 0"];
const completeTranscript = ["TAP version 13", ...receivedRoots, "1..2", ...receivedCounters, ""].join("\n");
for (const [name, stdout, reason] of [
  ["runner accounting before root results is not a completed observation",
    ["TAP version 13", ...receivedCounters, ...receivedRoots, "1..2", ""].join("\n"),
    "RUNNER_COUNTERS_INCONSISTENT"],
  ["a root bailout cannot be erased by an otherwise complete passing summary",
    completeTranscript + "Bail out! host observation interrupted\n", "ROOT_TAP_BAILOUT"],
  ["a malformed extra failing root result cannot disappear from completion",
    completeTranscript.replace("1..2", "not ok 0 - unadmitted failing result\n1..2"), "ROOT_RESULT_MALFORMED"],
]) test(name, () => {
  assert.equal(testRunCompletedAllAssays(stdout, expected), false);
  const received = receiveIsolatedAssayOutcome({ isolated: true, status: 0,
    stdout, stderr: "", signal: null, timedOut: false, truncated: false }, expected);
  assert.equal(received.passed, false);
  assert.equal(received.code, "ASSAY_INCOMPLETE");
  assert.equal(received.reason, reason);
});

test("host assay text limits apply to captured UTF-8 bytes, not JavaScript character counts", () => {
  const observed=run('import test from "node:test";\ntest("double-value: positive",()=>{});\ntest("double-value: clause assay negative",()=>{});');
  assert.equal(observed.status,0);
  assert.equal(testRunCompletedAllAssays(observed.stdout,expected),true);
  const received = receiveIsolatedAssayOutcome({
    isolated: true, status: 0, stdout: observed.stdout,
    // Over 2 MiB in UTF-8 but under 2 million UTF-16 string units.
    stderr: "é".repeat(1_100_000), timedOut: false, truncated: false,
    signal: null,
  }, expected);
  assert.equal(received.passed,false);
  assert.equal(received.code,"ASSAY_EXECUTION_REFUSED");
  assert.equal(received.reason,"CAPTURED_OUTPUT_TOO_LARGE");
});


test("original TAP labels are admitted as one unique namespace before a source maker can spend", () => {
  const original = {
    operations:[{name:"sort-values"}],
    examples:[{operation:"sort-values",name:"normal"}],
  };
  assert.deepEqual(assertAdmittedAssayNames(original, [
    {operation:"sort-values",name:"independent-case"},
  ]), ["sort-values: normal", "sort-values: clause assay independent-case"]);

  const clash = structuredClone(original);
  clash.examples[0].name = "clause assay independent-case";
  assert.throws(() => assertAdmittedAssayNames(clash, [
    {operation:"sort-values",name:"independent-case"},
  ]), /runner names must be distinct/u);

  for (const invalidName of ["line\nbreak", "carriage\rreturn", "escape\u001b[31m",
    "null\u0000byte", "Unicode\u2028separator", "x".repeat(520), ""]) {
    const malformed = structuredClone(original);
    malformed.examples[0].name = invalidName;
    assert.throws(() => assertAdmittedAssayNames(malformed), TypeError,
      "a hazardous exact native test name must refuse before it reaches TAP");
    assert.equal(testRunCompletedAllAssays("TAP version 13\n", [
      "sort-values: " + invalidName,
    ]), false);
  }
  assert.deepEqual(assertAdmittedAssayNames(original), ["sort-values: normal"]);
});

test("Node TAP escapes punctuation in labels, so original exact names must refuse it", () => {
  for (const unsafeName of ["hash#marker", "path\\fragment"]) {
    const exact = "double-value: " + unsafeName;
    const observed = run('import test from "node:test";\ntest(' + JSON.stringify(exact) + ',()=>{});');
    assert.equal(observed.status, 0, observed.stderr);
    const root = observed.stdout.split("\n").find(line => line.startsWith("ok 1 - "));
    assert.ok(root, observed.stdout);
    assert.notEqual(root, "ok 1 - " + exact,
      "Node's TAP reporter must not be mistaken for the source-owned literal label");
    const order = { operations:[{name:"double-value"}],
      examples:[{operation:"double-value",name:unsafeName}] };
    assert.throws(() => assertAdmittedAssayNames(order), TypeError);
    assert.equal(testRunCompletedAllAssays(observed.stdout, [exact]), false);
  }
  const nonPrintable = { operations:[{name:"double-value"}],
    examples:[{operation:"double-value",name:"C1\u0085control"}] };
  assert.throws(() => assertAdmittedAssayNames(nonPrintable), TypeError);
});
