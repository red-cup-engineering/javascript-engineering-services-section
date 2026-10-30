import assert from "node:assert/strict";
import test from "node:test";

import { registry } from "../scripts/registry.mjs";

test("exports the section's argv behaviors", () => {
  assert.deepEqual(Object.keys(registry.behaviors).sort(), ["parseJavascriptArgv", "projectJavascriptArgvTail"]);
  assert.equal(Object.isFrozen(registry), true);
  assert.equal(Object.isFrozen(registry.behaviors), true);
});
