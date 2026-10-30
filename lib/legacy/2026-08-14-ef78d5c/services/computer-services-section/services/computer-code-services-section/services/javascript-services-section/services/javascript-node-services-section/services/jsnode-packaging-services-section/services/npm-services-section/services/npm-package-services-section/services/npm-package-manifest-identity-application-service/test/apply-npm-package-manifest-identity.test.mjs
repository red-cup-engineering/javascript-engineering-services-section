import assert from "node:assert/strict";
import test from "node:test";

import { applyNpmPackageManifestIdentity } from "../scripts/apply-npm-package-manifest-identity.mjs";

test("applies the explicit identity without changing other manifest fields", () => {
  assert.deepEqual(applyNpmPackageManifestIdentity({
    manifest: { name: "prior", description: "Example" },
    identity: { name: "@owner/example" },
  }), { name: "@owner/example", description: "Example" });
});
