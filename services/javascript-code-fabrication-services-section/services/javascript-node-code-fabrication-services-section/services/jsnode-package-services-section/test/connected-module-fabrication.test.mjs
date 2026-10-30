import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveJsnodeModules} from '../src/derive-jsnode-package-from-closure.mjs';
import { controlledLocalAssayFixture } from './fixtures/controlled-local-assay.mjs';
import {translateMarkdownJsnodeOperationPackageSpecification} from '../src/translate-markdown-jsnode-operation-package-specification.mjs';

// A controlled capability demonstration, not an allocated enterprise demand.
const source = {type:'MarkdownDocumentSource',path:'examples/source-free-connected-module-order.md',text:readFileSync(new URL('../examples/source-free-connected-module-order.md',import.meta.url),'utf8')};
const translated=translateMarkdownJsnodeOperationPackageSpecification({type:'MarkdownJsnodeOperationPackageSpecificationTranslationRequest',version:1,source});
assert.equal(translated.type,'MarkdownJsnodeModuleSpecificationTranslation');
const order=translated.artifactSpecificationCandidate;
const cases=[
 {operation:'double-value',name:'private-double-seven',clauses:['double-result'],input:7,output:14,throws:null},
 {operation:'increment-value',name:'private-connected-seven',clauses:['increment-result'],input:7,output:15,throws:null},
 {operation:'double-value',name:'private-invalid-overflow',clauses:['invalid-input'],input:{},output:null,throws:'TypeError'},
];
const valid={
 'src/double.mjs':'export function doubleValue(n){if(typeof n!=="number"||!Number.isFinite(n))throw new TypeError();return n+n;}',
 'src/increment.mjs':'import {doubleValue} from "./double.mjs"; export function incrementValue(n){return doubleValue(n)+1;}',
};
async function exercise(sources,{lotCarriers=[],missingLotAt}={}){
 const calls=[],judgments=[];
 const result=await deriveJsnodeModules(order,{infer:async request=>{
  calls.push(request);const module=JSON.parse(request.messages[1].content).selectedModule;
  const carrier=lotCarriers[calls.length-1];
  return {text:JSON.stringify(module===undefined?{cases,question:null}:{source:sources[module],question:null}),
    ...(calls.length-1===missingLotAt?{}:{lot:{id:'controlled:'+calls.length,...(carrier?{model:carrier}:{})}})};
 },judge:async(...args)=>judgments.push(args),isolatedAssayExecutor:controlledLocalAssayFixture});
 return {result,calls,judgments};
}
// A customer cannot cause supplier code to reach the ambient host process.
// Without the host-composed isolated runner, the factory refuses *before*
// purchasing or asking for any model output.
let unauthorizedInferenceCalls=0;
const noHost=await deriveJsnodeModules(order, {
 infer: async () => { unauthorizedInferenceCalls++; throw new Error("unreachable"); },
});
assert.equal(noHost.type,"JsnodeModuleDerivationRefusal");
assert.equal(noHost.code,"ISOLATED_ASSAY_UNAVAILABLE");
assert.equal(unauthorizedInferenceCalls,0);
const good=await exercise(valid);
assert.equal(good.result.type,'JsnodeModuleProposal',JSON.stringify(good.result));
assert.equal(good.result.files.filter(f=>f.path.startsWith('src/')).length,2);
assert.equal(good.calls.length,3);
assert.ok(good.calls.slice(1).every(call=>!JSON.stringify(call.messages).includes('private-connected-seven')));
assert.deepEqual(good.result.workOrderSpecification.source,order.source);
assert.equal(good.result.derivation.derivations.filter(d=>d.module).length,2);
assert.ok(good.result.derivation.derivations.filter(d=>d.module).every(d=>d.outcome==='pre-assayed'));
const bad=await exercise({...valid,'src/increment.mjs':'import {doubleValue} from "./double.mjs"; export function incrementValue(n){return doubleValue(n);}' });
assert.equal(bad.result.type,'JsnodeModuleDerivationRefusal');
assert.equal(bad.result.cause.scope,'module-set');
assert.equal(bad.calls.length,3);assert.equal(bad.judgments.length,0);
assert.ok(bad.result.cause.derivations.filter(d=>d.module).every(d=>d.outcome==='composition-refused'));
// Kinetic proofing: the controlled lots name no carrier, so no channel is shown independent of the
// writer; the composition failure is recorded against the channel that caught it.
assert.equal(good.result.derivation.proofing.independentBehavioralChannels,0);
// Real original inference-delivery path: clause assays from one of two source
// writers may not be promoted to an independent check by concatenating their names.
const repeated=await exercise(valid,{lotCarriers:['model-a','model-a','model-b']});
assert.equal(repeated.result.type,'JsnodeModuleProposal',JSON.stringify(repeated.result));
assert.deepEqual(repeated.result.derivation.proofing.sourceWriters.map(x=>x.carrier),['model-a','model-b']);
assert.equal(repeated.result.derivation.proofing.independentBehavioralChannels,0);
const separate=await exercise(valid,{lotCarriers:['model-c','model-a','model-b']});
assert.equal(separate.result.type,'JsnodeModuleProposal',JSON.stringify(separate.result));
assert.equal(separate.result.derivation.proofing.independentBehavioralChannels,1);
assert.equal(separate.result.derivation.proofing.independentlyReceived,false,
  'source-carrier identity difference is not independent verifier authentication');
// A missing lot on either actual source delivery is unknown provenance. It
// must not disappear at the caller while the other named writer survives.
for (const missingLotAt of [1,2]) {
 const missingLot=await exercise(valid,{lotCarriers:['model-c','model-a','model-b'],missingLotAt});
 assert.equal(missingLot.result.type,'JsnodeModuleProposal',JSON.stringify(missingLot.result));
 const records=missingLot.result.derivation.derivations.filter(item=>item.module);
 assert.equal(records.length,2);
 assert.equal(records[missingLotAt-1].lot,undefined);
 const proofing=missingLot.result.derivation.proofing;
 assert.deepEqual(proofing.sourceWriters.map(item=>item.carrier),
   [missingLotAt===1?'model-b':'model-a','unnamed-carrier']);
 assert.equal(proofing.independentBehavioralChannels,0);
 assert.equal(proofing.channels.find(item=>item.method==='clause-assays').independent,false);
 assert.equal(proofing.sourceLotAuthentication,'unverified-market-lot-declarations');
 assert.equal(proofing.independentlyReceived,false);
 assert.ok(missingLot.calls.slice(1).every(call=>cases.every(item=>!JSON.stringify(call.messages).includes(item.name))));
}
assert.equal(bad.result.cause.proofing.catches.length,1);
const failedCase=bad.result.cause.proofing.catches[0];
assert.ok(['clause-assays','admitted-examples','module-set-composition'].includes(failedCase.method),
  JSON.stringify(bad.result.cause.proofing.catches));
// When a trusted Node runner exits nonzero without a named failing TAP case,
// its failure is an observed *composition* failure. It must NOT masquerade as
// a particular independent clause assay or admitted example.
if (failedCase.method==='module-set-composition')
  assert.match(failedCase.defect,/isolated assay process exited status/u);
assert.ok(bad.result.cause.proofing.catches[0].caughtBy);
// A source module can call process.exit(0) at import time; the Node test
// runner can then pass its file-wrapper without executing even one assay.
const skipped=await exercise({...valid,'src/double.mjs':'process.exit(0); export function doubleValue(n){return n+n;}'});
assert.equal(skipped.result.type,'JsnodeModuleDerivationRefusal');
assert.equal(skipped.result.cause.scope,'module-set');
assert.match(skipped.result.cause.evidence,/assay-incomplete/);
const missing=await exercise({...valid,'src/increment.mjs':'import {doubleValue} from "./undeclared.mjs"; export function incrementValue(n){return doubleValue(n)+1;}' });
assert.equal(missing.result.cause.scope,'module-set');
assert.match(missing.result.cause.evidence,/unresolvable projected import/);
assert.equal(missing.calls.length,3);
// A delivered module that only forwards to a dependency import is refused as a misfold and
// recorded against the fold check.
const wrapped=await exercise({...valid,'src/double.mjs':'import {doubleValue as dv} from "@red-cup-engineering/doubling"; export function doubleValue(n){return dv(n);}'});
assert.equal(wrapped.result.cause.code,'MISFOLD',JSON.stringify(wrapped.result));
assert.equal(wrapped.result.cause.proofing.catches[0].method,'fold-check');
console.log(JSON.stringify({controlled:true,originalOrderRetained:true,connectedModulesAssayedTogether:true,sourceBlindToPriorCases:true,compositionFailureRetainsAllLots:true,noAutomaticRepurchases:true,undeclaredImportsRefusedBeforeExecution:true,externalInferenceCalls:0}));
