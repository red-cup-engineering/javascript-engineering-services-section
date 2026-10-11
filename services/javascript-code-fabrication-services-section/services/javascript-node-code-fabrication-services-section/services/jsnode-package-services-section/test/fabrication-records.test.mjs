import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { listFabricationRecords } from "../src/fabrication-records.mjs";

test("fabrication discovery includes translatable orders, not arbitrary specification files", () => {
  const root = mkdtempSync(join(tmpdir(), "jsnode-fabrication-records-"));
  try {
    const specifications = join(root, "content/text/documents/specifications");
    mkdirSync(specifications, { recursive: true });
    const order = fileURLToPath(new URL("../content/text/documents/specifications/project-jsnode-operation-source-from-arguments.md", import.meta.url));
    cpSync(order, join(specifications, "closed-order.md"));
    writeFileSync(join(specifications, "design-bible.md"), "# Visual design language\n\nThis is reference material, not an artifact-fabrication order.\n");

    const result = listFabricationRecords(root);
    assert.deepEqual(result.workOrders.map(({ artifactId }) => artifactId), ["project-jsnode-operation-source-from-arguments"]);
    assert.match(result.workOrders[0].specificationDigest, /^sha256:[a-f0-9]{64}$/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
