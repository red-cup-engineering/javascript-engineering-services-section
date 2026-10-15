import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {deriveJsnodeModules} from '../src/derive-jsnode-package-from-closure.mjs';
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
async function exercise(sources){
 const calls=[],judgments=[];
 const result=await deriveJsnodeModules(order,{infer:async request=>{
  calls.push(request);const module=JSON.parse(request.messages[1].content).selectedModule;
  return {text:JSON.stringify(module===undefined?{cases,question:null}:{source:sources[module],question:null}),lot:{id:'controlled:'+calls.length}};
 },judge:async(...args)=>judgments.push(args)});
 return {result,calls,judgments};
}
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
assert.equal(bad.result.cause.proofing.catches.length,1);
assert.ok(['clause-assays','admitted-examples'].includes(bad.result.cause.proofing.catches[0].method),JSON.stringify(bad.result.cause.proofing.catches));
assert.ok(bad.result.cause.proofing.catches[0].caughtBy);
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
