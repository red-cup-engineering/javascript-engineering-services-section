import assert from "node:assert/strict";
import test from "node:test";
import { convertJavascriptFileImportToRegistryImport } from "../scripts/convert-javascript-file-import-to-registry-import.mjs";

test("converts exactly one established cross-package import to a text edit", () => {
  assert.deepEqual(convertJavascriptFileImportToRegistryImport({
    type: "CrossPackageJavascriptFileImport",
    import: { type: "JavascriptFileImport", path: "/workspace/consumer/src/index.mjs", specifier: "../../provider/src/value.mjs", start: 20, end: 48, kind: "import" },
    provider: { type: "NpmPackageCustody", name: "@owner/provider" },
    providerSubpath: "./src/value.mjs",
  }), {
    type: "TextFileContentEdit",
    derivation: "JavascriptFileImportRegistryConversion",
    path: "/workspace/consumer/src/index.mjs",
    start: 20,
    end: 48,
    before: "../../provider/src/value.mjs",
    after: "@owner/provider/src/value.mjs",
  });
});
