/**
 * Independently packed Code consumer for the exact gitlinked JSNode Package
 * producer. Executed from a clean npm-install destination by the existing
 * native source-to-Code workflow, not via the checkout's older devDependency.
 *
 * These are bounded, trusted test fixtures. Supplier-authored generated code
 * must still run only through the separate, host-owned isolated executor.
 * A passed test cannot self-issue Work, Stage Proof or buyer acceptance.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assayCasesOfDelivery, testsOfClosure, deriveJsnodePackageFromClosure,
} from "@red-cup-engineering/jsnode-package-services-section/derive-jsnode-package-from-closure";
import {projectJsnodeModules} from "@red-cup-engineering/jsnode-package-services-section/project-jsnode-modules";
import {moduleOfDelivery} from "@red-cup-engineering/jsnode-package-services-section/derive-jsnode-package-from-closure";
import {
  admitClauseAssayDerivation,
} from "@red-cup-engineering/jsnode-package-services-section/fabrication-receipts";

const closure = {
  packageName: "code-owner-receiving-fixture",
  dependencies: {},
  requirements: [{id:"sorted",statement:"Produce ascending sorted integers without mutating input and retain equal results on replay."}],
  prohibitions: [{id:"not-array",statement:"Reject all non-array inputs with TypeError."}],
  constraints: [],
  operations: [{
    name:"sort-values",module:"src/sort-values.mjs",exportName:"sortValues",
    description:"Sort integers, preserving the supplied array.",
    inputSchema:{type:"array",items:{type:"integer"}},
    outputSchema:{type:"array",items:{type:"integer"}},
  }],
  examples:[{operation:"sort-values",name:"basic-order",input:[2,1],output:[1,2]}],
};
const originalCases = [
  {operation:"sort-values",name:"source-bound-behavior",
    clauses:["sorted"], input:[3,1,2],output:[1,2,3],throws:null,
    checks:{inputUnchanged:true,stableReplay:true}},
  {operation:"sort-values",name:"reject-nonarray",
    clauses:["not-array"],input:{not:"an array"},inputDomain:"outside-schema",
    output:null,throws:"TypeError"},
];
const deliver = cases => JSON.stringify({cases,question:null});
const admitted = () => assayCasesOfDelivery(deliver(originalCases),closure);
const sources = {
  "correct": "export function sortValues(values) { if (!Array.isArray(values)) throw new TypeError(\"array required\"); return [...values].sort((a,b)=>a-b); }",
  "mutating": "export function sortValues(values) { if (!Array.isArray(values)) throw new TypeError(\"array required\"); return values.sort((a,b)=>a-b); }",
  "unstable": "const calls = new Map(); export function sortValues(values) { if (!Array.isArray(values)) throw new TypeError(\"array required\"); const identity=JSON.stringify(values); const next=(calls.get(identity)??0)+1; calls.set(identity,next); const sorted=[...values].sort((a,b)=>a-b); return next%2 ? sorted : sorted.reverse(); }"
};
async function runAssays(code,tests) {
  const directory = await mkdtemp(path.join(tmpdir(),"jsnode-code-owner-receiving-"));
  try {
    await mkdir(path.join(directory,"src"));
    await mkdir(path.join(directory,"test"));
    await writeFile(path.join(directory,closure.operations[0].module),code,"utf8");
    await writeFile(path.join(directory,tests[0].path),tests[0].text,"utf8");
    // Node's own nested test worker marker makes child --test omit tests
    // while exiting zero. The original producer learned this counterexample.
    const environment={...process.env};
    delete environment.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath,[
      "--test","--test-reporter=tap",path.join(directory,tests[0].path),
    ],{cwd:directory,env:environment,encoding:"utf8",timeout:15000,maxBuffer:256*1024});
  } finally {await rm(directory,{recursive:true,force:true});}
}

test("packed public producer retains original negative inputs and explicit behavioral checks",()=>{
  const received=admitted();
  assert.deepEqual(received.cases,originalCases);
  const tests=testsOfClosure(closure,received.cases);
  assert.equal(tests.length,1);
  assert.match(tests[0].text,/assert\.deepStrictEqual\(assayInput, originalInput\)/u);
  assert.match(tests[0].text,/assert\.deepStrictEqual\(replayOutput, firstOutput\)/u);
  assert.match(tests[0].text,/reject-nonarray/u);
  assert.match(tests[0].text,/assert\.rejects/u);
  for (const broken of [
    originalCases.map(x=>x.name==="reject-nonarray"?{...x,input:[2,1]}:x),
    originalCases.map(x=>x.name==="reject-nonarray"?{...x,inputDomain:"admitted"}:x),
    originalCases.map(x=>x.name==="source-bound-behavior"?{...x,checks:{inputUnchanged:false}}:x),
    originalCases.map(x=>x.name==="source-bound-behavior"?{...x,throws:"Error",output:null}:x),
  ]) assert.throws(()=>assayCasesOfDelivery(deliver(broken),closure),
    "unqualified assertion should refuse at the producer boundary");
});

test("actual Node consumer distinguishes correct code from mutating and stateful implementations",async()=>{
  const testSources=testsOfClosure(closure,admitted().cases);
  const legacyCases=originalCases.map(({checks,...item})=>item);
  const legacyTests=testsOfClosure(closure,legacyCases);
  for (const [kind,code] of Object.entries(sources)) {
    const checked=await runAssays(code,testSources);
    assert.equal(checked.status===0,kind==="correct",
      kind+": checked invocation "+checked.status+", stderr "+checked.stderr+", stdout "+checked.stdout);
    assert.match(checked.stdout,kind==="correct"?/# pass 3\b/u:/# fail [1-9]\d*\b/u);
    if(kind!=="correct") {
      const unchecked=await runAssays(code,legacyTests);
      assert.equal(unchecked.status,0,
        kind+": output-only baseline must miss the defect: "+unchecked.stderr+"\n"+unchecked.stdout);
      assert.match(unchecked.stdout,/# pass 3\b/u);
    }
  }
});

test("original fabrication receipt reader refuses dropping or forging test obligations",()=>{
  const admittedCases=admitted().cases;
  const tests=testsOfClosure(closure,admittedCases);
  const order={
    projections:[{configuration:closure}],
    requirements:closure.requirements,
    prohibitions:closure.prohibitions,
    constraints:closure.constraints,
  };
  const derivation={attempts:[{phase:"clause-assays",outcome:"derived",cases:admittedCases}]};
  const received=admitClauseAssayDerivation(order,{tests},derivation);
  assert.deepEqual(received.cases,admittedCases);
  assert.deepEqual(received.tests,tests);
  const weakened=tests.map(x=>({...x,text:x.text.replace(
    "  assert.deepStrictEqual(assayInput, originalInput);","")}));
  assert.throws(()=>admitClauseAssayDerivation(order,{tests:weakened},derivation),
    {code:"CLAUSE_ASSAY_TEST_BINDING_MISMATCH"});
  const forged={attempts:[{...derivation.attempts[0],cases:admittedCases.map(
    x=>x.name==="source-bound-behavior"?{...x,checks:{stableReplay:true}}:x)}]};
  assert.throws(()=>admitClauseAssayDerivation(order,{tests},forged),
    {code:"CLAUSE_ASSAY_TEST_BINDING_MISMATCH"});
});


test("installed Code receiver refuses an original example/clause name collision before purchasing source",async()=>{
  const collision=structuredClone(closure);
  collision.examples[0].name="clause assay reject-nonarray";
  assert.throws(()=>assayCasesOfDelivery(deliver(originalCases),collision),
    /runner names must be distinct/u);
  const originalTests=testsOfClosure(closure,admitted().cases);
  const order={projections:[{configuration:collision}],
    requirements:collision.requirements,prohibitions:collision.prohibitions,
    constraints:collision.constraints};
  const derivation={attempts:[{phase:"clause-assays",outcome:"derived",cases:originalCases}]};
  assert.throws(()=>admitClauseAssayDerivation(order,{tests:originalTests},derivation),
    {code:"INVALID_CLAUSE_ASSAYS"},
    "a once-valid test receipt cannot be replayed with a new colliding source name");

  const malformed=structuredClone(closure);
  malformed.examples[0].name="unreceivable\noriginal";
  let inferenceCalls=0;
  const result=await deriveJsnodePackageFromClosure(malformed,{
    infer:async()=>{inferenceCalls++;throw new Error("original Work must refuse before inference");},
    isolatedAssayExecutor:async()=>{throw new Error("no code should execute");},
  });
  assert.equal(result.type,"JsnodeClosureDerivationRefusal");
  assert.equal(result.code,"INVALID_ADMITTED_ASSAYS");
  assert.equal(inferenceCalls,0);
});

test("packed Code receiver refuses escaped TAP labels before any implementation-source inference",async()=>{
  for(const unreportable of ["hash#part","path\\fragment"]){
    const invalidOriginal=structuredClone(closure);
    invalidOriginal.examples[0].name=unreportable;
    let sourceCalls=0, isolatedCalls=0;
    const original=await deriveJsnodePackageFromClosure(invalidOriginal,{
      infer:async()=>{sourceCalls++;throw new Error("must not buy");},
      isolatedAssayExecutor:async()=>{isolatedCalls++;throw new Error("must not execute");},
    });
    assert.equal(original.code,"INVALID_ADMITTED_ASSAYS");
    assert.equal(sourceCalls,0);
    assert.equal(isolatedCalls,0);

    const invalidHidden=originalCases.map(item=>item.name==="reject-nonarray"
      ? {...item,name:unreportable} : item);
    let calls=0;
    const hidden=await deriveJsnodePackageFromClosure(closure,{
      infer:async()=>({text:JSON.stringify(++calls===1
        ? {cases:invalidHidden,question:null}
        : {source:"unreachable",question:null})}),
      isolatedAssayExecutor:async()=>{isolatedCalls++;throw new Error("must not execute");},
    });
    assert.equal(hidden.code,"ASSAY_DERIVATION_REFUSED");
    assert.equal(calls,1,"only the separate clause-assay source lot may be requested");
    assert.equal(isolatedCalls,0);

    assert.throws(()=>assayCasesOfDelivery(deliver(invalidHidden),closure),TypeError);
  }
});


test("installed JSNode source-delivery, catalog and Code consumer agree on exact ECMAScript export names",async()=>{
  for(const exportName of ["class","default","await","account$"]) {
    const operation={
      name:"exact-source",module:"src/exact-source.mjs",exportName,
      description:"Double a bounded integer",
      inputSchema:{type:"integer"},outputSchema:{type:"integer"},
    };
    const code="function implementation(value){return value*2;}\n"+
      "export { implementation as "+JSON.stringify(exportName)+" };";
    const delivery=moduleOfDelivery(JSON.stringify({source:code,question:null}),operation);
    assert.equal(delivery.source,code,
      "the installed source decoder must accept the declared ESM name: "+exportName);
    const files=projectJsnodeModules({
      sources:[{path:operation.module,text:code}],operations:[operation],
      cli:{path:"apps/catalog.mjs",name:"exact-source",description:"Executable original catalog"},
    });
    const directory=await mkdtemp(path.join(tmpdir(),"code-esm-client-"));
    try {
      for(const file of files) {
        const target=path.join(directory,file.path);
        await mkdir(path.dirname(target),{recursive:true});
        await writeFile(target,file.text,"utf8");
      }
      const env={...process.env};
      delete env.NODE_TEST_CONTEXT;
      const received=spawnSync(process.execPath,["--input-type=module","-e",
        'import {catalog} from "./apps/catalog.mjs"; if (await catalog.operations["exact-source"].operation(4)!==8) process.exit(7);'],{
        cwd:directory,encoding:"utf8",timeout:10000,env,
      });
      assert.equal(received.status,0,
        "native Code consumer cannot execute "+exportName+": "+received.stderr);
    } finally {await rm(directory,{recursive:true,force:true});}
  }
  const operation={name:"exact-source",module:"src/exact-source.mjs",exportName:"account$"};
  for(const forged of [
    '// export function account$(value) { return value; }\nexport const other = 0;',
    'export const text = "export function account$() {}";',
    'export function account$(){return + ;}',
  ]) {
    const refused=moduleOfDelivery(JSON.stringify({source:forged,question:null}),operation);
    assert.equal(refused.source,undefined,
      "a source-string or syntax error cannot be admitted as the selected module export");
    assert.ok(typeof refused.refused==="string"&&refused.refused.length);
  }
});
