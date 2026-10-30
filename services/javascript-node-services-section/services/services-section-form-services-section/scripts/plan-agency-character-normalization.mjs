import { createHash } from 'node:crypto';
import { dataKindDirectory } from '@red-cup-engineering/eavt-services-section/data-artifact-address';
import { agencyRecordSource } from '../src/agency-layout.mjs';
import { readAgencySourceDeclaration,relocateAgencySourceLinks } from '../src/agency-source-declaration.mjs';

const hash = text => createHash('sha256').update(text).digest('hex');
const json = record => JSON.stringify(record, null, 2) + '\n';
const physicalFields = new Set(['endpoint', 'harness', 'host', 'genesis', 'activityPub', 'model', 'reasoningEffort']);
const identityFields = new Set(['id', 'name', 'kind', 'disposition', 'x-provenance']);
const slug = value => String(value).toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
const printable = value => typeof value === 'string' ? value : JSON.stringify(value, null, 2);
const roleReferenceFields = Object.freeze({ incumbencies: ['holder'], organs: ['of'], masks: ['worn-by'] });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const actorIdentifier = value => typeof value === 'string' && /^[a-z][a-z0-9+.-]*:/iu.test(value);

/**
 * Normalize source-declared Character DATA, never an appointment or provider grant.
 *
 * Input records are the original reader's witnessed declarations, each carrying
 * source, sha256, authored, and exact sourceText. A source descriptor also names
 * its section and original pool/id. An endpoint is a physical organ, not a role.
 * Source actor identities remain exact organ accounts; only typed role-reference
 * fields are redirected to the role. Historical events are outside this input.
 */
export function planAgencyCharacterNormalization({ declarations }) {
  if (!Array.isArray(declarations)) throw new TypeError('Original declaration inventory required');
  declarations = declarations.map(d => d.pool === 'characters' || roleReferenceFields[d.pool]
    ? { ...d, authored: readAgencySourceDeclaration(d) } : d);
  const candidates = declarations.filter(d => d.pool === 'characters');
  const roleIds = new Map(), sharedHands = new Set(), changes = [], blockers = [];
  for (const d of candidates) {
    if (typeof d.sourceText !== 'string' || hash(d.sourceText) !== d.sha256)
      throw new TypeError('Exact original Character bytes required: ' + d.source);
    if (!d.authored || typeof d.authored !== 'object' || Array.isArray(d.authored))
      throw new TypeError('Original Character mapping required: ' + d.source);
    if (!d.authored.endpoint && typeof d.authored.id === 'string' && d.authored.id !== slug(d.id)) {
      const prior = roleIds.get(d.authored.id);
      if (prior !== undefined && prior !== slug(d.id)) sharedHands.add(d.authored.id);
      else roleIds.set(d.authored.id, slug(d.id));
    }
  }
  for (const id of sharedHands) roleIds.delete(id);
  const rewrite = value => typeof value === 'string' ? roleIds.get(value) ?? value
    : Array.isArray(value) ? value.map(rewrite) : value;
  for (const d of candidates) {
    const raw = d.authored, id = slug(d.id);
    if (!id) { blockers.push({ source: d.source, reason: 'No canonical role identifier' }); continue; }
    const witness = { source: d.source, sha256: d.sha256,
      originalKind: raw.kind ?? null, originalIdentifier: raw.id ?? d.id };
    const provenance = { ...(raw['x-provenance'] ?? {}), sourceNormalization: witness };
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name : d.id;
    const outputs = [];
    if (raw.id === id && ['person', 'session'].includes(raw.kind)
      && typeof raw.name === 'string' && raw.name.trim()
      && typeof raw.disposition === 'string' && raw.disposition.trim()
      && Object.keys(raw).every(key => identityFields.has(key))) {
      changes.push({ from: d.source, sha256: d.sha256, sourceText: d.sourceText,
        outputs: [{ path: agencyRecordSource('characters', id, d.section), text: d.sourceText, pool: 'characters', id }] });
      continue;
    }
    if (raw.endpoint !== undefined) {
      const record = { id, name, kind: 'inference-endpoint', of: [],
        platform: raw.endpoint.provider, endpoint: structuredClone(raw.endpoint),
        ...(raw.harness === undefined ? {} : { harness: raw.harness }),
        ...(raw.host === undefined ? {} : { host: raw.host }),
        ...(raw.description === undefined ? {} : { description: raw.description }),
        ...(raw.provenance === undefined ? {} : { provenance: raw.provenance }),
        'x-provenance': provenance };
      const retained = new Set(['id', 'name', 'kind', 'endpoint', 'harness', 'host', 'description', 'provenance', 'x-provenance']);
      const extra = Object.keys(raw).filter(key => !retained.has(key));
      if (extra.length) { blockers.push({ source: d.source, reason: 'Unplaced endpoint fields', fields: extra }); continue; }
      outputs.push({ path: agencyRecordSource('organs', id, d.section), text: json(record), pool: 'organs', id });
    } else {
      const sections = [];
      if (typeof raw.disposition === 'string' && raw.disposition.trim()) sections.push(raw.disposition);
      for (const [field, value] of Object.entries(raw)) {
        if (identityFields.has(field) || physicalFields.has(field)) continue;
        const label = ['office', 'holds-office', 'holds-offices', 'reports-to', 'editor-in-chief'].includes(field)
          ? 'Authored ' + field + ' claim (source assertion; no incumbency enacted)'
          : 'Authored ' + field;
        if (value !== undefined && printable(value).trim()) sections.push(label + ':\n' + printable(value));
      }
      if (sections.length === 0) { blockers.push({ source: d.source, reason: 'No authored disposition or role text' }); continue; }
      // The original categorical distinction is preserved: explicit person
      // source remains person. Retired agent/harness/session-character tokens
      // and the old AI-role Markdown roster denote session roles, never humans.
      const kind = raw.kind === 'person' ? 'person' : 'session';
      const record = { id, name, kind, disposition: sections.join('\n\n'), 'x-provenance': provenance };
      outputs.push({ path: agencyRecordSource('characters', id, d.section), text: json(record), pool: 'characters', id });
      const actor = actorIdentifier(raw.id) || (typeof raw.id === 'string' && raw.id !== id && raw.harness !== undefined);
      const animation = Object.fromEntries(['model', 'reasoningEffort'].filter(k => raw[k] !== undefined).map(k => [k, raw[k]]));
      if (actor || raw.harness !== undefined || raw.host !== undefined || raw.activityPub !== undefined || Object.keys(animation).length) {
        const organ = { id: id + '-identity', name: name + ' — physical carrier',
          kind: raw.harness !== undefined ? 'harness' : Object.keys(animation).length ? 'animation-selection' : 'account',
          of: [id],
          ...((actor || raw.harness !== undefined || raw.host !== undefined || raw.activityPub !== undefined)
            ? {account: raw.id ?? d.id} : {}),
          ...(raw.harness === undefined ? {} : { platform: raw.harness }),
          ...(raw.host === undefined ? {} : { host: raw.host }),
          ...(raw.genesis === undefined ? {} : { constitution: structuredClone(raw.genesis) }),
          ...(raw.activityPub === undefined ? {} : { activityPub: structuredClone(raw.activityPub) }),
          ...(Object.keys(animation).length ? { animation: { ...animation, status: 'authored selection; no provider grant asserted' } } : {}),
          'x-provenance': provenance };
        outputs.push({ path: agencyRecordSource('organs', organ.id, d.section), text: json(organ), pool: 'organs', id: organ.id });
      }
    }
    changes.push({ from: d.source, sha256: d.sha256, sourceText: d.sourceText, outputs });
  }
  for (const d of declarations) {
    const fields = roleReferenceFields[d.pool];
    if (!fields || !d.authored || typeof d.sourceText !== 'string') continue;
    const next = structuredClone(d.authored), changed = [];
    for (const field of fields) if (Object.hasOwn(next, field)) {
      const value = rewrite(next[field]);
      if (!same(value, next[field])) { next[field] = value; changed.push(field); }
    }
    if (changed.length) {
      if (hash(d.sourceText) !== d.sha256 || !d.source.endsWith('.json'))
        throw new TypeError('Exact JSON role reference source required: ' + d.source);
      changes.push({ from: d.source, sha256: d.sha256, sourceText: d.sourceText,
        roleReferenceFields: changed, outputs: [{ path: d.source, text: json(next), pool: d.pool, id: d.id }] });
    }
  }
  const destinations = new Set();
  for (const change of changes) for (const output of change.outputs) {
    if (destinations.has(output.path)) throw new TypeError('Normalization destination collision: ' + output.path);
    destinations.add(output.path);
  }
  return { kind: 'agency-source-normalization-plan/v1', changes:relocateAgencySourceLinks(changes), blockers,
    actorRoleReferences: Object.fromEntries(roleIds),
    sharedPhysicalAccounts: [...sharedHands],
    preservation: 'Every original byte remains in the plan; authored traits remain labelled in disposition; physical carriers retain exact endpoint, actor and animation data. No incumbency or grant is created.' };
}

/** Original typed journal families only; an unknown resource never becomes a journal. */
export function planCharacterJournalPlacement({ resources }) {
  if (!Array.isArray(resources)) throw new TypeError('Exact Character resource inventory required');
  const changes = [], retained = [];
  for (const resource of resources) {
    const match = /^prose\/journals\/(diary|memory)\/(.+)$/u.exec(resource.resourcePath);
    if (!match) { retained.push(resource.source); continue; }
    const suffix = match[2];
    if (suffix.split('/').some(part => !part || part === '.' || part === '..')
      || !/^[a-f0-9]{64}$/u.test(resource.sha256)) throw new TypeError('Exact confined journal source required');
    const directory = dataKindDirectory(resource.characterSection, 'record', 'character-' + match[1]);
    changes.push({ from: resource.source, to: directory + '/' + resource.character + '/' + suffix,
      sha256: resource.sha256, bytes: resource.bytes, rule: 'original-character-journal-family' });
  }
  return { kind: 'agency-character-journal-placement/v1', changes, retained,
    custody: 'Original section; source diary and memory records, never observed service logs. Unknown knowledge and methods remain explicit retained resources.' };
}
