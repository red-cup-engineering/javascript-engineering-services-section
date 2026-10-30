import assert from "node:assert/strict";
import test from "node:test";
import { projectNpmPackageCustody } from "../scripts/project-npm-package-custody.mjs";

test("projects package identity and filesystem territory from one manifest reading", () => {
  assert.deepEqual(projectNpmPackageCustody({
    type: "NpmPackageManifestRead",
    path: "/workspace/provider/package.json",
    manifest: { name: "@owner/provider", version: "1.2.3", exports: "./src/index.mjs" },
  }), {
    type: "NpmPackageCustody",
    manifestPath: "/workspace/provider/package.json",
    directory: "/workspace/provider",
    name: "@owner/provider",
    version: "1.2.3",
    exports: "./src/index.mjs",
  });
});
