import assert from "node:assert/strict";
import test from "node:test";

import { registry } from "../scripts/registry.mjs";

test("exports the section's package-set behaviors", () => {
  assert.deepEqual(Object.keys(registry.behaviors).sort(), ["observeNpmPackageDirectories", "readNpmPackageSetInfo"]);
  assert.equal(Object.isFrozen(registry), true);
});
