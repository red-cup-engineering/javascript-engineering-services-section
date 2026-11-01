import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash}from'node:crypto';
import fs from'node:fs';import path from'node:path';
import {decodeYaml}from'@red-cup-engineering/yaml-frontmatter-codec-service';
import {planAgencyRecordNormalization}from'../scripts/plan-agency-record-normalization.mjs';
import {applyAgencyNormalization}from'../scripts/apply-agency-normalization.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const declaration=(pool,id,text,extra={})=>({section:'services/test-services-section',pool,id,source:'services/test-services-section/lib/agency/'+pool+'/'+id+'.json',sourceText:text,sha256:sha(text),...extra});
const front=text=>decodeYaml(/^---\n([\s\S]*?)\n---\n/u.exec(text)[1]);

test('two sections receive the same skill carrier without losing executable method or contract',()=>{
 const source=JSON.stringify({id:'receive',name:'Receive',method:'Run the original receiver.', 'requires-capabilities':['read']});
 const a=declaration('skills','receive',source), b={...a,section:'services/other-services-section',source:'services/other-services-section/lib/agency/skills/receive.json'};
 const p=planAgencyRecordNormalization({declarations:[a,b]});assert.deepEqual(p.blockers,[]);
 assert.equal(p.changes.length,2);
 for(const c of p.changes){assert.ok(c.outputs[0].path.endsWith('/skills/receive/SKILL.md'));assert.equal(front(c.outputs[0].text).id,'receive');assert.ok(c.outputs[0].text.endsWith('Run the original receiver.'));}
});

test('a colon-bearing malformed description is repaired by the shared codec, preserving its words and method',()=>{
 const text='---\nname: inspect\ndescription: Inspect a thing: retain its exact source.\n---\n\nInspect through its source owner.\n';
 const d=declaration('skills','inspect',text,{source:'services/test-services-section/lib/agency/skills/inspect/SKILL.md'});
 const p=planAgencyRecordNormalization({declarations:[d]});assert.deepEqual(p.blockers,[]);
 assert.equal(front(p.changes[0].outputs[0].text).description,'Inspect a thing: retain its exact source.');
 assert.ok(p.changes[0].outputs[0].text.endsWith('\nInspect through its source owner.\n'));
});

test('a role declaration remains a role rather than colliding with the research skill',()=>{
 const text='---\ntitle: Research\nrole: true\ninstance-of: agent-role\n---\nThe research role.\n';
 const d=declaration('skills','research',text,{source:'services/test-services-section/lib/agency/skills/research.md'});
 const p=planAgencyRecordNormalization({declarations:[d]});assert.deepEqual(p.blockers,[]);
 const o=p.changes[0].outputs[0];assert.ok(o.path.endsWith('/forms/research.json'));
 assert.equal(JSON.parse(o.text).kind,'agent-role-form');assert.equal(JSON.parse(o.text)['worn-by'],undefined);
});

test('a supplied reader mapping cannot alter authority beyond its hash-bound declaration',()=>{
 const text=JSON.stringify({id:'reader',name:'Reader','deontic-profile':{read:'liberty'}});
 const input=declaration('offices','reader',text,{authored:{id:'reader',name:'Reader','deontic-profile':{write:'deontic-power'}}});
 const p=planAgencyRecordNormalization({declarations:[input]});
 assert.equal(p.changes.length,0);assert.equal(p.blockers.length,1);
 assert.match(p.blockers[0].reason,/mapping differs from exact source bytes/);
 const genuine=planAgencyRecordNormalization({declarations:[{...input,authored:JSON.parse(text)}]});
 assert.deepEqual(genuine.blockers,[]);
});

test('the existing generic writer receives primary and companion, refuses stale input, and reenters without writes',t=>{
 const parent=path.resolve(import.meta.dirname,'../data/state/agency-record-normalization-test-state');fs.mkdirSync(parent,{recursive:true});const root=fs.mkdtempSync(path.join(parent,'case-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const text='---\nname: receive\ndescription: Method summary.\n---\nRun the receiver.\n', contract=JSON.stringify({type:'skill',name:'receive',description:'Separate procedure summary.','closure-kind':'procedure'});
 const d=declaration('skills','receive',text,{source:'services/test-services-section/lib/agency/skills/receive/SKILL.md',sidecar:{source:'services/test-services-section/lib/agency/skills/receive/skill.json',sourceText:contract,sha256:sha(contract)}});
 for(const [file,value]of[[d.source,text],[d.sidecar.source,contract]]){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),value);}
 const resource=path.join(root,'services/test-services-section/lib/agency/skills/receive/references/law.txt');fs.mkdirSync(path.dirname(resource),{recursive:true});fs.writeFileSync(resource,'original law');
 const p=planAgencyRecordNormalization({declarations:[d]});assert.deepEqual(p.blockers,[]);
 fs.writeFileSync(path.join(root,d.sidecar.source),'changed');assert.throws(()=>applyAgencyNormalization({root,plan:p}),/source changed/);assert.equal(fs.readFileSync(path.join(root,d.source),'utf8'),text);
 fs.writeFileSync(path.join(root,d.sidecar.source),contract);const r=applyAgencyNormalization({root,plan:p});assert.equal(r.retired,1);assert.equal(r.appointmentsCreated,0);assert.equal(r.grantsCreated,0);
 const received=front(fs.readFileSync(path.join(root,d.source),'utf8'));assert.equal(received.description,'Method summary.');assert.equal(received['procedure-contract'].description,'Separate procedure summary.');
 assert.equal(fs.readFileSync(resource,'utf8'),'original law');assert.equal(applyAgencyNormalization({root,plan:p}).written,0);
});


test('a conflicting duty closure becomes its specific Work without overwriting the broader authored Work',()=>{
 const witness=(pool,id,record)=>{const sourceText=JSON.stringify(record,null,2)+'\n';return{pool,id,section:'services/example-services-section',source:'services/example-services-section/lib/agency/'+pool+'/'+id+'.json',sourceText,sha256:createHash('sha256').update(sourceText).digest('hex')};};
 const broader=witness('works','maintain',{id:'maintain',name:'Maintain',from:'Requirement',to:'Received change',cost:'Existing owner'});
 const original={id:'inventory',name:'Inventory',authority:'operator',claim:'inspect',work:'maintain',from:'An unresolved resource',to:'Its exact source reading',cost:'One bounded read',otherwise:'Keep uncertainty', 'receiver-condition':'Original office can repeat it'};
 const duty=witness('duties','inventory',original);
 const plan=planAgencyRecordNormalization({declarations:[broader,duty]});assert.deepEqual(plan.blockers,[]);assert.equal(plan.changes.length,1);
 const outputs=plan.changes[0].outputs;assert.equal(outputs.length,2);
 const nextDuty=JSON.parse(outputs[0].text),work=JSON.parse(outputs[1].text);
 assert.equal(nextDuty.work,'inventory');assert.equal(nextDuty.authority,original.authority);assert.equal(nextDuty.claim,original.claim);assert.equal(Object.hasOwn(nextDuty,'from'),false);
 for(const field of ['from','to','cost','otherwise','receiver-condition'])assert.equal(work[field],original[field]);
 assert.equal(work['x-provenance'].sourceNormalization.originalWork,'maintain');assert.equal(work['x-provenance'].sourceNormalization.sha256,duty.sha256);
 assert.equal(plan.changes.some(change=>change.from===broader.source),false);
 const occupied=witness('works','inventory',{id:'inventory',name:'Unrelated',from:'X',to:'Y',cost:'Z'});
 assert.ok(planAgencyRecordNormalization({declarations:[broader,duty,occupied]}).blockers.some(b=>b.reason.includes('already authored')));
});


test('equal duty and Work closures have one source while conflicting occupied closures refuse',()=>{
 const work={id:'inspect',name:'Inspect work',from:'X',to:'Y',cost:'Z'};
 const w=declaration('works','inspect',JSON.stringify(work,null,2)+'\n');
 const d=declaration('duties','inspect',JSON.stringify({...work,name:'Inspection duty',work:'inspect',authority:'operator',claim:'inspect'}));
 const plan=planAgencyRecordNormalization({declarations:[d,w]});assert.deepEqual(plan.blockers,[]);
 const out=JSON.parse(plan.changes.find(c=>c.from===d.source).outputs[0].text);assert.equal(out.work,'inspect');assert.equal(Object.hasOwn(out,'from'),false);
 const changed=declaration('duties','inspect',JSON.stringify({...work,to:'Different',work:'inspect',authority:'operator',claim:'inspect'}));
 assert.ok(planAgencyRecordNormalization({declarations:[changed,w]}).blockers.some(b=>b.reason.includes('already authored')));
});

test('source links follow canonical sibling declarations while literal code and original provenance retain their text',()=>{
 const source='---\nname: Explain\n---\nRead [the axiom](../axioms/claim.md#basis).\n\n`[literal](../axioms/claim.md)`\n\n```md\n[example](../axioms/claim.md)\n```\n';
 const skill=declaration('skills','explain',source);skill.source='services/test-services-section/lib/agency/skills/explain.md';
 const axiom=declaration('axioms','claim','---\ntitle: Claim\n---\nAn authored claim.\n');axiom.source='services/test-services-section/lib/agency/axioms/claim.md';
 const plan=planAgencyRecordNormalization({declarations:[skill,axiom]});assert.deepEqual(plan.blockers,[]);
 const method=plan.changes.find(c=>c.from===skill.source).outputs[0].text;
 assert.ok(method.includes('[the axiom](../../axioms/claim.json#basis)'));assert.ok(method.includes('`[literal](../axioms/claim.md)`'));assert.ok(method.includes('[example](../axioms/claim.md)'));
});
test('link relocation applies original source spans once when replacement targets collide',()=>{
 const source='---\nname: Read\n---\n[first](a.md) [second](../a.md)\n\n`[literal](a.md)`\n';
 const skill=declaration('skills','read',source);skill.source='services/test-services-section/lib/agency/skills/read.md';
 const plan=planAgencyRecordNormalization({declarations:[skill]});assert.deepEqual(plan.blockers,[]);
 const text=plan.changes[0].outputs[0].text;
 assert.ok(text.includes('[first](../a.md) [second](../../a.md)'));
 assert.ok(text.includes('`[literal](a.md)`'));
});
