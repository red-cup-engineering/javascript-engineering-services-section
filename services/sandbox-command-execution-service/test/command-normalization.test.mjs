import assert from "node:assert/strict";
import test from "node:test";
import { directArguments, normalizeCommandResult, normalizeVerificationResult } from "../src/command-normalization.mjs";

test("normalizes a declared direct command without granting shell syntax", () => {
  assert.deepEqual(directArguments("node --test test/example.test.mjs"), ["node", "--test", "test/example.test.mjs"]);
  assert.equal(directArguments("node test.mjs && rm -rf scratch"), null);
  assert.equal(directArguments(""), null);
});

test("normalizes process and verification results deterministically", () => {
  const result = normalizeCommandResult({ status: 1, stdout: undefined, stderr: "failed", error: undefined, signal: null });
  assert.deepEqual(result, { code: 1, stdout: "", stderr: "failed", error: "", cancelled: false });
  assert.deepEqual(normalizeVerificationResult(result), { passed: false, output: "exit=1\n\nfailed\n" });
});
