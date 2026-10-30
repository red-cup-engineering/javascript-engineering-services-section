import assert from "node:assert/strict";
import test from "node:test";
import { bindNativeAssayProfile, nativeAssayProfileIdentity, nativeAssaySourceClosure, deriveJsnodeModules, sourceMessagesOf } from "../src/derive-jsnode-package-from-closure.mjs";
import { sha256Digest } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";
import { planJsnodeModules, testsOfClosure } from "../src/plan-jsnode-modules.mjs";
import { projectJsnodeModules } from "../src/project-jsnode-modules.mjs";
import { moduleWorkOrder } from "./fixtures/module-work-order.mjs";
import { controlledLocalAssayFixture } from "./fixtures/controlled-local-assay.mjs";

// Controlled literals qualify this producer's native-carrier plumbing. They are
// neither CAIRN fixtures nor an independently isolated production execution.
const profile = {
  type: "JsnodeNativeAssayProfile", version: 1, id: "test.native-file-lifecycle.v1",
  source: { locator: "test:native-file-lifecycle-contract", digest: "sha256:" + "3".repeat(64) },
  contract: "createNativeHost takes {root:absolute path,maximumBytes:bigint,seed:Uint8Array,authorize:async function} and returns one native refresh/current/close handle. Refresh checks the original grant and reads bytes from root/input. Retain the seed reference and each admitted current record. Close is idempotent and prevents refresh and current acquisition.",
  scenarioSchema: { type: "object", additionalProperties: false, required: ["bytes", "budget"], properties: {
    bytes: { type: "array", minItems: 1, maxItems: 16, items: { type: "integer", minimum: 0, maximum: 255 } },
    budget: { type: "integer", minimum: 1, maximum: 16 },
  } },
  observationSchema: { type: "boolean", const: true },
};
const operation = { name: "native-host", module: "src/native-host.mjs", exportName: "createNativeHost",
  description: "Create a native capability with a bounded filesystem lifecycle", nativeProfile: profile };
const scenario = { bytes: [0, 255, 1], budget: 4 };
const hiddenScenario = { bytes: [3, 0, 254], budget: 8 };
const clauseCases = [{ operation: "native-host", name: "private-native-lifecycle", clauses: ["identity"], input: hiddenScenario, output: true, throws: null }];
function orderOf() {
  const order = moduleWorkOrder();
  order.requirements[0].statement = profile.contract;
  order.projections[0].configuration = { operations: [structuredClone(operation)],
    examples: [{ name: "public-native-lifecycle", operation: "native-host", input: scenario, output: true }], dependencies: {} };
  return order;
}
const source = `import {readFile} from 'node:fs/promises';
export function createNativeHost({root,maximumBytes,seed,authorize}){
 if(typeof maximumBytes!=='bigint'||!(seed instanceof Uint8Array)||typeof authorize!=='function')throw new TypeError();
 let closed=false,current=null;
 return {async refresh(context){if(closed)throw new Error('closed');if(await authorize(context)!==true)throw new Error('denied');if(closed)throw new Error('closed');const bytes=new Uint8Array(await readFile(root+'/input'));if(BigInt(bytes.length)>maximumBytes)throw new RangeError('budget');current=Object.freeze({bytes,seed});return current;},current(){if(closed)throw new Error('closed');return current;},close(){closed=true;current=null;}};
}`;
function projectNative({ operation: op, cases }) {
  return [
    "import assert from 'node:assert/strict';import test from 'node:test';",
    "import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';",
    `import {${op.exportName} as createNativeHost} from '../${op.module}';`,
    ...cases.map(item => `test(${JSON.stringify(item.testName)},async()=>{
      const root=await mkdtemp(path.join(tmpdir(),'native-fixture-'));
      try {
        const scenario=${JSON.stringify(item.input)},seed=new Uint8Array(scenario.bytes);let allowed=true,calls=0;
        await writeFile(root+'/input',seed);
        const context=Object.freeze({kind:'fixture-owner'}),authorize=async supplied=>{calls++;assert.equal(supplied,context);return allowed;};
        const host=createNativeHost({root,maximumBytes:BigInt(scenario.budget),seed,authorize});
        assert.equal(host.current(),null);
        const first=await host.refresh(context);assert.equal(first.seed,seed);assert.ok(first.bytes instanceof Uint8Array);assert.deepEqual(first.bytes,seed);assert.equal(host.current(),first);
        await writeFile(root+'/input',new Uint8Array([9]));const second=await host.refresh(context);assert.notEqual(second,first);assert.deepEqual(first.bytes,seed);assert.deepEqual(second.bytes,new Uint8Array([9]));
        allowed=false;await assert.rejects(host.refresh(context),/denied/);assert.equal(host.current(),second);assert.equal(calls,3);
        host.close();host.close();assert.throws(()=>host.current(),/closed/);await assert.rejects(host.refresh(context),/closed/);
        assert.equal(true,${JSON.stringify(item.output)});
      }finally{await rm(root,{recursive:true,force:true});}
    });`),
  ].join("\n");
}
function literalInference(implementation = source, onSource = () => {}) {
  const calls = [];
  const infer = async request => {
    calls.push(request);
    const member = JSON.parse(request.messages[1].content).selectedModule;
    if (member !== undefined) onSource();
    return { text: JSON.stringify(member === undefined ? { cases: clauseCases, question: null } : { source: implementation, question: null }), lot: { id: "controlled-native:" + calls.length } };
  };
  return { infer, calls };
}

test("native planning preserves the native interface without runtime JSON schemas or a command face", () => {
  const result = planJsnodeModules(orderOf());
  assert.equal(result.type, "JsnodeModuleFabricationPlan", JSON.stringify(result));
  assert.deepEqual(result.paths, ["src/native-host.mjs", "test/native-host-examples.test.mjs"]);
  const files = projectJsnodeModules({ sources: [{ path: operation.module, text: source }], operations: [operation] });
  assert.deepEqual(files.map(file => file.path), ["src/native-host.mjs"]);
  assert.throws(() => projectJsnodeModules({ sources: [{ path: operation.module, text: source }], operations: [{ ...operation, inputSchema: {} }] }), /native.*JSON schemas/i);
  assert.throws(() => projectJsnodeModules({ sources: [{ path: operation.module, text: source }], operations: [operation], cli: { path: "apps/host.mjs", name: "host", description: "forbidden native JSON face" } }), /native.*(?:CLI|command)/i);
});

test("the host binds an immutable source-qualified profile; JSON cannot supply its projector", () => {
  const original = structuredClone(profile), binding = bindNativeAssayProfile(original, projectNative);
  assert.ok(Object.isFrozen(binding));assert.ok(Object.isFrozen(binding.profile));assert.ok(Object.isFrozen(binding.profile.scenarioSchema));
  assert.equal(binding.identity, nativeAssayProfileIdentity(profile));
  original.contract = "mutated";
  assert.equal(binding.profile.contract, profile.contract);
  assert.equal(JSON.stringify(binding).includes("projectNative"), false);
  assert.throws(() => bindNativeAssayProfile({ ...profile, callback: () => true }, projectNative));
  assert.throws(() => bindNativeAssayProfile(profile, "not-a-function"), /projection|function/i);
  let invoked = false;
  const accessor = { ...profile, get contract() { invoked = true;return "bad"; } };
  assert.throws(() => bindNativeAssayProfile(accessor, projectNative), /data|accessor/i);
  assert.equal(invoked, false);
});

test("absent, forged, duplicate or changed native bindings refuse before any inference or execution", async () => {
  const binding = bindNativeAssayProfile(profile, projectNative);
  for (const nativeAssayBindings of [undefined, [{ ...binding }], [bindNativeAssayProfile({ ...profile, contract: "other" }, projectNative)], [binding, binding]]) {
    let inferCalls=0,executionCalls=0;
    const result=await deriveJsnodeModules(orderOf(),{nativeAssayBindings,infer:async()=>{inferCalls++;throw 0;},isolatedAssayExecutor:async()=>{executionCalls++;throw 0;}});
    assert.equal(result.code,"NATIVE_ASSAY_BINDING_UNAVAILABLE",JSON.stringify(result));
    assert.equal(inferCalls,0);assert.equal(executionCalls,0);
  }
});

test("native scenarios remain source-free data and cannot be confused with unary runtime schemas", () => {
  const order=orderOf();order.projections[0].configuration.operations[0].inputSchema={};
  assert.equal(planJsnodeModules(order).type,"JsnodeModuleDerivationRefusal");
  const bad=orderOf();bad.projections[0].configuration.examples[0].input={...scenario,budget:1n};
  assert.equal(planJsnodeModules(bad).type,"JsnodeModuleDerivationRefusal");
  assert.throws(()=>testsOfClosure(orderOf().projections[0].configuration),/native.*binding/i);
});

test("native fixtures are projected once before source, run real native values, and retain prior assay bytes", async () => {
  let projections=0;
  const binding=bindNativeAssayProfile(profile,request=>{projections++;assert.equal(Object.isFrozen(request),true);assert.equal(Object.isFrozen(request.cases[0].input),true);return projectNative(request);});
  const provider=literalInference(source,()=>assert.equal(projections,1));
  const result=await deriveJsnodeModules(orderOf(),{...provider,nativeAssayBindings:[binding],isolatedAssayExecutor:controlledLocalAssayFixture});
  assert.equal(result.type,"JsnodeModuleProposal",JSON.stringify(result));assert.equal(projections,1);
  assert.equal(provider.calls.length,2);
  const writer=JSON.stringify(provider.calls[1].messages);
  assert.equal(writer.includes("private-native-lifecycle"),false);
  assert.equal(writer.includes("native-fixture-"),false);
  assert.match(writer,/native.*contract/i);
  assert.equal(result.derivation.nativeAssayProfiles[0].identity,binding.identity);
  assert.match(result.derivation.nativeAssayProfiles[0].assayDigest,/^sha256:[a-f0-9]{64}$/);
});

test("a native close defect is caught by the real controlled fixture without fabricating proposal acceptance", async () => {
  const broken=source.replace("close(){closed=true;current=null;}","close(){current=null;}");
  const result=await deriveJsnodeModules(orderOf(),{...literalInference(broken),nativeAssayBindings:[bindNativeAssayProfile(profile,projectNative)],isolatedAssayExecutor:controlledLocalAssayFixture});
  assert.equal(result.type,"JsnodeModuleDerivationRefusal");assert.equal(result.cause.scope,"module-set");
  assert.ok(result.cause.derivations.some(item=>item.outcome==="composition-refused"));
  assert.equal(result.cause.nativeAssayProfiles[0].identity,nativeAssayProfileIdentity(profile));
});

test("native binding does not replace the explicit isolated executor or admit async/unbounded fixture projections", async () => {
  let calls=0;
  const absent=await deriveJsnodeModules(orderOf(),{nativeAssayBindings:[bindNativeAssayProfile(profile,projectNative)],infer:async()=>{calls++;throw 0;}});
  assert.equal(absent.code,"ISOLATED_ASSAY_UNAVAILABLE");assert.equal(calls,0);
  for(const project of [async()=>projectNative({operation,cases:[]}),()=>({path:"/escape",text:"source"}),()=>"x".repeat(1024*1024+1)]){
    const provider=literalInference();
    const refused=await deriveJsnodeModules(orderOf(),{...provider,nativeAssayBindings:[bindNativeAssayProfile(profile,project)],isolatedAssayExecutor:controlledLocalAssayFixture});
    assert.equal(refused.code,"NATIVE_ASSAY_PROJECTION_REFUSED",JSON.stringify(refused));assert.equal(provider.calls.length,1);
  }
});

test("the existing JSON operation profile still plans and projects its unchanged unary assay", () => {
  const order=moduleWorkOrder(),closure=order.projections[0].configuration;
  assert.equal(planJsnodeModules(order).type,"JsnodeModuleFabricationPlan");
  const generated=testsOfClosure(closure)[0].text;
  assert.match(generated,/import \{ "identity" as fabricatedOperation \} from/);
  assert.match(generated,/await fabricatedOperation\(2\), 2/);
  assert.match(sourceMessagesOf(order,closure.operations)[0].content,/input schema/);
});

const originalSupportText="import {readFile} from 'node:fs/promises';\n// ORIGINAL_HELPER_ONLY: retained fixture-owned bytes, never a source delivery.\nexport async function readOriginalBytes(root){return new Uint8Array(await readFile(root+'/input'));}\n";
const originalSupport={path:"src/owned-support.mjs",text:originalSupportText,source:{locator:"test:original-native-support",digest:sha256Digest(originalSupportText)}};
const withSupport=()=>({...profile,sourceClosure:nativeAssaySourceClosure([originalSupport])});
const withProfile=nativeProfile=>{const order=orderOf();order.projections[0].configuration.operations[0].nativeProfile=nativeProfile;return order;};
const supportedSource=source.replace("import {readFile} from 'node:fs/promises';","import {readOriginalBytes} from './owned-support.mjs';")
  .replace("new Uint8Array(await readFile(root+'/input'))","await readOriginalBytes(root)");

test("original sibling sources are identity-bound, staged through the same isolated boundary and absent from generated outputs",async()=>{
  const nativeProfile=withSupport(),binding=bindNativeAssayProfile(nativeProfile,projectNative,{sourceFiles:[originalSupport]});
  const provider=literalInference(supportedSource);let runs=0;
  const result=await deriveJsnodeModules(withProfile(nativeProfile),{...provider,nativeAssayBindings:[binding],isolatedAssayExecutor:async request=>{
    runs++;assert.equal(request.network,false);assert.equal(request.writableHostWorkspace,false);
    assert.equal(request.files.find(file=>file.path===originalSupport.path).text,originalSupport.text);
    return controlledLocalAssayFixture(request);
  }});
  assert.equal(result.type,"JsnodeModuleProposal",JSON.stringify(result));assert.equal(runs,1);
  assert.deepEqual(result.files.map(file=>file.path),["src/native-host.mjs"]);
  assert.deepEqual(result.derivation.sources.map(file=>file.path),["src/native-host.mjs"]);
  assert.equal(result.derivation.nativeAssayProfiles[0].sourceClosure.identity,nativeProfile.sourceClosure.identity);
  assert.equal(result.derivation.nativeAssayProfiles[0].sourceClosure.readOnly,true);
  assert.equal(JSON.stringify(provider.calls).includes("ORIGINAL_HELPER_ONLY"),false,"source writers get original identity and contract, never hidden fixture/support bytes");
});

test("a retained source cannot be missing, changed, forged, escaped or overwritten by a generated target",async()=>{
  const nativeProfile=withSupport();
  assert.throws(()=>bindNativeAssayProfile(nativeProfile,projectNative),/source closure binding/);
  assert.throws(()=>bindNativeAssayProfile(nativeProfile,projectNative,{sourceFiles:[{...originalSupport,text:originalSupport.text+"\n"}]}),/bytes differ/);
  const changed={...originalSupport,text:originalSupport.text+"\n",source:{...originalSupport.source,digest:sha256Digest(originalSupport.text+"\n")}};
  assert.throws(()=>bindNativeAssayProfile(nativeProfile,projectNative,{sourceFiles:[changed]}),/binding/);
  assert.throws(()=>bindNativeAssayProfile({...nativeProfile,sourceClosure:{...nativeProfile.sourceClosure,identity:"forged"}},projectNative,{sourceFiles:[originalSupport]}),/identity/);
  for(const path of ["src/../escape.mjs","/absolute.mjs","src/node_modules/x.mjs","src/back\\slash.mjs"])
    assert.throws(()=>nativeAssaySourceClosure([{...originalSupport,path}]),/path|confined/i);
  const overlap={...originalSupport,path:operation.module},overlapProfile={...profile,sourceClosure:nativeAssaySourceClosure([overlap])};
  let calls=0;
  const refused=await deriveJsnodeModules(withProfile(overlapProfile),{nativeAssayBindings:[bindNativeAssayProfile(overlapProfile,projectNative,{sourceFiles:[overlap]})],infer:async()=>{calls++;throw 0;},isolatedAssayExecutor:controlledLocalAssayFixture});
  assert.equal(refused.code,"NATIVE_ASSAY_BINDING_UNAVAILABLE");assert.equal(calls,0);assert.match(refused.message,/overwrite/);
});

test("retained source context must still form a complete original import closure",async()=>{
  const text="import './missing-original.mjs';\n"+originalSupportText;
  const incomplete={...originalSupport,text,source:{...originalSupport.source,digest:sha256Digest(text)}};
  const nativeProfile={...profile,sourceClosure:nativeAssaySourceClosure([incomplete])};let executions=0;
  const result=await deriveJsnodeModules(withProfile(nativeProfile),{...literalInference(supportedSource),nativeAssayBindings:[bindNativeAssayProfile(nativeProfile,projectNative,{sourceFiles:[incomplete]})],isolatedAssayExecutor:async()=>{executions++;throw 0;}});
  assert.equal(result.type,"JsnodeModuleDerivationRefusal");assert.match(result.cause.evidence,/unresolvable projected import/);assert.equal(executions,0);
});
