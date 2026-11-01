import test from'node:test';import assert from'node:assert/strict';import{agencyPathReading,agencyRecordSource,agencySectionPools,agencySourceSections}from'../src/agency-layout.mjs';
import fs from'node:fs';import path from'node:path';
test('every section derives the same carrier patterns and rejects arbitrary paths',()=>{
 for(const section of ['services/one-services-section','services/two-services-section']){
  assert.equal(agencyRecordSource('characters','person',section),section+'/lib/agency/characters/person.json');
  assert.equal(agencyRecordSource('skills','read',section),section+'/lib/agency/skills/read/SKILL.md');
  assert.ok(agencySectionPools('/root',[section]).every(b=>b.dir==='/root/'+b.sourcePrefix));
 }
 for(const section of ['../escape','/absolute','services/../escape','services\\else'])assert.throws(()=>agencyRecordSource('characters','person',section));
});
test('declared character and skill resources are separate from the one live declaration',()=>{
 const result=agencyPathReading(['lib/agency/characters/person.json','lib/agency/characters/person/knowledge/term.md','lib/agency/skills/read/SKILL.md','lib/agency/skills/read/references/law.md']);
 assert.equal(result.records.length,2);assert.equal(result.resources.length,2);assert.deepEqual(result.obstructions,[]);
});
test('old flat skills, alternate Character declarations and procedure sidecars remain nonconformant',()=>{
 const result=agencyPathReading(['lib/agency/skills/read.json','lib/agency/skills/method/SKILL.md','lib/agency/skills/method/skill.json','lib/agency/characters/person/person.md']);
 assert.equal(result.obstructions.length,3);assert.equal(result.records.length,1);
});
test('source discovery follows only section edges and explicitly selected app owners',t=>{
 const state=path.resolve(import.meta.dirname,'../data/state/agency-layout-test-state');fs.mkdirSync(state,{recursive:true});const root=fs.mkdtempSync(path.join(state,'discovery-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const nested='services/one/services/two',app='apps/worker';
 for(const section of[nested,app,'data/records/snapshot/services/fake','services/one/src/fixture/services/fake','node_modules/dependency/services/fake'])fs.mkdirSync(path.join(root,section,'lib/agency'),{recursive:true});
 fs.symlinkSync(path.join(root,'data/records/snapshot/services/fake'),path.join(root,'services/linked'),'dir');
 assert.deepEqual(agencySourceSections(root),['','services/one',nested]);
 assert.deepEqual(agencySourceSections(root,{sourceRoots:[app]}),[app]);
 for(const section of['../escape','data/records/snapshot','node_modules/dependency','services/linked'])assert.throws(()=>agencySourceSections(root,{sourceRoots:[section]}));
});
test('every record pool may own resources only beside its canonical declaration',()=>{
 const result=agencyPathReading(['lib/agency/packets/company-formation.json','lib/agency/packets/company-formation/template.md','lib/agency/packets/unowned/template.md']);
 assert.deepEqual(result.records.map(r=>r.id),['company-formation']);
 assert.deepEqual(result.resources,['lib/agency/packets/company-formation/template.md']);
 assert.deepEqual(result.obstructions.map(r=>r.file),['lib/agency/packets/unowned/template.md']);
});
