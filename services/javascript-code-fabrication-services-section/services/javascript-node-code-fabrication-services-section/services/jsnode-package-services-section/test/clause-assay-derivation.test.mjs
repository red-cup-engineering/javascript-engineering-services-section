import assert from 'node:assert/strict';
import {admitClauseAssayDerivation} from '../src/fabrication-receipts.mjs';
import {assayCasesOfDelivery, deriveJsnodePackageFromClosure, testsOfClosure} from '../src/derive-jsnode-package-from-closure.mjs';
import { controlledLocalAssayFixture } from './fixtures/controlled-local-assay.mjs';
const closure={packageName:'fixture',packageVersion:'0.0.0',license:'MIT',dependencies:{},constraints:[],requirements:[{id:'successor',statement:'Return n plus one.'}],prohibitions:[{id:'negative',statement:'Refuse negative n with RangeError.'}],operations:[{name:'successor',module:'src/successor.mjs',exportName:'successor',description:'Return successor of nonnegative n.',inputSchema:{type:'object',required:['n'],properties:{n:{type:'integer'}},additionalProperties:false},outputSchema:{type:'integer',minimum:1}}],examples:[{name:'zero',operation:'successor',input:{n:0},output:1}]};
const cases=[{operation:'successor',name:'hidden-case-two',clauses:['successor'],input:{n:2},output:3,throws:null},{operation:'successor',name:'negative',clauses:['negative'],input:{n:-1},output:null,throws:'RangeError'}];
async function run(source,assays=cases){let calls=[];const result=await deriveJsnodePackageFromClosure(closure,{infer:async request=>{calls.push(request);return {text:JSON.stringify(calls.length===1?{cases:assays,question:null}:{source,question:null})};},isolatedAssayExecutor:controlledLocalAssayFixture});return {result,calls};}
const bad=await run('export function successor(){return 1;}');
assert.equal(bad.result.code,'DERIVATION_REJECTED');
assert.equal(bad.calls[0].taskClass,'code-fabrication-assays');
assert.equal(bad.calls.length,2);
assert.ok(!JSON.stringify(bad.calls[1].messages).includes('hidden-case-two'));
const good=await run('export function successor({n}){if(n<0)throw new RangeError();return n+1;}');
assert.equal(good.result.sources.length,1);
assert.ok(good.result.tests[0].text.includes('hidden-case-two'));
const missing=await run('unused',cases.slice(0,1));
assert.equal(missing.result.code,'ASSAY_DERIVATION_REFUSED');
assert.equal(missing.calls.length,1);
console.log(JSON.stringify({exampleOnlyCandidateRejected:true,validCandidatePassed:true,sourceBlindToDerivedCases:true,uncoveredProhibitionStopsBeforeSource:true,externalInferenceCalls:0,fixtureOnly:true}));

const order={projections:[{configuration:{...closure, sources:[],tests:[]}}],requirements:closure.requirements,prohibitions:closure.prohibitions,constraints:closure.constraints};
const derivation={attempts:good.result.derivations};
const binding=admitClauseAssayDerivation(order,{tests:good.result.tests},derivation);
assert.deepEqual(binding.tests,good.result.tests);
assert.throws(()=>admitClauseAssayDerivation(order,{tests:[]},derivation),{code:'CLAUSE_ASSAY_TEST_BINDING_MISMATCH'});
assert.throws(()=>admitClauseAssayDerivation(order,{tests:good.result.tests},{attempts:[...good.result.derivations].reverse()}),{code:'MISSING_PRIOR_CLAUSE_ASSAYS'});
assert.throws(()=>admitClauseAssayDerivation(order,{tests:good.result.tests},{attempts:[{...good.result.derivations[0],cases:cases.slice(0,1)}]}),{code:'INVALID_CLAUSE_ASSAYS'});
console.log(JSON.stringify({receiptReconstructsTests:true,droppedTestsRefused:true,assaysAfterSourceRefused:true,uncoveredClauseReceiptRefused:true,fixtureOnly:true}));


// Regression for Code Engineering's original P0 #74: an array-only
// operation must be able to test an invalid non-array value. The original
// input schema, not the carrier schema or a model's claim, decides whether
// the negative case really is outside the domain. This fixture is NOT a
// production isolated-host or downstream consumer acceptance receipt.
const arrayClosure = {
  packageName: 'array-clause-assay-fixture', packageVersion: '0.0.0', license: 'MIT',
  dependencies: {}, constraints: [],
  requirements: [{id:'sum-value', statement:'Sum the integer array.'}],
  prohibitions: [{id:'non-array', statement:'Reject non-array input with TypeError.'}],
  operations: [{
    name:'sum-list', module:'src/sum-list.mjs', exportName:'sumList',
    description:'Sum an array of integers without accepting scalar input.',
    inputSchema: {type:'array', items:{type:'integer'}},
    outputSchema: {type:'integer'},
  }],
  examples: [{name:'small-array', operation:'sum-list', input:[2,3], output:5}],
};
const arrayCases = [
  {operation:'sum-list', name:'independent-array', clauses:['sum-value'],
    input:[8,13], output:21, throws:null},
  {operation:'sum-list', name:'reject-scalar', clauses:['non-array'],
    input:'not an array', inputDomain:'outside-schema', output:null, throws:'TypeError'},
];
const deliverArray = cases => JSON.stringify({cases,question:null});
const acceptedArray = assayCasesOfDelivery(deliverArray(arrayCases), arrayClosure);
assert.deepEqual(acceptedArray.cases, arrayCases);
const derivedArrayTests = testsOfClosure(arrayClosure, acceptedArray.cases);
assert.equal(derivedArrayTests.length, 1);
assert.match(derivedArrayTests[0].text, /reject-scalar/u);
assert.match(derivedArrayTests[0].text, /assert\.rejects/u);
for (const attempt of [
  arrayCases.map(({inputDomain, ...rest}) => rest),
  arrayCases.map(item => item.name === 'reject-scalar'
    ? {...item, inputDomain:'admitted'} : item),
  arrayCases.map(item => item.name === 'reject-scalar'
    ? {...item, inputDomain:'outside-schema', input:[1,2]} : item),
  arrayCases.map(item => item.name === 'reject-scalar'
    ? {...item, inputDomain:'outside-schema', throws:null, output:0} : item),
  arrayCases.map(item => item.name === 'reject-scalar'
    ? {...item, inputDomain:'unsupported'} : item),
]) {
  assert.throws(() => assayCasesOfDelivery(deliverArray(attempt), arrayClosure),
    'an invalid schema-negative assay must refuse before source generation');
}

async function deriveArray(source, cases=arrayCases) {
  let inferenceCalls=0;
  const result=await deriveJsnodePackageFromClosure(arrayClosure,{
    infer: async () => ({
      text: JSON.stringify(++inferenceCalls===1 ? {cases,question:null}
        : {source,question:null}),
    }),
    isolatedAssayExecutor:controlledLocalAssayFixture,
  });
  return {result,inferenceCalls};
}
const validArray = await deriveArray(
  'export function sumList(values){if(!Array.isArray(values))throw new TypeError("array required");return values.reduce((sum,n)=>sum+n,0);}'
);
assert.ok(Array.isArray(validArray.result.sources), JSON.stringify(validArray.result));
assert.equal(validArray.inferenceCalls,2);
assert.match(validArray.result.tests[0].text,/reject-scalar/u);
const falselyAcceptedArray = await deriveArray(
  'export function sumList(values){if(!Array.isArray(values))return 0;return values.reduce((sum,n)=>sum+n,0);}'
);
assert.equal(falselyAcceptedArray.result.type,'JsnodeClosureDerivationRefusal');
assert.equal(falselyAcceptedArray.result.code,'DERIVATION_REJECTED');
assert.equal(falselyAcceptedArray.inferenceCalls,2);
const misdeclaredArray = await deriveArray('unreachable',arrayCases.map(item =>
  item.name === 'reject-scalar' ? {...item,input:[1,2]} : item));
assert.equal(misdeclaredArray.result.code,'ASSAY_DERIVATION_REFUSED');
assert.equal(misdeclaredArray.inferenceCalls,1,
  'schema-negative case must be rejected before buying source inference');
console.log(JSON.stringify({
  schemaNegativeAssayReceived:true, validArrayCandidatePreAssayed:true,
  invalidArrayBehaviorRejected:true, mislabeledInputRefusedBeforeSource:true,
  externalInferenceCalls:0, controlledFixtureOnly:true,
}));


// The same incumbent clause receiver, test projector and original receipt
// re-reader must retain the explicit behavioral demand. No second test
// registry, inferred purity claim or generated source supplier is involved.
const invariantCases = arrayCases.map(item => item.name === 'independent-array'
  ? {...item, checks:{inputUnchanged:true,stableReplay:true}} : item);
const invalidInvariants = [
  invariantCases.map(item => item.name === 'independent-array'
    ? {...item,checks:{inputUnchanged:false}} : item),
  invariantCases.map(item => item.name === 'independent-array'
    ? {...item,checks:{notAContract:true}} : item),
  invariantCases.map(item => item.name === 'reject-scalar'
    ? {...item,checks:{stableReplay:true}} : item),
];
for(const malformed of invalidInvariants)
  assert.throws(()=>assayCasesOfDelivery(deliverArray(malformed),arrayClosure),
    'unadmitted behavioral obligations must never enter source-derived tests');
const checkedArray=await deriveArray(
  'export function sumList(values){if(!Array.isArray(values))throw new TypeError("array required");return values.reduce((sum,n)=>sum+n,0);}',
  invariantCases,
);
assert.ok(Array.isArray(checkedArray.result.tests),JSON.stringify(checkedArray.result));
assert.equal(checkedArray.inferenceCalls,2);
assert.match(checkedArray.result.tests[0].text,/assert\.deepStrictEqual\(assayInput, originalInput\)/u);
assert.match(checkedArray.result.tests[0].text,/assert\.deepStrictEqual\(replayOutput, firstOutput\)/u);
const mutatingArray=await deriveArray(
  'export function sumList(values){if(!Array.isArray(values))throw new TypeError("array required");values.push(0);return values.reduce((sum,n)=>sum+n,0);}',
  invariantCases,
);
assert.equal(mutatingArray.result.type,'JsnodeClosureDerivationRefusal');
assert.equal(mutatingArray.result.code,'DERIVATION_REJECTED',
  'matching outputs cannot conceal input mutations explicitly prohibited by the original clause');
const invariantOrder={
  projections:[{configuration:{...arrayClosure,sources:[],tests:[]}}],
  requirements:arrayClosure.requirements,prohibitions:arrayClosure.prohibitions,
  constraints:arrayClosure.constraints,
};
const retainedInvariant=admitClauseAssayDerivation(invariantOrder,
  {tests:checkedArray.result.tests},{attempts:checkedArray.result.derivations});
assert.deepEqual(retainedInvariant.cases,invariantCases);
assert.deepEqual(retainedInvariant.tests,checkedArray.result.tests);
const weakenedTests=checkedArray.result.tests.map(file=>({...file,
  text:file.text.replace('  assert.deepStrictEqual(assayInput, originalInput);','')}));
assert.throws(()=>admitClauseAssayDerivation(invariantOrder,
  {tests:weakenedTests},{attempts:checkedArray.result.derivations}),
  {code:'CLAUSE_ASSAY_TEST_BINDING_MISMATCH'},
  'original receipt replay refuses tests that silently drop independent behavioral obligations');
console.log(JSON.stringify({nonmutationFromOriginalClauses:true,
  mutatingCodeRefused:true,stableReplayGenerated:true,
  originalReceiptRetainsChecks:true,proofWeakeningRefused:true,controlledFixtureOnly:true}));


// Before any source attempt, independently derived clause tests must share
// the same exact TAP namespace as original example tests. The two syntactic
// lists can be individually unique but *collide after Node test-name formation*.
const overlapping = structuredClone(closure);
overlapping.examples[0].name = "clause assay negative";
let collisionCalls=0;
const collision = await deriveJsnodePackageFromClosure(overlapping, {
  infer: async () => ({
    text: JSON.stringify(++collisionCalls===1
      ? {cases,question:null}
      : {source:"unreachable",question:null}),
  }),
  isolatedAssayExecutor:controlledLocalAssayFixture,
});
assert.equal(collision.type,"JsnodeClosureDerivationRefusal");
assert.equal(collision.code,"ASSAY_DERIVATION_REFUSED");
assert.equal(collisionCalls,1,
  "a derived name collision must not buy implementation inference");
assert.throws(() => assayCasesOfDelivery(JSON.stringify({cases,question:null}), overlapping),
  /runner names must be distinct/u);

const unsafeExample=structuredClone(closure);
unsafeExample.examples[0].name="line\nbreak";
let unsafeCalls=0;
const unsafeResult=await deriveJsnodePackageFromClosure(unsafeExample,{
  infer:async()=>{unsafeCalls++;throw new Error("must not purchase an assay");},
  isolatedAssayExecutor:controlledLocalAssayFixture,
});
assert.equal(unsafeResult.type,"JsnodeClosureDerivationRefusal");
assert.equal(unsafeResult.code,"INVALID_ADMITTED_ASSAYS");
assert.equal(unsafeCalls,0,
  "the source-owned example cannot consume an inference lot before TAP-name receiving");

const overlappingOrder={
  projections:[{configuration:overlapping}],
  requirements:overlapping.requirements,
  prohibitions:overlapping.prohibitions,
  constraints:overlapping.constraints,
};
assert.throws(()=>admitClauseAssayDerivation(overlappingOrder,
  {tests:good.result.tests},{attempts:good.result.derivations}),
  {code:"INVALID_CLAUSE_ASSAYS"},
  "the existing original receipt reader must not re-admit a combined runner-name collision");
const ordinary=await run('export function successor({n}){if(n<0)throw new RangeError();return n+1;}');
assert.ok(ordinary.result.sources.length===1);
assert.equal(ordinary.calls.length,2);
console.log(JSON.stringify({
  originalExampleNameAdmittedBeforeInference:true,
  sourceAssayCollisionsRefusedBeforeCode:true,
  unsafeNameZeroInferenceRequests:true,
  originalReceiptReplayRefusesNameCollision:true,
  normalCodeWorkPreserved:true,controlledFixtureOnly:true,
}));

// Original P0 #74: Node's TAP reporter escapes # and \, so a literal
// completion receipt could never accept these source-owned names. Reject
// authored examples before any inference, hidden cases before source inference.
for (const unsafeName of ["hash#marker", "back\\slash"]) {
  const badExample=structuredClone(closure);
  badExample.examples[0].name=unsafeName;
  let originalCalls=0;
  const originalRefusal=await deriveJsnodePackageFromClosure(badExample,{
    infer:async()=>{originalCalls++;throw new Error("cannot spend");},
    isolatedAssayExecutor:controlledLocalAssayFixture,
  });
  assert.equal(originalRefusal.code,"INVALID_ADMITTED_ASSAYS");
  assert.equal(originalCalls,0,"unreceivable original name must not buy inference");

  const badCase=cases.map(item=>item.name==="negative"
    ? {...item,name:unsafeName} : item);
  let derivedCalls=0;
  const derivedRefusal=await deriveJsnodePackageFromClosure(closure,{
    infer:async()=>({text:JSON.stringify(++derivedCalls===1
      ? {cases:badCase,question:null}
      : {source:"unreachable",question:null})}),
    isolatedAssayExecutor:controlledLocalAssayFixture,
  });
  assert.equal(derivedRefusal.code,"ASSAY_DERIVATION_REFUSED");
  assert.equal(derivedCalls,1,"unreceivable hidden assay must not buy source");
}
console.log(JSON.stringify({tapEscapedNamesRefusedBeforeCode:true,
  noInferenceOnUnreportableOriginalAssays:true,fixtureOnly:true}));
