import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNpmOwner } from "../scripts/normalize-npm-owner.mjs";

test("normalizes scoped and uppercase owner spelling", () => {
  assert.equal(normalizeNpmOwner("@Example-Owner"), "example-owner");
});

test("refuses an invalid npm owner", () => {
  assert.throws(() => normalizeNpmOwner("bad_owner"), /valid unscoped npm owner/u);
});
