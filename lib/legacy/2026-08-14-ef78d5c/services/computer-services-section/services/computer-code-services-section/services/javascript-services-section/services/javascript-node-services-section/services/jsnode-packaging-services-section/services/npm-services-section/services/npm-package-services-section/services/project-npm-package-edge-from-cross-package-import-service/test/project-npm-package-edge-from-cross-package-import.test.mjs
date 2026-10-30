import assert from "node:assert/strict";
import test from "node:test";
import { projectNpmPackageEdgeFromCrossPackageImport } from "../scripts/project-npm-package-edge-from-cross-package-import.mjs";

test("projects a structured package dependency edge", () => {
  assert.deepEqual(projectNpmPackageEdgeFromCrossPackageImport({
    type: "CrossPackageJavascriptFileImport",
    consumer: { name: "@owner/consumer" },
    provider: { name: "@owner/provider" },
    providerSubpath: "./src/value.mjs",
  }), {
    type: "NpmPackageDependencyEdge",
    consumer: "@owner/consumer",
    provider: "@owner/provider",
    providerSubpath: "./src/value.mjs",
  });
});
