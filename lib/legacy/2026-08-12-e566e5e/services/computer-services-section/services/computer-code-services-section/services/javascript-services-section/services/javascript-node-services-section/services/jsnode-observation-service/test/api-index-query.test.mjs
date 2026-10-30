import assert from "node:assert/strict";
import test from "node:test";
import { projectApiIndexQuery, queryTerms } from "../src/api-index-query.mts";

const state = Object.freeze({
  kind: "operations-manifold.jsnode.api-index",
  generatedAt: "2026-07-29T00:00:00.000Z",
  source: "package-source-doc-symbols",
  packages: Object.freeze([{ name: "@scope/widget", path: "services/widget", aliases: Object.freeze(["@scope/widget", "widget"]), symbols: 2 }]),
  symbols: Object.freeze([
    { package: "@scope/widget", packagePath: "services/widget", module: ".", import: "@scope/widget", file: "src/widget.mts", name: "listWidgets", kind: "function", signature: "listWidgets(): Widget[]", documented: true },
    { package: "@scope/widget", packagePath: "services/widget", module: ".", import: "@scope/widget", file: "src/widget.mts", name: "Widget", kind: "interface", signature: "interface Widget", documented: true },
  ]),
});

test("normalizes JSNode identifier query terms", () => {
  assert.deepEqual(queryTerms("listWidgets"), ["list", "widget"]);
  assert.deepEqual(queryTerms("policies"), ["policy"]);
});

test("projects a bounded API view from caller-provided index state", () => {
  const result = projectApiIndexQuery(state, { indexPath: "data/state/index.json", requestedPackage: "widget", match: "lists", limit: 8 });
  assert.deepEqual(result.functions.map((item) => item.name), ["listWidgets"]);
  assert.deepEqual(result.types, []);
  assert.equal(result.filters.package, "@scope/widget");
  assert.equal(result.totals.matchedSymbols, 1);
});
