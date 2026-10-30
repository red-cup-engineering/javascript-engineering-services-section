import assert from "node:assert/strict";
import test from "node:test";
import { applyNpmPackageExportsProjection } from "../scripts/apply-npm-package-exports-projection.mjs";

test("replaces the manifest exports with the established projection", () => {
  assert.deepEqual(applyNpmPackageExportsProjection({
    manifest: { name: "@owner/provider", exports: "./src/index.mjs" },
    projection: { type: "NpmPackageExportsProjection", exports: { ".": "./src/index.mjs", "./src/a.mjs": "./src/a.mjs" } },
  }), { name: "@owner/provider", exports: { ".": "./src/index.mjs", "./src/a.mjs": "./src/a.mjs" } });
});
