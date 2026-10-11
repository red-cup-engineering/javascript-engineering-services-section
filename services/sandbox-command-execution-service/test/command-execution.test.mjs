import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { runTestsCommand } from "../src/command-execution.mjs";

test("nested node test verification executes instead of inheriting recursive-run suppression", () => {
  const root = mkdtempSync(join(tmpdir(), "union-executor-nested-test-"));
  writeFileSync(join(root, "failure.test.mjs"), 'import test from "node:test"; import assert from "node:assert/strict"; test("real nested failure", () => assert.equal(1, 2));\n');
  const result = runTestsCommand(root, "node --test failure.test.mjs");
  assert.equal(result.passed, false);
  assert.match(result.output, /real nested failure/);
  assert.doesNotMatch(result.output, /skipping running files/);
});

test("direct node verification binds to the provider runtime rather than ambient PATH", () => {
  const root = mkdtempSync(join(tmpdir(), "union-executor-runtime-"));
  const fakeBin = join(root, "fake-bin");
  const fakeNode = join(fakeBin, "node");
  const priorPath = process.env.PATH;
  mkdirSync(fakeBin);
  writeFileSync(join(root, "runtime.mjs"), 'if (process.execPath !== process.argv[2]) process.exit(9);\n');
  writeFileSync(fakeNode, "#!/bin/sh\necho fake-node >&2\nexit 88\n");
  chmodSync(fakeNode, 0o755);
  try {
    process.env.PATH = `${fakeBin}:${priorPath || ""}`;
    const result = runTestsCommand(root, `node runtime.mjs ${process.execPath}`);
    assert.equal(result.passed, true);
    assert.doesNotMatch(result.output, /fake-node/);
  } finally {
    priorPath === undefined ? delete process.env.PATH : process.env.PATH = priorPath;
  }
});

test("spawn failures remain visible to verification callers", () => {
  const result = runTestsCommand(tmpdir(), "command-that-does-not-exist-union-test", { shell: false });
  assert.equal(result.passed, false);
  assert.match(result.output, /ENOENT|not found/i);
});
