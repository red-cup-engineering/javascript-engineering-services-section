import test from "node:test";
import assert from "node:assert/strict";
import { admitOperationMeaningClosure } from "@red-cup-engineering/computer-data-engineering-services-section/artifact-fabrication";
import { deriveJsnodePackageFromClosure, jsnodeClosureOfOperationClosure } from "../src/derive-jsnode-package-from-closure.mjs";
import { controlledLocalAssayFixture } from "./fixtures/controlled-local-assay.mjs";

// Fabrication line stage 2: one language-neutral order, bound to Node by convention, fabricated by the
// jsnode line with its examples unchanged.

const order = admitOperationMeaningClosure({
  type: "OperationMeaningClosureCandidate", version: 1,
  operations: [{ name: "double-value", description: "Double a finite number.", inputSchema: { type: "number" }, outputSchema: { type: "number" } }],
  examples: [{ name: "double-seven", operation: "double-value", input: 7, output: 14 }],
  dependencies: [],
});

test("a neutral operation order binds to the jsnode module closure", () => {
  const closure = jsnodeClosureOfOperationClosure(order, { packageName: "@scope/doubling" });
  assert.deepEqual(closure.operations[0].module, "src/double-value.mjs");
  assert.deepEqual(closure.operations[0].exportName, "doubleValue");
  assert.deepEqual(closure.examples, order.examples);
  assert.equal(closure.closureDigest, order.closureDigest);
});

test("the bound order is fabricated: examples assay the derived source", async () => {
  const requirements = [{ id: "double-result", statement: "The operation returns twice its input." }];
  const closure = jsnodeClosureOfOperationClosure(order, { packageName: "@scope/doubling", requirements });
  const infer = async (request) => (request.taskClass === "code-fabrication-assays"
    ? { text: JSON.stringify({ cases: [{ operation: "double-value", name: "double-two", clauses: ["double-result"], input: 2, output: 4, throws: null }], question: null }), lot: { id: "a", model: "assayer" } }
    : { text: JSON.stringify({ source: "export function doubleValue(n) { return n + n; }", question: null }), lot: { id: "w", model: "writer" } });
  const derived = await deriveJsnodePackageFromClosure(closure, { infer, isolatedAssayExecutor: controlledLocalAssayFixture });
  assert.equal(derived.type, undefined, JSON.stringify(derived).slice(0, 500));
  assert.equal(derived.sources[0].path, "src/double-value.mjs");
  assert.equal(derived.proofing.independentBehavioralChannels, 1, "a different named assayer on the order is one independent channel");
});

test("a dependency the Node binding cannot resolve is refused, not dropped", () => {
  const foreign = admitOperationMeaningClosure({
    type: "OperationMeaningClosureCandidate", version: 1,
    operations: [{ name: "double-value", description: "Double.", inputSchema: true, outputSchema: true }],
    examples: [{ name: "one", operation: "double-value", input: 1, output: 2 }],
    dependencies: [{ ecosystem: "pypi", name: "numpy", version: "2.1.0" }],
  });
  assert.equal(jsnodeClosureOfOperationClosure(foreign).code, "FOREIGN_DEPENDENCY");
});
