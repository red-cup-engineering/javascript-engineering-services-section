import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { planAgencyCharacterNormalization, planCharacterJournalPlacement } from '../scripts/plan-agency-character-normalization.mjs';
import { applyAgencyNormalization } from '../scripts/apply-agency-normalization.mjs';

const witness = (id, authored, pool = 'characters') => {
  const sourceText = JSON.stringify(authored, null, 2) + '\n';
  return { id, pool, section: 'services/example-services-section',
    source: `services/example-services-section/lib/agency/${pool}/${id}.json`, authored, sourceText,
    sha256: createHash('sha256').update(sourceText).digest('hex') };
};
const records = plan => plan.changes.flatMap(change => change.outputs.map(output => JSON.parse(output.text)));

test('authored role traits survive as explicit disposition; office claims create no seat', () => {
  const input = witness('author', { id: 'author', name: 'Author', kind: 'agent', description: 'Reads before judging.',
    voice: 'Plain.', perspective: { limits: ['Seek contrary sources.'] }, office: 'editor' });
  const p = planAgencyCharacterNormalization({ declarations: [input] }), [role] = records(p);
  assert.deepEqual(Object.keys(role).sort(), ['disposition', 'id', 'kind', 'name', 'x-provenance']);
  assert.equal(role.kind, 'session');
  for (const text of ['Reads before judging.', 'Plain.', 'Seek contrary sources.', 'editor', 'no incumbency enacted']) assert.ok(role.disposition.includes(text));
  assert.equal(p.changes.some(c => c.outputs.some(o => o.pool === 'incumbencies')), false);
});
test('provider endpoints remain physical carriers with no invented owner or grant', () => {
  const endpoint = { provider: 'provider', actor: 'urn:existing:provider', models: ['exact-model'],
    entitlement: { cashCost: 'zero', paidOverage: 'forbidden' }, 'capabilities-of': 'worker' };
  const [organ] = records(planAgencyCharacterNormalization({ declarations: [witness('provider-endpoint', {
    id: 'provider-endpoint', name: 'Provider', kind: 'harness', endpoint, harness: 'direct-endpoint:provider' })] }));
  assert.equal(organ.kind, 'inference-endpoint'); assert.deepEqual(organ.of, []); assert.deepEqual(organ.endpoint, endpoint);
});
test('constituted actor remains exact account while typed role links migrate', () => {
  const actor = 'actor:ExactExistingConstitution';
  const inputs = [witness('worker', { id: actor, name: 'Worker', kind: 'harness', harness: 'codex', host: 'machine',
    description: 'Investigates source.', genesis: { row: { e: actor } } }),
    witness('seat', { id: 'seat', holder: actor, recognition: 't', induction: 't' }, 'incumbencies'),
    witness('hand', { id: 'hand', of: actor, account: 'password:ExactExistingPrincipal' }, 'organs')];
  const p = planAgencyCharacterNormalization({ declarations: inputs }), all = records(p);
  assert.equal(all.find(r => r.id === 'worker-identity').account, actor);
  assert.equal(all.find(r => r.id === 'worker-identity').constitution.row.e, actor);
  assert.equal(all.find(r => r.id === 'seat').holder, 'worker');
  assert.equal(all.find(r => r.id === 'seat').recognition, 't');
  assert.equal(all.find(r => r.id === 'hand').account, 'password:ExactExistingPrincipal');
  assert.equal(all.find(r => r.id === 'hand').of, 'worker');
});
test('reader mappings cannot invent role traits or redirect an incumbent beyond the witnessed bytes', () => {
 const role=witness('worker',{id:'actor:original',name:'Worker',kind:'harness',harness:'codex',description:'Original role.'});
 const seat=witness('seat',{id:'seat',holder:'actor:original',recognition:'t',induction:'t'},'incumbencies');
 assert.throws(()=>planAgencyCharacterNormalization({declarations:[{...role,authored:{...role.authored,description:'Invented role.'}}]}),/mapping differs from exact source bytes/);
 assert.throws(()=>planAgencyCharacterNormalization({declarations:[role,{...seat,authored:{...seat.authored,holder:'actor:other'}}]}),/mapping differs from exact source bytes/);
 const withoutCachedView={...role};delete withoutCachedView.authored;
 const plan=planAgencyCharacterNormalization({declarations:[withoutCachedView,seat]});
 assert.equal(records(plan).find(r=>r.id==='seat').holder,'worker');
 assert.ok(records(plan).find(r=>r.id==='worker').disposition.includes('Original role.'));
});
test('person distinction, original bytes and authored animation selection remain separate', () => {
  const p = planAgencyCharacterNormalization({ declarations: [witness('human', {
    name: 'Human', kind: 'person', disposition: 'Asks directly.', model: 'authored-old-selection', reasoningEffort: 'high' })] });
  const [role, organ] = records(p); assert.equal(role.kind, 'person'); assert.equal(role.model, undefined);
  assert.equal(organ.animation.model, 'authored-old-selection'); assert.ok(organ.animation.status.includes('no provider grant'));
  assert.ok(p.changes[0].sourceText.includes('authored-old-selection'));
});
test('shared plain account identities remain exact and do not select either role', () => {
  const inputs = ['worker-one', 'worker-two'].map(id => witness(id, { id: 'infograph-worker', name: id,
    kind: 'harness', harness: 'metroplat-agent-worker', description: 'Works through an allocated provider.' }));
  inputs.push(witness('hand', { id: 'hand', of: 'infograph-worker', account: 'password:unchanged' }, 'organs'));
  const p = planAgencyCharacterNormalization({ declarations: inputs });
  assert.deepEqual(p.sharedPhysicalAccounts, ['infograph-worker']);
  assert.equal(p.actorRoleReferences['infograph-worker'], undefined);
  assert.deepEqual(records(p).filter(r => r.kind === 'harness').map(r => r.account), ['infograph-worker', 'infograph-worker']);
  assert.equal(p.changes.some(c => c.from.includes('/organs/hand')), false);
});
test('canonical role planning preserves its exact bytes and provenance', () => {
  const input = witness('reader', { id: 'reader', name: 'Reader', kind: 'session', disposition: 'Reads carefully.',
    'x-provenance': { sourceNormalization: { source: 'original.md', sha256: 'original' } } });
  const p = planAgencyCharacterNormalization({ declarations: [input] });
  assert.equal(p.changes[0].outputs[0].text, input.sourceText);
});
test('journal placement uses upstream data law and retains knowledge as unknown', () => {
  const base = { characterSection: 'services/example-services-section', character: 'reader', bytes: 12, sha256: 'a'.repeat(64) };
  const result = planCharacterJournalPlacement({ resources: [
    { ...base, source: 'original-diary.md', resourcePath: 'prose/journals/diary/day.md' },
    { ...base, source: 'original-theory.md', resourcePath: 'code/structures/theory.md' },
  ] });
  assert.equal(result.changes.length, 1);
  assert.equal(result.changes[0].to, 'services/example-services-section/data/records/service-records/character-diary-service-records/reader/day.md');
  assert.deepEqual(result.retained, ['original-theory.md']);
});
test('whole-plan preflight, exact receiving and replay preserve unrelated resources', () => {
  const parent = path.resolve(import.meta.dirname, '../data/state/agency-character-normalization-test-state');
  mkdirSync(parent, { recursive: true }); const root = mkdtempSync(path.join(parent, 'receiving-'));
  try {
    const input = witness('reader', { id: 'reader', name: 'Reader', kind: 'agent', description: 'Reads carefully.' });
    const file = path.join(root, input.source); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, input.sourceText);
    const resource = path.join(path.dirname(file), 'reader/reference.txt'); mkdirSync(path.dirname(resource), { recursive: true }); writeFileSync(resource, 'Original resource.');
    const plan = planAgencyCharacterNormalization({ declarations: [input] });
    writeFileSync(file, input.sourceText + ' '); assert.throws(() => applyAgencyNormalization({ root, plan }), /source changed/);
    writeFileSync(file, input.sourceText); const received = applyAgencyNormalization({ root, plan });
    assert.equal(received.written, 1); assert.equal(received.appointmentsCreated, 0); assert.equal(received.grantsCreated, 0);
    assert.equal(applyAgencyNormalization({ root, plan }).written, 0);
    assert.equal(readFileSync(resource, 'utf8'), 'Original resource.');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('one skill output receives both original sources before retiring its procedure sidecar', () => {
  const parent = path.resolve(import.meta.dirname, '../data/state/agency-character-normalization-test-state');
  mkdirSync(parent, { recursive: true }); const root = mkdtempSync(path.join(parent, 'companion-'));
  try {
    const from = 'services/example-services-section/lib/agency/skills/research/SKILL.md';
    const side = from.replace('SKILL.md', 'skill.json');
    const old = '---\nname: research\n---\nRead source.\n', companion = '{"description":"Procedure contract"}\n';
    const next = '---\nname: research\nprocedure-description: Procedure contract\n---\nRead source.\n';
    const sha = text => createHash('sha256').update(text).digest('hex');
    mkdirSync(path.dirname(path.join(root, from)), { recursive: true });
    writeFileSync(path.join(root, from), old); writeFileSync(path.join(root, side), companion);
    const plan = { kind: 'agency-source-normalization-plan/v1', blockers: [], changes: [{
      from, sourceText: old, sha256: sha(old), inputs: [{ from: side, sourceText: companion, sha256: sha(companion) }],
      outputs: [{ path: from, text: next }],
    }] };
    writeFileSync(path.join(root, side), companion + ' ');
    assert.throws(() => applyAgencyNormalization({ root, plan }), /source changed/);
    assert.equal(readFileSync(path.join(root, from), 'utf8'), old);
    writeFileSync(path.join(root, side), companion);
    const receipt = applyAgencyNormalization({ root, plan }); assert.equal(receipt.sources, 2); assert.equal(receipt.retired, 1);
    assert.equal(readFileSync(path.join(root, from), 'utf8'), next);
    assert.equal(applyAgencyNormalization({ root, plan }).written, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
