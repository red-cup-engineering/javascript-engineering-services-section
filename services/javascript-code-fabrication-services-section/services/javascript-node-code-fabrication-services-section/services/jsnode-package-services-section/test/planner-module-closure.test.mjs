import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { captureModuleClosure } from "@red-cup-engineering/javascript-node-services-section/module-closure";

test("planner closure retains its schema bytes and its schema import binding", () => {
  const closure = captureModuleClosure(new URL("../src/plan-jsnode-modules.mjs", import.meta.url));
  const schemaSuffix = "/data/records/schema/jsnode-module-specification.schema.json";
  const schemaEntry = Object.entries(closure.body.modules).find(([key]) => key.endsWith(schemaSuffix));
  assert.ok(schemaEntry, "the planner schema must be source-addressed");
  const [schemaKey, schema] = schemaEntry;
  assert.equal(schema.format, "json");
  assert.equal(Buffer.from(schema.source, "base64").toString("utf8"),
    readFileSync(new URL("../data/records/schema/jsnode-module-specification.schema.json", import.meta.url), "utf8"));
  for (const name of ["plan-jsnode-modules"]) {
    const entry = Object.entries(closure.body.modules).find(([key]) => key.endsWith("/src/" + name + ".mjs"));
    assert.ok(entry, name + " must be in the closure");
    assert.equal(entry[1].imports["../data/records/schema/jsnode-module-specification.schema.json"], schemaKey);
  }
});

