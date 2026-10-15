import assert from 'node:assert/strict';
import {admitClauseAssayDerivation} from '../src/fabrication-receipts.mjs';
import {deriveJsnodePackageFromClosure} from '../src/derive-jsnode-package-from-closure.mjs';
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
