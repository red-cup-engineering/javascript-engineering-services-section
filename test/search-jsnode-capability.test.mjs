import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, it } from "node:test";

import { check561GroupJSNodeCapability, search561GroupJSNodeCapability } from "../src/search-jsnode-capability.mjs";

let root;
before(() => {
  root = mkdtempSync(path.join(tmpdir(), "search-capability-"));
  const directory = path.join(root, "services", "graph-tool");
  mkdirSync(path.join(directory, "dist"), { recursive: true });
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "@example/graph-tool", version: "1.0.0", description: "Projects dependency graphs" }));
  writeFileSync(path.join(directory, "dist", "index.d.ts"), "export interface GraphNode { id: string }\nexport declare function projectGraph(node: GraphNode): string;\n");
});
after(() => rmSync(root, { recursive: true, force: true }));

it("searches package and API carriers without a cached manifold index", async () => {
  const result = await search561GroupJSNodeCapability(root, { q: "graph" });
  assert.equal(result.packages[0].name, "@example/graph-tool");
  assert.equal(result.functions[0].name, "projectGraph");
  const check = await check561GroupJSNodeCapability(root, { q: "graph" });
  assert.equal(check.foundExistingCarrier, true);
});
