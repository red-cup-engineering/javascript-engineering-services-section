import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, it } from "node:test";

import { planWorkspacePackageDescription } from "../src/plan-jsnode-description.mjs";

let root;
before(() => {
  root = mkdtempSync(path.join(tmpdir(), "plan-description-"));
  const directory = path.join(root, "services", "tool");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: "@example/tool", version: "1.0.0", description: "old" }));
});
after(() => rmSync(root, { recursive: true, force: true }));

it("plans but does not perform a package description update", () => {
  const result = planWorkspacePackageDescription(root, { package: "@example/tool", description: "  better   words  " });
  assert.equal(result.settlement, "admitted");
  assert.equal(result.nextDescription, "better words");
  assert.equal(result.previewManifest.description, "better words");
});
