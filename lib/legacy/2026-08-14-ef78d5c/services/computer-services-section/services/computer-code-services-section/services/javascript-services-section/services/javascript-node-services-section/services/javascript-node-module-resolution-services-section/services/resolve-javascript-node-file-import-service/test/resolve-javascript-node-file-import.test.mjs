import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveJavascriptNodeFileImport } from "../scripts/resolve-javascript-node-file-import.mjs";

const carriedImport = (path, specifier) => ({ type: "JavascriptFileImport", path, specifier, start: 0, end: specifier.length, kind: "import" });

test("resolves relative JSNode file imports including the established extension fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "resolve-jsnode-import-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/value.mjs"), "export {};\n");
    const input = carriedImport(join(root, "src/index.mjs"), "./value");
    assert.deepEqual(await resolveJavascriptNodeFileImport(input), {
      type: "ResolvedJavascriptNodeFileImport",
      import: input,
      targetPath: join(root, "src/value.mjs"),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns explicit refusals for bare and unresolved specifiers", async () => {
  const bare = carriedImport("/workspace/src/index.mjs", "typescript");
  assert.deepEqual(await resolveJavascriptNodeFileImport(bare), {
    type: "JavascriptNodeFileImportResolutionRefusal",
    import: bare,
    reason: "non-relative-specifier",
  });
  const missing = carriedImport("/workspace/src/index.mjs", "./missing.mjs");
  assert.equal((await resolveJavascriptNodeFileImport(missing)).reason, "unresolved-relative-specifier");
});
