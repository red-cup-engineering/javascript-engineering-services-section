import assert from "node:assert/strict";
import test from "node:test";
import { semanticId } from "@red-cup-engineering/relation-model-notation-runtime";
import { circuitAssemblyId, verifyCircuitAssembly } from "@red-cup-engineering/relation-model-notation-runtime/hierarchical-circuit";
import {
  assayExecutionGeometryCircuit,
  measureExecutionEconomy,
  projectExecutionGeometryCircuit,
} from "../src/execution-manifold-circuit.mjs";
import { deriveExecutionGeometry } from "../src/program-runtime.mjs";

function geometry() {
  return deriveExecutionGeometry({ missions: [
    { id: "source", dependsOn: [], focusPaths: ["src/runtime.mjs"] },
    { id: "guide", dependsOn: [], focusPaths: ["content/guide.md"] },
    { id: "integration", dependsOn: ["source", "guide"], focusPaths: ["test/integration.test.mjs"] },
  ] });
}

test("execution sheets project to a verified circuit family and total sovereign assembly", () => {
  const result = projectExecutionGeometryCircuit(geometry(), { programId: "urn:test:program:1", territory: "/test/territory" });
  const verified = verifyCircuitAssembly(result.assembly, result.circuit, result.components);
  assert.equal(verified.family.rootIdentity, result.projection.circuit);
  assert.equal(verified.assemblyIdentity, result.projection.assembly);
  assert.deepEqual(Object.keys(result.projection.missionAddresses).sort(), ["guide", "integration", "source"]);
  assert.equal(result.circuit.instances.filter(({ name }) => name.startsWith("mission-")).length, 3);
  assert.equal(result.circuit.instances.filter(({ name }) => name.startsWith("join-")).length, 1);
  assert.equal(result.projection.geometry.startsWith("ni:///sha-256;"), true);
});

test("projection independently refuses a sheet that contradicts the patch overlap cover", () => {
  const source = deriveExecutionGeometry({ missions: [
    { id: "tree", dependsOn: [], focusPaths: ["src"] },
    { id: "file", dependsOn: [], focusPaths: ["src/runtime.mjs"] },
  ] });
  source.sheets = [{ index: 0, missionIds: ["tree", "file"] }];
  source.measures = {
    serialMissionSlots: 2,
    executionSheetCount: 1,
    maximumConcurrentMissions: 2,
    parallelOpportunitySlots: 1,
    parallelCompression: { numerator: 2, denominator: 1 },
  };
  assert.throws(() => projectExecutionGeometryCircuit(source, { programId: "urn:test:program:bad", territory: "/test/territory" }), /overlapping missions inhabit one execution sheet/u);
});

test("independent OSS assay must bind the exact projected circuit and assembly", async () => {
  let request;
  const result = await assayExecutionGeometryCircuit(geometry(), {
    programId: "urn:test:program:assayed",
    territory: "/test/territory",
    agentUrl: "https://assay.invalid/.well-known/agent-card.json",
    requestAssay: async (value) => {
      request = value;
      return {
        receipt: {
          provider: "eip155:31337:0xeab9a6b8a96342b12d0bf97adfe2cc8a329e3931",
          circuit: value.assembly.circuit,
          assembly: circuitAssemblyId(value.assembly),
          equivalent: true,
        },
        receiptNi: semanticId(["mark", "typed equivalence receipt"]),
      };
    },
  });
  assert.equal(request.agentUrl, "https://assay.invalid/.well-known/agent-card.json");
  assert.equal(result.assay.equivalent, true);
  assert.equal(result.assay.provider, "eip155:31337:0xeab9a6b8a96342b12d0bf97adfe2cc8a329e3931");
});

test("settled supplier lots become an exact multi-provider economic measure", () => {
  const measured = measureExecutionEconomy([{ result: {
    phases: [{ result: {
      metrics: {
        directInteractiveModelCalls: 0,
        expectedConsideration: [
          { provider: "urn:provider:cheap", amount: 2, unit: "milliquanta" },
          { provider: "urn:provider:fast", amount: 5, unit: "milliquanta" },
        ],
      },
    } }],
  } }]);
  assert.deepEqual(measured.consideration, [{ amount: 7, unit: "milliquanta" }]);
  assert.equal(measured.purchasedInferenceLots, 2);
  assert.deepEqual(measured.providers, ["urn:provider:cheap", "urn:provider:fast"]);
  assert.equal(measured.directInteractiveModelCalls, 0);
});
