import assert from "node:assert/strict";
import test from "node:test";
import { classifyCrossPackageJavascriptFileImport } from "../scripts/classify-cross-package-javascript-file-import.mjs";

const consumer = { type: "NpmPackageCustody", manifestPath: "/workspace/consumer/package.json", directory: "/workspace/consumer", name: "@owner/consumer", version: "1.0.0" };
const provider = { type: "NpmPackageCustody", manifestPath: "/workspace/provider/package.json", directory: "/workspace/provider", name: "@owner/provider", version: "2.0.0" };
const importRecord = { type: "JavascriptFileImport", path: "/workspace/consumer/src/index.mjs", specifier: "../../provider/src/value.mjs", start: 8, end: 34, kind: "import" };
const resolution = { type: "ResolvedJavascriptNodeFileImport", import: importRecord, targetPath: "/workspace/provider/src/value.mjs" };

test("classifies a resolved import across two package territories", () => {
  assert.deepEqual(classifyCrossPackageJavascriptFileImport({ resolution, custodies: [consumer, provider] }), {
    type: "CrossPackageJavascriptFileImport",
    import: importRecord,
    targetPath: "/workspace/provider/src/value.mjs",
    consumer,
    provider,
    providerSubpath: "./src/value.mjs",
  });
});

test("refuses imports which do not cross package custody", () => {
  const localResolution = { ...resolution, targetPath: "/workspace/consumer/src/value.mjs" };
  assert.equal(classifyCrossPackageJavascriptFileImport({ resolution: localResolution, custodies: [consumer, provider] }).reason, "same-package-import");
});
