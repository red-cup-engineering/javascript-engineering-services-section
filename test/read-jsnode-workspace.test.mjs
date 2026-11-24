import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import {
  read561GroupJSNodeFunctions,
  read561GroupJSNodeModule,
  read561GroupJSNodePackage,
  read561GroupJSNodeSymbol,
  read561GroupJSNodeTypes,
  read561GroupJSNodeWorkspaceGraph,
  topologize561GroupJSNode,
} from "../src/read-jsnode-workspace.mjs";

let root;

function writePackage(relative, manifest, declarations) {
  const directory = path.join(root, relative);
  mkdirSync(path.join(directory, "dist"), { recursive: true });
  writeFileSync(path.join(directory, "package.json"), JSON.stringify(manifest));
  writeFileSync(path.join(directory, "dist", "index.d.ts"), declarations);
}

before(() => {
  root = mkdtempSync(path.join(tmpdir(), "read-jsnode-workspace-"));
  writePackage("services/alpha", {
    name: "@example/alpha",
    version: "1.0.0",
    type: "module",
    exports: { ".": "./dist/index.mjs" },
    dependencies: { "@example/beta": "1.0.0" },
  }, "export interface Input { value: string }\nexport type Output = string;\nexport declare function transform(input: Input): Output;\n");
  writePackage("services/beta", {
    name: "@example/beta",
    version: "1.0.0",
    type: "module",
    exports: { ".": "./dist/index.mjs" },
  }, "export declare function value(): string;\n");
});

after(() => rmSync(root, { recursive: true, force: true }));

describe("561 Group JSNode reads", () => {
  it("reads one package through the current workspace carrier", async () => {
    const result = await read561GroupJSNodePackage(root, { package: "@example/alpha" });
    assert.equal(result.package.name, "@example/alpha");
    assert.deepEqual(result.package.dependencies, ["@example/beta"]);
  });

  it("reads a declared module subpath", async () => {
    const result = await read561GroupJSNodeModule(root, { package: "@example/alpha", module: "." });
    assert.equal(result.declared, true);
    assert.deepEqual(result.availableModules, ["."]);
  });

  it("reads attributed types, functions, and a named symbol", () => {
    const types = read561GroupJSNodeTypes(root, { package: "@example/alpha" });
    assert.deepEqual(types.types.map(({ name }) => name).sort(), ["Input", "Output"]);
    const functions = read561GroupJSNodeFunctions(root, { package: "@example/alpha" });
    assert.deepEqual(functions.functions.map(({ name }) => name), ["transform"]);
    const symbol = read561GroupJSNodeSymbol(root, { package: "@example/alpha", symbol: "transform" });
    assert.equal(symbol.found, true);
    assert.equal(symbol.functions[0].name, "transform");
  });

  it("reads the workspace graph and a focused neighbourhood", async () => {
    const full = await read561GroupJSNodeWorkspaceGraph(root);
    assert.deepEqual(full.graph.edges, [{ from: "@example/alpha", to: "@example/beta" }]);
    const focused = await read561GroupJSNodeWorkspaceGraph(root, { focus: "@example/beta" });
    assert.deepEqual(focused.graph.nodes.map(({ name }) => name).sort(), ["@example/alpha", "@example/beta"]);
  });

  it("topologizes the workspace with graph invariants", async () => {
    const result = await topologize561GroupJSNode(root);
    assert.equal(result.analysis.order, 2);
    assert.equal(result.analysis.size, 1);
    assert.equal(result.analysis.acyclic, true);
  });
});
