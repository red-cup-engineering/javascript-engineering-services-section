import assert from "node:assert/strict";
import test from "node:test";
import { planJsnodeModules, testsOfClosure } from "@red-cup-engineering/jsnode-package-services-section/plan-jsnode-modules";
import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";
import { javascriptProgram, executeJavascriptProgram } from "@red-cup-engineering/javascript-node-services-section/module-closure";

import { moduleWorkOrder as order } from "./fixtures/module-work-order.mjs";

test("pure planner and captured installed programme produce the same admitted plan", async () => {
  const input = order();
  const plan = planJsnodeModules(input);
  assert.equal(plan.type, "JsnodeModuleFabricationPlan");
  assert.deepEqual(plan.paths, ["data/records/schema/identity.input.schema.json", "data/records/schema/identity.output.schema.json", "src/identity.mjs", "test/identity-examples.test.mjs"]);
  const programme = javascriptProgram(new URL("../src/plan-jsnode-modules.mjs", import.meta.url), "planJsnodeModules");
  assert.deepEqual(await executeJavascriptProgram(programme, input), plan);
  assert.equal(testsOfClosure(input.projections[0].configuration).length, 1);
});

test("boolean schemas are admitted and false refuses examples", () => {
  assert.equal(planJsnodeModules(order(true, null, true, null)).type, "JsnodeModuleFabricationPlan");
  assert.equal(planJsnodeModules(order(false)).type, "JsnodeModuleDerivationRefusal");
});

test("schema ids and foreign declarations cannot change a later plan", () => {
  const id = "urn:test:planner:reused";
  assert.equal(planJsnodeModules(order({ $id: id, type: "integer" })).type, "JsnodeModuleFabricationPlan");
  assert.equal(planJsnodeModules(order({ $id: id, type: "string" }, "two")).type, "JsnodeModuleFabricationPlan");
  const foreign = "urn:test:planner:foreign";
  const input = order({ $ref: foreign });
  const before = planJsnodeModules(input);
  assert.equal(before.type, "JsnodeModuleDerivationRefusal");
  schemaFrom({ $id: foreign, type: "integer" });
  assert.deepEqual(planJsnodeModules(input), before);
});

test("projected paths use ordinal order independent of locale collation", () => {
  const input = order();
  const closure = input.projections[0].configuration;
  closure.operations[0].module = "src/a.mjs";
  closure.operations.push({ ...closure.operations[0], name: "upper", module: "src/Z.mjs", exportName: "upper" });
  closure.examples.push({ ...closure.examples[0], operation: "upper" });
  const result = planJsnodeModules(input);
  assert.equal(result.type, "JsnodeModuleFabricationPlan");
  assert.deepEqual(result.paths, [...result.paths].sort());
  assert.ok(result.paths.indexOf("src/Z.mjs") < result.paths.indexOf("src/a.mjs"));
});
