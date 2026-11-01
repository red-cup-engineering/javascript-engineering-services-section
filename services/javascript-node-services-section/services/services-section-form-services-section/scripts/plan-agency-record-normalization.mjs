/** Source-bound normalization of the shared agency carriers. Character semantics
 * are supplied by the Character converter; this operation handles other pools. */
import {createHash} from 'node:crypto';
import {agencyRecordSource}from'../src/agency-layout.mjs';
import {encodeYaml} from '@red-cup-engineering/yaml-frontmatter-codec-service';
import {readAgencySourceDeclaration,relocateAgencySourceLinks} from '../src/agency-source-declaration.mjs';
import {isDeepStrictEqual} from 'node:util';

const hash = value => createHash('sha256').update(value).digest('hex');
const slug = value => typeof value === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
const strings = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
const json = value => JSON.stringify(value,null,2)+'\n';

function sourceRecord(d) {
  return readAgencySourceDeclaration(d);
}

export function planAgencyRecordNormalization({declarations}) {
  if (!Array.isArray(declarations)) throw new TypeError('Original declaration inventory required');
  const explicitWorks = new Map(declarations.filter(d=>d.pool==='works'&&slug(d.id)).map(d=>[agencyRecordSource('works',d.id,d.section),sourceRecord(d)]));
  const changes = [], blockers = [];
  for (const d of declarations) {
    if (d.pool === 'characters') continue;
    let pool = d.pool === '@direct-skills' ? 'skills' : d.pool;
    try {
      const raw = sourceRecord(d);
      if (['skills','masks'].includes(pool) && raw['instance-of'] === 'agent-role' && raw.role === true) pool='forms';
      let id = slug(raw.id) ? raw.id : d.id;
      if (!slug(id) && pool === 'incumbencies' && typeof id === 'string' && /^[a-z0-9.-]+$/u.test(id)) id=id.replace(/\./gu,'-');
      if (!slug(id)) throw new TypeError('Source has no canonical record identifier');
      if (raw.id !== undefined && raw.id !== id && pool !== 'incumbencies') throw new TypeError('Identifier needs a typed semantic migration');
      const record = {...raw,id,name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : typeof raw.title === 'string' && raw.title.trim() ? raw.title : id};
      if (raw.id !== undefined && raw.id !== id) record['x-provenance']={...raw['x-provenance'],sourceNormalization:{source:d.source,sha256:d.sha256,originalIdentifier:raw.id}};
      if (pool === 'forms' && raw['instance-of'] === 'agent-role') {record.kind='agent-role-form';delete record['worn-by'];}
      const inputs = [];
      if (pool === 'skills') {
        record.body = typeof raw.body === 'string' ? raw.body : typeof raw.method === 'string' ? raw.method : '';
        if (typeof raw.body === 'string' && raw.body.trim() && typeof raw.method === 'string' && raw.method.trim() && raw.body !== raw.method) record.body='Authored method:\n'+raw.method+'\n\n'+raw.body;
        delete record.method;
        if (!record.body.trim() && typeof raw.script === 'string' && raw.script.trim()) {
          record.body = '# '+record.name+'\n\n'+(raw.description ?? '')+'\n\nAuthored executable: `'+raw.script+'`.\n'
            + ['input-shape','output-shape','preconditions','postconditions','witness'].filter(k=>raw[k]!==undefined)
              .map(k=>'\n'+k+':\n'+(typeof raw[k]==='string'?raw[k]:JSON.stringify(raw[k],null,2))+'\n').join('');
        }
        if (!record.body.trim()) throw new TypeError('Skill has no source-authored method');
        if (record['skill-closure-kind'] !== undefined && raw['closure-kind'] !== undefined && record['skill-closure-kind'] !== raw['closure-kind']) throw new TypeError('Skill closure declarations conflict');
        if (record['skill-closure-kind'] === undefined && raw['closure-kind'] !== undefined) record['skill-closure-kind'] = raw['closure-kind'];
        delete record['closure-kind'];
        record['requires-capabilities'] = strings(raw['requires-capabilities']);
        if (record['requires-capabilities'].some(x=>typeof x!=='string'||!x.trim())) throw new TypeError('Skill has invalid operation requirements');
        if (d.sidecar) {
          const s = d.sidecar;
          if (typeof s.sourceText !== 'string' || hash(s.sourceText)!==s.sha256) throw new TypeError('Exact skill companion bytes required');
          const contract = JSON.parse(s.sourceText);
          if (record['procedure-contract'] !== undefined && JSON.stringify(record['procedure-contract']) !== JSON.stringify(contract)) throw new TypeError('Skill already has a different procedure contract');
          record['procedure-contract'] = contract;
          if (record['skill-closure-kind'] === undefined && contract['closure-kind'] !== undefined) record['skill-closure-kind']=contract['closure-kind'];
          inputs.push({from:s.source,sha256:s.sha256,sourceText:s.sourceText});
        }
      }
      // Normalize the source's reference carriers once. No reader aliases are needed.
      if (pool === 'incumbencies' && record.incumbent !== undefined) {
        if (record.holder !== undefined && record.holder !== record.incumbent) throw new TypeError('Incumbency holders conflict');
        record.holder=record.incumbent; delete record.incumbent;
      }
      if (pool === 'offices' && record.duties !== undefined) {
        record['bears-duty']=[...new Set([...strings(record['bears-duty']),...strings(record.duties)])]; delete record.duties;
      }
      if (pool === 'masks') { record.kind ??= raw['instance-of'] === 'agent-role' ? 'role' : 'persona'; record['worn-by']=strings(record['worn-by']); }
      if (pool === 'organs') record.of=strings(record.of);
      const outputs=[];
      if (pool==='duties' && slug(record.work) && record.from!==undefined && record.to!==undefined
        && explicitWorks.has(agencyRecordSource('works',record.work,d.section))) {
        const closureFields=['from','to','cost','otherwise','receiver-condition','needs','required-capabilities','allowed-effects'];
        const existingPath=agencyRecordSource('works',record.work,d.section),existingWork=explicitWorks.get(existingPath);
        const equivalent=closureFields.filter(field=>Object.hasOwn(record,field)).every(field=>isDeepStrictEqual(record[field],existingWork[field]));
        if(equivalent){
          for(const field of closureFields)delete record[field];
        }else{
        const workPath=agencyRecordSource('works',id,d.section);
        if(explicitWorks.has(workPath)) throw new TypeError('Specific duty closure destination is already authored');
        const work={id,name:record.name};
        for(const field of closureFields) if(Object.hasOwn(record,field)){work[field]=record[field];delete record[field];}
        if(work.cost===undefined) throw new TypeError('A separated work closure requires its authored cost');
        work['x-provenance']={...record['x-provenance'],sourceNormalization:{source:d.source,sha256:d.sha256,originalWork:record.work}};
        outputs.push({path:workPath,text:json(work),pool:'works',id});
        record.work=id;
        }
      }
      const target=agencyRecordSource(pool,id,d.section);
      let text;
      if (pool === 'skills') {
        const {body,...front}=record;
        text='---\n'+encodeYaml(front)+'\n---\n'+body;
      } else text=json(record);
      outputs.unshift({path:target,text,pool,id});
      if (target !== d.source || text !== d.sourceText || inputs.length || outputs.length>1) changes.push({from:d.source,sha256:d.sha256,sourceText:d.sourceText,inputs,outputs});
    } catch(error) {blockers.push({source:d.source,reason:error.message});}
  }
  const destinations=new Set();
  for(const change of changes)for(const output of change.outputs){
    if(destinations.has(output.path))blockers.push({source:change.from,reason:'Duplicate normalized destination '+output.path});
    destinations.add(output.path);
  }
  return {kind:'agency-source-normalization-plan/v1',changes:relocateAgencySourceLinks(changes),blockers,preservation:'Original source and companion bytes are bound by hash; methods, structured contracts and owned resources retain their contents. No appointment or capability grant is created.'};
}
