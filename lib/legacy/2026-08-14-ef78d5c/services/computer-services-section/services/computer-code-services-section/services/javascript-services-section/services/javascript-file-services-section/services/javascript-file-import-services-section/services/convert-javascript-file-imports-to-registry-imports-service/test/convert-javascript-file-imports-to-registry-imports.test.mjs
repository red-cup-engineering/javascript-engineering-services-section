import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { convertJavascriptFileImportsToRegistryImports } from "../scripts/convert-javascript-file-imports-to-registry-imports.mjs";

test("composes the full carrier chain for one JavaScript file", async () => {
  const root = await mkdtemp(join(tmpdir(), "convert-registry-imports-"));
  try {
    const consumerDirectory = join(root, "consumer");
    const providerDirectory = join(root, "provider");
    await mkdir(join(consumerDirectory, "src"), { recursive: true });
    await mkdir(join(providerDirectory, "src"), { recursive: true });
    await writeFile(join(providerDirectory, "src/a.mjs"), "export {};\n");
    await writeFile(join(providerDirectory, "src/b.cjs"), "module.exports = {};\n");
    const path = join(consumerDirectory, "src/index.mjs");
    const text = "import '../../provider/src/a.mjs';\nconst b = require('../../provider/src/b.cjs');\nimport 'typescript';\n";
    const result = await convertJavascriptFileImportsToRegistryImports({
      reading: { type: "TextFileRead", path, text },
      custodies: [
        { type: "NpmPackageCustody", manifestPath: join(consumerDirectory, "package.json"), directory: consumerDirectory, name: "@owner/consumer", version: "1.0.0" },
        { type: "NpmPackageCustody", manifestPath: join(providerDirectory, "package.json"), directory: providerDirectory, name: "@owner/provider", version: "2.0.0", exports: "./src/index.mjs" },
      ],
    });
    assert.equal(result.content.text, "import '@owner/provider/src/a.mjs';\nconst b = require('@owner/provider/src/b.cjs');\nimport 'typescript';\n");
    assert.deepEqual(result.dependencies, [{ type: "NpmPackageDependencyProjection", manifestPath: join(consumerDirectory, "package.json"), dependency: "@owner/provider", version: "2.0.0" }]);
    assert.deepEqual(result.exports[0].exports, { ".": "./src/index.mjs", "./src/a.mjs": "./src/a.mjs", "./src/b.cjs": "./src/b.cjs" });
    assert.equal(result.edges.length, 2);
    assert.equal(result.skipped[0].reason, "non-relative-specifier");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
