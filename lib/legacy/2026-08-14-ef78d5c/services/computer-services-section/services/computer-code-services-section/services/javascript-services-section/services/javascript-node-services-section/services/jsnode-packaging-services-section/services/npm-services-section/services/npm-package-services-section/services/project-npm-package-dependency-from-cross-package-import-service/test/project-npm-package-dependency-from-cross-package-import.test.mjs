import assert from "node:assert/strict";
import test from "node:test";
import { projectNpmPackageDependencyFromCrossPackageImport } from "../scripts/project-npm-package-dependency-from-cross-package-import.mjs";

test("projects the provider as an exact consumer dependency", () => {
  assert.deepEqual(projectNpmPackageDependencyFromCrossPackageImport({
    type: "CrossPackageJavascriptFileImport",
    consumer: { manifestPath: "/workspace/consumer/package.json" },
    provider: { name: "@owner/provider", version: "2.0.0" },
  }), {
    type: "NpmPackageDependencyProjection",
    manifestPath: "/workspace/consumer/package.json",
    dependency: "@owner/provider",
    version: "2.0.0",
  });
});
