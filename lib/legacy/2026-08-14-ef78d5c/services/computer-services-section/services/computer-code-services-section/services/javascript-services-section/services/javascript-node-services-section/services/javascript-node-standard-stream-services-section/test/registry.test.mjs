import assert from "node:assert/strict";
import test from "node:test";

import { registry } from "../scripts/registry.mjs";

test("exports the section's standard-stream behaviors", () => {
  assert.deepEqual(Object.keys(registry.behaviors).sort(), ["readJavascriptNodeStandardInputText", "writeJavascriptNodeStandardOutputText"]);
  assert.equal(Object.isFrozen(registry), true);
});
