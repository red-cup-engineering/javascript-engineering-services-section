// Original Code-maker receiving of the upstream Specification Engineering
// HLD/LLD reader at one exact source cut. Synthetic records are unadmitted;
// structurally received candidates are not Stage Proof or effectful Work.
import test from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const originalRoot = process.env.SPEC_ARCHITECTURE_SOURCE_DIR;
const packed = process.env.CODE_PACKED_CONSUMER === '1';

async function providers() {
  assert.ok(originalRoot, 'original Specification checkout required for source receiving');
  const [{ planEngineeringDesign, receiveEngineeringDesign, readEngineeringCodeWork },
    { sourcesFixture, clausesSplitAcrossModels },
    { renderJsonSchemaModule },
    { admit }, { projectEngineeringDesignCode }] = await Promise.all([
      import(pathToFileURL(join(originalRoot, 'src/engineering-design.mjs')).href),
      import(pathToFileURL(join(originalRoot, 'test/engineering-design-source-cut.fixture.mjs')).href),
      packed
        ? import('@red-cup-engineering/javascript-node-code-fabrication-services-section/transform-json-schema-to-typescript')
        : import('../scripts/transform-json-schema-to-typescript.mjs'),
      import('@red-cup-engineering/signcell/type-system'),
      packed
        ? import('@red-cup-engineering/javascript-node-code-fabrication-services-section/project-engineering-design-code')
        : import('../scripts/project-engineering-design-code.mjs'),
    ]);
  return { planEngineeringDesign, receiveEngineeringDesign,
    sourcesFixture, clausesSplitAcrossModels, renderJsonSchemaModule, admit,
    readEngineeringCodeWork, projectEngineeringDesignCode };
}

function highLevelDesign() {
  const component = id => ({
    id, owner: 'fixture-data-owner', layer: 'data',
    responsibility: 'Retain ' + id, dependencyIds: [],
    providedPorts: [], requiredPorts: [],
  });
  return {
    components: [component('comp-a'), component('comp-b')],
    connections: [],
    traceability: [
      { requirementCellId: 'source-req:a', specificationClauseIds: ['clause-a'],
        architectureModelIds: ['model-a'], designElementIds: ['comp-a'] },
      { requirementCellId: 'source-req:b', specificationClauseIds: ['clause-b'],
        architectureModelIds: ['model-b'], designElementIds: ['comp-b'] },
    ],
    openQuestions: [],
  };
}

function lowLevelDesign() {
  // The authored Design supplies validation contracts. The Code maker does
  // not choose payload requirements, derive user authority or invent behavior.
  const input = { type: 'object', additionalProperties: false,
    required: ['originalSource'], properties: {
      originalSource: { type: 'string', minLength: 1 },
    } };
  const output = { type: 'object', additionalProperties: false,
    required: ['retained'], properties: { retained: { const: true } } };
  const operation = (id, componentId) => ({
    id, componentId, module: 'src/' + id + '.mjs',
    exportName: id === 'op-a' ? 'retainA' : 'retainB',
    inputSchemaJson: JSON.stringify(input),
    outputSchemaJson: JSON.stringify(output),
    behavior: 'Retain original source ' + id,
    preconditions: [], postconditions: ['Original source remains attributable'],
    failureCases: ['Source unavailable'], resourceBounds: ['No unbounded allocations'],
    effectBoundaries: ['Pure candidate; effect not authorized'],
    acceptanceObligations: ['Independent source/design Proof required'],
  });
  return {
    operations: [operation('op-a', 'comp-a'), operation('op-b', 'comp-b')],
    traceability: [
      { requirementCellId: 'source-req:a', specificationClauseIds: ['clause-a'],
        architectureModelIds: ['model-a'], designElementIds: ['op-a'] },
      { requirementCellId: 'source-req:b', specificationClauseIds: ['clause-b'],
        architectureModelIds: ['model-b'], designElementIds: ['op-b'] },
    ],
    openQuestions: [],
  };
}

test('original HLD → LLD → generated runnable source-pinned schema types, without Proof promotion', {
  skip: !originalRoot && 'requires exact original Specification checkout',
}, async () => {
  const p = await providers();
  const sources = p.sourcesFixture();
  const hldPlan = p.planEngineeringDesign({ stage: 'high-level', sources });
  const highLevel = p.receiveEngineeringDesign({ stage: 'high-level', sources,
    plan: hldPlan, deliveryText: JSON.stringify(highLevelDesign()) });
  assert.equal(highLevel.type, 'EngineeringDesignCandidate');
  assert.equal(highLevel.admitted, false);
  assert.equal(highLevel.proof, 'unreceived');

  const lowSources = [...sources,
    { kind: 'high-level', text: JSON.stringify(highLevel) }];
  const lowPlan = p.planEngineeringDesign({ stage: 'low-level', sources: lowSources });
  const lowLevel = p.receiveEngineeringDesign({ stage: 'low-level', sources: lowSources,
    plan: lowPlan, deliveryText: JSON.stringify(lowLevelDesign()) });
  assert.equal(lowLevel.type, 'EngineeringDesignCandidate');
  assert.equal(lowLevel.admitted, false);
  assert.equal(lowLevel.proof, 'unreceived');
  assert.deepEqual(lowLevel.sources.slice(0, 3), highLevel.sources);

  // Fabricate actual executable SignCell runtime schema guards from the
  // original LLD's typed operation inputs/outputs, with an immutable original
  // candidate/source lineage. No operation bodies or Proof are fabricated.
  // SignCell's incumbent executable schema reader requires stable $id/title/
  // description. Derive defaults deterministically from the *entire* exact
  // source/design candidate, never from a new clock or fabricated authority.
  // Preserve any metadata explicitly authored in the LLD schema itself.
  const candidateDigest = createHash('sha256')
    .update(JSON.stringify(lowLevel), 'utf8').digest('hex');
  const runtimeSchema = (operation, side) => ({
    $id: 'https://schemas.example.test/unadmitted/' + candidateDigest + '/' +
      operation.id + '/' + side,
    title: 'Unadmitted ' + operation.id + ' ' + side,
    description: 'Source-derived ' + side + ' contract for ' +
      operation.module + '#' + operation.exportName +
      '; semantic Proof and Work admission not received',
    ...JSON.parse(side === 'input'
      ? operation.inputSchemaJson : operation.outputSchemaJson),
  });
  const entries = [
    { exportName: 'designSource', typeName: 'DesignSource',
      schema: { const: { highLevel, lowLevel } } },
    ...lowLevel.design.operations.flatMap((operation, i) => [
      { exportName: 'inputSchema' + i, typeName: 'Input' + i,
        runtimeName: 'inputType' + i, schema: runtimeSchema(operation, 'input') },
      { exportName: 'outputSchema' + i, typeName: 'Output' + i,
        runtimeName: 'outputType' + i, schema: runtimeSchema(operation, 'output') },
    ]),
  ];
  const binding = { name: 'defineSchemaType',
    from: import.meta.resolve('@red-cup-engineering/signcell/type-system/schema-type') };
  const render = () => p.renderJsonSchemaModule(entries,
    { format: 'javascript', runtimeBinding: binding });
  const javascript = render();
  assert.equal(javascript, render(), 'same exact source and Design must yield identical Code');
  const generated = await import('data:text/javascript;base64,' +
    Buffer.from(javascript).toString('base64'));
  assert.deepEqual(generated.designSource.const.highLevel, highLevel);
  assert.deepEqual(generated.designSource.const.lowLevel, lowLevel);
  assert.equal(Object.isFrozen(generated.designSource.const.lowLevel.design.operations[0]), true);
  assert.throws(() => {
    generated.designSource.const.lowLevel.proof = 'accepted';
  }, TypeError);
  assert.equal(p.admit(generated.inputType0, { originalSource: 'from buyer' }).ok, true);
  assert.equal(p.admit(generated.inputType0, { originalSource: '' }).ok, false);
  assert.equal(p.admit(generated.inputType0, { originalSource: 'a', extra: true }).ok, false);
  assert.equal(p.admit(generated.outputType0, { retained: true }).ok, true);
  assert.equal(p.admit(generated.outputType0, { retained: false }).ok, false);
  assert.equal(generated.designSource.const.lowLevel.proof, 'unreceived');
});

test('Code source-bound Design receiving rejects stale ancestry and HLD/LLD allocation drift', {
  skip: !originalRoot && 'requires exact original Specification checkout',
}, async () => {
  const p = await providers();
  const sources = p.sourcesFixture();
  const changedSources = structuredClone(sources);
  const changedRequirement = JSON.parse(changedSources[0].text);
  changedRequirement['met-when'][0].says = 'An independent buyer changed the source.';
  changedSources[0].text = JSON.stringify(changedRequirement);
  assert.throws(() => p.planEngineeringDesign({
    stage: 'high-level', sources: changedSources,
  }), TypeError, 'reusing a stale Specification/Architecture must refuse');

  const hldPlan = p.planEngineeringDesign({ stage: 'high-level', sources });
  const highLevel = p.receiveEngineeringDesign({
    stage: 'high-level', sources, plan: hldPlan,
    deliveryText: JSON.stringify(highLevelDesign()),
  });
  assert.equal(highLevel.type, 'EngineeringDesignCandidate');
  const lowSources = [...sources, { kind: 'high-level', text: JSON.stringify(highLevel) }];
  const lowPlan = p.planEngineeringDesign({ stage: 'low-level', sources: lowSources });
  const switched = lowLevelDesign();
  switched.traceability[0].architectureModelIds = ['model-a-alt'];
  assert.deepEqual(p.receiveEngineeringDesign({
    stage: 'low-level', sources: lowSources, plan: lowPlan,
    deliveryText: JSON.stringify(switched),
  }), { type: 'EngineeringDesignDerivationRefusal', reason: 'invalid-design' },
  'an individually valid model from a different HLD allocation must refuse');
});

test('Code cannot receive partially modeled specification clauses as valid Design', {
  skip: !originalRoot && 'requires exact original Specification checkout',
}, async () => {
  const p = await providers();
  const unmodeled = p.clausesSplitAcrossModels();
  assert.throws(() => p.planEngineeringDesign({
    stage: 'high-level', sources: unmodeled,
  }), TypeError, 'a normative clause without any source-authored model must refuse before inference');

  const sources = p.clausesSplitAcrossModels({ completeArchitecture: true });
  const plan = p.planEngineeringDesign({ stage: 'high-level', sources });
  const partial = highLevelDesign();
  partial.traceability[0].specificationClauseIds.push('clause-a2');
  assert.deepEqual(p.receiveEngineeringDesign({
    stage: 'high-level', sources, plan, deliveryText: JSON.stringify(partial),
  }), { type: 'EngineeringDesignDerivationRefusal', reason: 'invalid-design' },
  'one model that covers only clause-a cannot falsely receive clause-a2');
  partial.traceability[0].architectureModelIds.push('model-a2');
  const complete = p.receiveEngineeringDesign({
    stage: 'high-level', sources, plan, deliveryText: JSON.stringify(partial),
  });
  assert.equal(complete.type, 'EngineeringDesignCandidate');
  assert.equal(complete.admitted, false);
  assert.equal(complete.proof, 'unreceived');
});


test('Code receives only byte-materializable LLD module paths from the current Specification source', {
  skip: !originalRoot && 'requires exact original Specification checkout',
}, async () => {
  const p = await providers();
  const sources = p.sourcesFixture();
  const hldPlan = p.planEngineeringDesign({ stage: 'high-level', sources });
  const highLevel = p.receiveEngineeringDesign({
    stage: 'high-level', sources, plan: hldPlan,
    deliveryText: JSON.stringify(highLevelDesign()),
  });
  assert.equal(highLevel.type, 'EngineeringDesignCandidate');
  const lowSources = [...sources, { kind: 'high-level', text: JSON.stringify(highLevel) }];
  const lowPlan = p.planEngineeringDesign({ stage: 'low-level', sources: lowSources });

  // The actual upstream receiver—not a copied Code validation function—
  // must refuse names that cannot retain original filesystem byte identity.
  // Run these checks in both source tests and the separately installed package
  // consumer before ever rendering generated Code from an invalid candidate.
  const refusal = { type: 'EngineeringDesignDerivationRefusal', reason: 'invalid-design' };
  for (const [name, module] of [
    ['embedded NUL', 'src/op-' + String.fromCharCode(0) + '-a.mjs'],
    ['unpaired high surrogate', 'src/op-' + String.fromCharCode(0xD800) + '-a.mjs'],
    ['unpaired low surrogate', 'src/op-' + String.fromCharCode(0xDC00) + '-a.mjs'],
  ]) {
    const bad = lowLevelDesign();
    bad.operations[0].module = module;
    assert.deepEqual(p.receiveEngineeringDesign({
      stage: 'low-level', sources: lowSources, plan: lowPlan,
      deliveryText: JSON.stringify(bad),
    }), refusal, name + ' must refuse before Code generation');
  }

  // A valid astral Unicode scalar is NOT refused as a supposed byte hazard.
  // Preserve that exact authored path into the incumbent executable Code
  // maker; do not normalize, replace or invent a path independently.
  const valid = lowLevelDesign();
  valid.operations[0].module = 'src/op-🧵-a.mjs';
  const received = p.receiveEngineeringDesign({
    stage: 'low-level', sources: lowSources, plan: lowPlan,
    deliveryText: JSON.stringify(valid),
  });
  assert.equal(received.type, 'EngineeringDesignCandidate');
  assert.equal(received.admitted, false);
  assert.equal(received.proof, 'unreceived');
  const emitted = p.renderJsonSchemaModule([
    { exportName: 'modulePath', typeName: 'ModulePath',
      schema: { const: received.design.operations[0].module } },
  ], {
    format: 'javascript',
    runtimeBinding: { name: 'defineSchemaType',
      from: import.meta.resolve('@red-cup-engineering/signcell/type-system/schema-type') },
  });
  const executable = await import('data:text/javascript;base64,' +
    Buffer.from(emitted).toString('base64'));
  assert.equal(executable.modulePath.const, 'src/op-🧵-a.mjs');
});


test('the ORIGINAL Requirement → Specification → Architecture → HLD → LLD produces executable source-checked Code, detects disagreement and receives a corrected revision', {
  skip: !originalRoot && 'requires exact original Specification/Code source owner',
}, async t => {
  const p = await providers(), sources = p.sourcesFixture();
  const hldPlan = p.planEngineeringDesign({stage:'high-level', sources});
  const highLevel = p.receiveEngineeringDesign({
    stage:'high-level', sources, plan:hldPlan,
    deliveryText:JSON.stringify(highLevelDesign()),
  });
  assert.equal(highLevel.type,'EngineeringDesignCandidate');
  const lowSources = [...sources,{kind:'high-level',text:JSON.stringify(highLevel)}];
  const lowPlan = p.planEngineeringDesign({stage:'low-level',sources:lowSources});
  const designText=JSON.stringify(lowLevelDesign());
  const lowLevel = p.receiveEngineeringDesign({
    stage:'low-level',sources:lowSources,plan:lowPlan,deliveryText:designText,
  });
  assert.equal(lowLevel.type,'EngineeringDesignCandidate');

  const goodA='export function retainA(value) { return {retained:true}; }\n';
  const badA='export function retainA(value) { return {retained:false}; }\n';
  const goodB='export async function retainB(value) { return {retained:true}; }\n';
  const digest = text => 'sha256:'+createHash('sha256').update(text,'utf8').digest('hex');
  const selected=(a=goodA,b=goodB,expectedA=digest(a)) => p.readEngineeringCodeWork({
    designCandidate:lowLevel,originalPlan:lowPlan,originalDeliveryText:designText,
    sourceViews:[
      {owner:'fixture-data-owner',path:'src/op-a.mjs',text:a,expectedSha256:expectedA},
      {owner:'fixture-data-owner',path:'src/op-b.mjs',text:b,expectedSha256:digest(b)},
    ],
  });
  const cases=[
    {operationId:'op-a', requirementCellId:'source-req:a',name:'retains-source-a',
      input:{originalSource:'owned-source'},expectedOutput:{retained:true},throws:null},
    {operationId:'op-a', requirementCellId:'source-req:a',name:'rejects-invalid-input-a',
      input:{originalSource:''},expectedOutput:null,throws:'TypeError'},
    {operationId:'op-b', requirementCellId:'source-req:b',name:'retains-source-b',
      input:{originalSource:'another-source'},expectedOutput:{retained:true},throws:null},
    {operationId:'op-b', requirementCellId:'source-req:b',name:'rejects-invalid-input-b',
      input:{originalSource:''},expectedOutput:null,throws:'TypeError'},
  ];
  const receive = (a=goodA,b=goodB,expectedA=digest(a)) =>
    p.projectEngineeringDesignCode({codeWorkReadout:selected(a,b,expectedA),cases});
  const initial=receive();
  assert.equal(initial.type,'EngineeringDesignCodeCandidate');
  assert.equal(initial.status,'source-observed-code-projected');
  assert.equal(initial.semanticProof,'unreceived');
  assert.equal(initial.executableWork,false);
  assert.equal(initial.codeApplied,false);
  assert.equal(initial.beneficiaryReceived,false);
  assert.equal(initial.independentAssayAuthority,'unverified-submitted-cases');
  assert.equal(initial.packages.length,1,'same original HLD source owner gets one Code package');
  assert.deepEqual(initial.packages[0].operations.map(x=>x.operationId),['op-a','op-b']);
  assert.equal(initial.packages[0].files.length,2);
  assert.equal(JSON.stringify(initial),JSON.stringify(receive()),
    'unchanged source/LLD and submitted assays must produce identical Code');

  const workspace=await mkdtemp(join(process.cwd(),'.generated-design-operation-'));
  t.after(()=>rm(workspace,{recursive:true,force:true}));
  await mkdir(join(workspace,'src'),{recursive:true});
  await mkdir(join(workspace,'test'),{recursive:true});
  const writeProjection=async (projection,sourceA=goodA,sourceB=goodB) => {
    await writeFile(join(workspace,'src/op-a.mjs'),sourceA,'utf8');
    await writeFile(join(workspace,'src/op-b.mjs'),sourceB,'utf8');
    for(const file of projection.packages[0].files)
      await writeFile(join(workspace,file.path),file.text,'utf8');
  };
  const run=()=>{
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath,[
      '--test','--test-reporter=tap','test/engineering-code-contracts.test.mjs'
    ],{cwd:workspace,env,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  };

  await writeProjection(initial);
  const passing=run();
  assert.equal(passing.status,0,passing.stdout+'\n'+passing.stderr);
  assert.match(passing.stdout,/# pass 4\b/u,'all original independent cases executed');

  // The old Code candidate must not execute a materially changed source.
  await writeFile(join(workspace,'src/op-a.mjs'),badA,'utf8');
  const stale=run();
  assert.notEqual(stale.status,0,'source mutation must refute the old Code artifact');
  assert.match(stale.stdout,/Design source revision disagreement: op-a/u);
  // Re-receiving the same LLD against changed source bytes produces a new
  // executable Code candidate, but the behavioral contract itself still
  // detects the wrong implementation output. No self-awarded Proof.
  const incorrect=receive(badA);
  assert.notEqual(incorrect.packages[0].files[0].digest,
    initial.packages[0].files[0].digest);
  await writeProjection(incorrect,badA);
  const failing=run();
  assert.notEqual(failing.status,0);
  assert.match(failing.stdout,/Design output disagreement: op-a/u);

  // Repair the actual implementation source and re-project from current
  // owned bytes; the *same* independently authored assays must all pass.
  const repaired=receive(goodA);
  await writeProjection(repaired,goodA);
  const received=run();
  assert.equal(received.status,0,received.stdout+'\n'+received.stderr);
  assert.match(received.stdout,/# pass 4\b/u);
  assert.equal(repaired.semanticProof,'unreceived',
    'a passing Code test is not the distinct Engineering Stage Proof');

  const staleView=selected(badA,goodB,digest(goodA));
  assert.equal(staleView.status,'source-disagreement');
  assert.throws(()=>p.projectEngineeringDesignCode({codeWorkReadout:staleView,cases}),
    {code:'CODE_SOURCE_NOT_RECEIVED'});
  assert.throws(()=>p.projectEngineeringDesignCode({
    codeWorkReadout:{...selected(),independentProof:'received'},cases,
  }),{code:'CODE_SOURCE_NOT_RECEIVED'},'caller cannot invent Stage Proof');
  assert.throws(()=>p.projectEngineeringDesignCode({
    codeWorkReadout:selected(),cases:cases.filter(c=>c.operationId==='op-a'),
  }),{code:'ASSAY_COVERAGE_INCOMPLETE'},'a requirement cell without tests is not accepted');
});
