import assert from "node:assert/strict";
import test from "node:test";
import { applyNpmPackageDependencyProjection } from "../scripts/apply-npm-package-dependency-projection.mjs";

test("adds one exact dependency while retaining existing dependencies", () => {
  assert.deepEqual(applyNpmPackageDependencyProjection({
    manifest: { name: "@owner/consumer", dependencies: { prior: "1.0.0" } },
    projection: { type: "NpmPackageDependencyProjection", dependency: "@owner/provider", version: "2.0.0" },
  }), { name: "@owner/consumer", dependencies: { prior: "1.0.0", "@owner/provider": "2.0.0" } });
});
