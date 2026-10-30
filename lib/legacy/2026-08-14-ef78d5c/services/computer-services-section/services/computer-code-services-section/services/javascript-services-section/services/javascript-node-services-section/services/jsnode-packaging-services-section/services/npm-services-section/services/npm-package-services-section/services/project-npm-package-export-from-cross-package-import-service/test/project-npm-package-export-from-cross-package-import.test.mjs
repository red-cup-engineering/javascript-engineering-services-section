import assert from "node:assert/strict";
import test from "node:test";
import { projectNpmPackageExportFromCrossPackageImport } from "../scripts/project-npm-package-export-from-cross-package-import.mjs";

test("retains the provider main export while adding the imported subpath", () => {
  assert.deepEqual(projectNpmPackageExportFromCrossPackageImport({
    crossPackageImport: {
      type: "CrossPackageJavascriptFileImport",
      provider: { manifestPath: "/workspace/provider/package.json", exports: "./src/index.mjs" },
      providerSubpath: "./src/value.mjs",
    },
  }), {
    type: "NpmPackageExportsProjection",
    manifestPath: "/workspace/provider/package.json",
    exports: { ".": "./src/index.mjs", "./src/value.mjs": "./src/value.mjs" },
  });
});

test("accepts its prior projection when several imports expose one provider", () => {
  const first = projectNpmPackageExportFromCrossPackageImport({
    crossPackageImport: {
      type: "CrossPackageJavascriptFileImport",
      provider: { manifestPath: "/workspace/provider/package.json" },
      providerSubpath: "./src/a.mjs",
    },
  });
  const second = projectNpmPackageExportFromCrossPackageImport({
    crossPackageImport: {
      type: "CrossPackageJavascriptFileImport",
      provider: { manifestPath: "/workspace/provider/package.json" },
      providerSubpath: "./src/b.mjs",
    },
    prior: first,
  });
  assert.deepEqual(second.exports, { "./src/a.mjs": "./src/a.mjs", "./src/b.mjs": "./src/b.mjs" });
});
