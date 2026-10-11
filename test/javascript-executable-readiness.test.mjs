import assert from "node:assert/strict";
import test from "node:test";

import { assessJavascriptExecutableReadiness } from "../scripts/assess-javascript-executable-readiness.mjs";

test("measures an explicit executable catalog without acquiring package state", () => {
  const result = assessJavascriptExecutableReadiness({
    packageName: "example",
    executableNames: ["read", "write"],
    generatedAt: "2026-08-30T00:00:00.000Z",
    criteria: [
      { id: "complete", title: "Complete", required: ["read", "write"], claim: "Both faces exist.", next: "none", sourceIds: [] },
      { id: "partial", title: "Partial", required: ["read", "delete"], claim: "Some faces exist.", next: "add delete", sourceIds: [] },
    ],
  });
  assert.deepEqual(result.summary, { score: 75, present: 1, partial: 1, missing: 0 });
  assert.deepEqual(result.criteria[1].missing, ["delete"]);
  assert.deepEqual(result.nextWork, ["partial: add delete"]);
});
