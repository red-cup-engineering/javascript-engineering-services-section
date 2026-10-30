import assert from "node:assert/strict";
import test from "node:test";

import { normalizeJsnodePackageVersion } from "../scripts/normalize-jsnode-package-version.mjs";

test("preserves an exact numeric version", () => {
  assert.equal(normalizeJsnodePackageVersion("2.3.4"), "2.3.4");
});

test("uses the repository fallback for absent or non-exact versions", () => {
  assert.equal(normalizeJsnodePackageVersion(), "0.1.0");
  assert.equal(normalizeJsnodePackageVersion("workspace:*"), "0.1.0");
});
