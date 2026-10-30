import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { project561GroupJavascriptCapabilityGraph } from "../scripts/project-561-group-javascript-capability-graph.mjs";

test("projects scripts and local imports without admitting the legacy tree to workspace discovery", () => {
  const root = mkdtempSync(join(tmpdir(), "561-capability-graph-"));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "scripts", "read-thing.mjs"), 'import { readThing } from "../src/read-thing.mjs";\nreadThing();\n');
  writeFileSync(join(root, "src", "read-thing.mjs"), "export function readThing() {}\n");
  const projection = project561GroupJavascriptCapabilityGraph(root);
  assert.equal(projection.isDag, true);
  assert.deepEqual(projection.graph.nodes.map(({ kind }) => kind).sort(), ["javascript-executable", "javascript-package-carrier", "javascript-source-module"]);
  assert.deepEqual(projection.graph.edges.map(({ kind }) => kind).sort(), ["contains", "imports"]);
});

test("uses an executable node when one script imports another", () => {
  const root = mkdtempSync(join(tmpdir(), "561-capability-graph-"));
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "main.mjs"), 'import "./shared.mjs";\n');
  writeFileSync(join(root, "scripts", "shared.mjs"), "export const shared = true;\n");
  const projection = project561GroupJavascriptCapabilityGraph(root);
  assert.deepEqual(projection.graph.nodes.map(({ id }) => id).filter((id) => id.startsWith("script:")).sort(), ["script:scripts/main.mjs", "script:scripts/shared.mjs"]);
  assert.equal(projection.graph.nodes.some(({ id }) => id === "module:scripts/shared.mjs"), false);
});
