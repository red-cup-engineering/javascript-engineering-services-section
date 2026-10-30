import assert from "node:assert/strict";
import test from "node:test";

import { registry } from "../scripts/registry.mjs";

test("exports the section's command execution behaviors", () => {
  assert.deepEqual(Object.keys(registry.behaviors).sort(), [
    "executeJavascriptNodeCommand",
    "projectJavascriptNodeCommandExecutionReceipt",
  ]);
  assert.equal(Object.isFrozen(registry), true);
});
