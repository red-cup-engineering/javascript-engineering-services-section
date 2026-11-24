import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { planJSNodeMove } from "../src/plan-jsnode-move.mjs";

let root;

before(() => {
  root = mkdtempSync(path.join(tmpdir(), "plan-jsnode-move-"));
  const packageDirectory = path.join(root, "services", "example");
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(path.join(packageDirectory, "package.json"), JSON.stringify({ name: "@example/tool", version: "1.0.0" }));
});

after(() => rmSync(root, { recursive: true, force: true }));

describe("planJSNodeMove", () => {
  it("plans package and module views from the current workspace observer", async () => {
    const packagePlan = await planJSNodeMove(root, "look @example/tool");
    assert.equal(packagePlan.settlement, "admitted");
    assert.equal(packagePlan.href, "/jsnode/package?name=%40example%2Ftool");
    const modulePlan = await planJSNodeMove(root, "@example/tool/subpath");
    assert.deepEqual(modulePlan.target, { kind: "module", package: "@example/tool", module: "subpath" });
  });

  it("keeps unknown packages and empty searches as explicit obstructions", async () => {
    assert.equal((await planJSNodeMove(root, "map @example/missing")).settlement, "blocked");
    assert.deepEqual((await planJSNodeMove(root, "find")).obstructions, ["search query is empty"]);
  });
});
