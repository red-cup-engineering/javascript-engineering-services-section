import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNpmPackageManifestVersion } from "../scripts/normalize-npm-package-manifest-version.mjs";

test("applies normalized version policy without changing other fields", () => {
  assert.deepEqual(normalizeNpmPackageManifestVersion({ name: "example", version: "workspace:*" }), {
    name: "example",
    version: "0.1.0",
  });
});
