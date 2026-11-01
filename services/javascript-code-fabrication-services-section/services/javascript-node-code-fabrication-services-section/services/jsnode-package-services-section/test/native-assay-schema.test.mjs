import assert from "node:assert/strict";
import test from "node:test";
import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";
import { bindNativeAssayProfile, deriveJsnodeModules, assayCasesOfDelivery, assayDeliverySchema } from "../src/derive-jsnode-package-from-closure.mjs";
import { moduleWorkOrder } from "./fixtures/module-work-order.mjs";
import { controlledLocalAssayFixture } from "./fixtures/controlled-local-assay.mjs";

const scenario = { type: "object", additionalProperties: false, required: ["value"],
  properties: { value: { type: "integer", minimum: 0, maximum: 255 } } };
const observation = { const: true };
const local = schema => ({ $defs: { value: schema }, $ref: "#/$defs/value" });
const identified = schema => ({ $id: "https://fixture.invalid/native/schema", ...local(schema) });
const nested = schema => ({ $id: "https://fixture.invalid/native/root", $ref: "child#value",
  $defs: { child: { $id: "child", $anchor: "value", ...schema } } });
const source = `export function createNative({authorize,bytes,budget}) {
 if(typeof authorize!=='function'||!(bytes instanceof Uint8Array)||typeof budget!=='bigint')throw new TypeError('native values');
 return {async read(context){if(await authorize(context)!==true)throw new Error('denied');return {bytes,budget};}};
}`;

function project({ operation, cases }) {
  return [
    `import test from 'node:test';import assert from 'node:assert/strict';import {${operation.exportName}} from '../${operation.module}';`,
    ...cases.map(item => `test(${JSON.stringify(item.testName)},async()=>{
      const bytes=new Uint8Array([${item.input.value}]),context=Object.freeze({kind:'fixture'});
      const host=${operation.exportName}({bytes,budget:1n,authorize:async actual=>{assert.equal(actual,context);return true;}});
      const result=await host.read(context);assert.equal(result.bytes,bytes);assert.equal(result.budget,1n);
      assert.equal(true,${JSON.stringify(item.output)});
    });`),
  ].join("\n");
}

function fixture(scenarioSchema = scenario, observationSchema = observation) {
  const profile = { type: "JsnodeNativeAssayProfile", version: 1, id: "test.native-schema-roots.v1",
    source: { locator: "test:native-schema-roots", digest: "sha256:" + "4".repeat(64) },
    contract: "createNative takes an original authorize function, Uint8Array bytes and BigInt budget; its live read handle awaits that same grant and retains the byte object and budget.",
    scenarioSchema, observationSchema };
  const order = moduleWorkOrder();
  order.requirements[0].statement = profile.contract;
  order.projections[0].configuration = {
    operations: [{ name: "native", description: "Native schema fixture", module: "src/native.mjs", exportName: "createNative", nativeProfile: profile }],
    examples: [{ name: "declared", operation: "native", input: { value: 1 }, output: true }], dependencies: {},
  };
  const cases = [{ operation: "native", name: "derived", clauses: ["identity"], input: { value: 2 }, output: true, throws: null }];
  const closure = { ...order.projections[0].configuration, requirements: order.requirements, prohibitions: order.prohibitions };
  let projections = 0, sourceRequests = 0, executions = 0;
  const requests = [];
  const binding = bindNativeAssayProfile(profile, request => { projections++; return project(request); });
  const carriers = {
    nativeAssayBindings: [binding],
    infer: async request => {
      requests.push(request);
      const selected = JSON.parse(request.messages[1].content).selectedModule;
      if (selected !== undefined) sourceRequests++;
      return { text: JSON.stringify(selected === undefined ? { cases, question: null } : { source, question: null }),
        lot: { model: selected === undefined ? "fixture-assay-author" : "fixture-source-author" } };
    },
    isolatedAssayExecutor: async request => { executions++; return controlledLocalAssayFixture(request); },
  };
  return { order, closure, cases, carriers, requests,
    counts: () => ({ projections, sourceRequests, executions }) };
}

for (const [name, wrap] of [["local pointers", local], ["reused explicit root IDs", identified],
  ["reused nested relative IDs and anchors", nested],
  ["reused bare root IDs", schema => ({ $id: "test/native-schema-root", ...local(schema) })]]) {
  test(`native schema delivery preserves ${name} through the actual fixture`, async () => {
    const value = fixture(wrap(scenario), wrap(observation));
    const result = await deriveJsnodeModules(value.order, value.carriers);
    assert.equal(result.type, "JsnodeModuleProposal", JSON.stringify(result));
    assert.deepEqual(value.counts(), { projections: 1, sourceRequests: 1, executions: 1 });
    const original = JSON.parse(value.requests[0].messages[1].content).workOrder;
    assert.deepEqual(original.projections[0].configuration.operations[0].nativeProfile.scenarioSchema, wrap(scenario));
    assert.deepEqual(original.projections[0].configuration.operations[0].nativeProfile.observationSchema, wrap(observation));
    assert.match(result.derivation.nativeAssayProfiles[0].assayDigest, /^sha256:[a-f0-9]{64}$/u);
  });
}

test("separate operations keep distinct contracts even when their resource IDs coincide", () => {
  const value = fixture(identified(scenario), identified(observation));
  const other = { ...value.closure.operations[0], name: "other", module: "src/other.mjs",
    nativeProfile: { ...value.closure.operations[0].nativeProfile,
      scenarioSchema: identified({ type: "string" }), observationSchema: identified({ type: "integer" }) } };
  value.closure.operations.push(other);
  value.cases.push({ operation: "other", name: "distinct", clauses: ["identity"], input: "text", output: 3, throws: null });
  assert.deepEqual(assayCasesOfDelivery(JSON.stringify({ cases: value.cases, question: null }), value.closure).cases, value.cases);
  value.cases[1].input = { value: 1 };
  assert.throws(() => assayCasesOfDelivery(JSON.stringify({ cases: value.cases, question: null }), value.closure));
});

test("missing local, external and sibling resources refuse before inference, without consulting the registry", async () => {
  const ambientId = "urn:test:jsnode-native-schema:ambient-only";
  schemaFrom({ $id: ambientId, ...scenario });
  for (const badSchema of [{ $ref: "#/$defs/absent" }, { $ref: "https://fixture.invalid/absent" }, { $ref: ambientId }]) {
    const value = fixture(badSchema);
    const result = await deriveJsnodeModules(value.order, value.carriers);
    assert.equal(result.type, "JsnodeModuleDerivationRefusal");
    assert.equal(value.requests.length, 0);
    assert.deepEqual(value.counts(), { projections: 0, sourceRequests: 0, executions: 0 });
    assert.throws(() => assayDeliverySchema(value.closure), /schema/i, "the direct carrier also refuses before infer can be invoked");
  }
  const value = fixture({ $ref: "https://fixture.invalid/sibling" });
  value.closure.operations.push({ ...value.closure.operations[0], name: "sibling", module: "src/sibling.mjs",
    nativeProfile: { ...value.closure.operations[0].nativeProfile, scenarioSchema: { $id: "https://fixture.invalid/sibling", ...scenario } } });
  assert.throws(() => assayDeliverySchema(value.closure), /schema/i, "another operation cannot complete this universe");
});

test("a native transport envelope never admits an invalid scenario, observation or refusal case", async () => {
  for (const changed of [{ input: { value: "wrong" } }, { output: false },
    { input: { value: -1 }, output: null, throws: "RangeError" }, { output: false, throws: "RangeError" }]) {
    const value = fixture(local(scenario), local(observation));
    Object.assign(value.cases[0], changed);
    const delivery = { cases: value.cases, question: null };
    assert.doesNotThrow(() => schemaFrom(assayDeliverySchema(value.closure)).assert(delivery), "transport slots alone are deliberately insufficient");
    assert.throws(() => assayCasesOfDelivery(JSON.stringify(delivery), value.closure));
    const result = await deriveJsnodeModules(value.order, value.carriers);
    assert.equal(result.code, "ASSAY_DERIVATION_REFUSED", JSON.stringify(result));
    assert.equal(value.requests.length, 1);
    assert.deepEqual(value.counts(), { projections: 0, sourceRequests: 0, executions: 0 });
  }
  const value = fixture(local(scenario), local(observation));
  Object.assign(value.cases[0], { output: null, throws: "RangeError" });
  assert.deepEqual(assayCasesOfDelivery(JSON.stringify({ cases: value.cases, question: null }), value.closure).cases, value.cases);
});
