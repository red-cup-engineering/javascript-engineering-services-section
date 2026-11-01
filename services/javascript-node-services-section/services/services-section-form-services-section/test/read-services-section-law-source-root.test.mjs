import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {findServicesSectionRepositoryRoot} from '../scripts/read-services-section-law.mjs';

test('a source context cannot borrow enclosing law across data while an inner materialized forest retains its own law',async t=>{
 const state=path.resolve(import.meta.dirname,'../data/state/section-law-source-root-test-state');fs.mkdirSync(state,{recursive:true});const outer=fs.mkdtempSync(path.join(state,'forest-'));t.after(()=>fs.rmSync(outer,{recursive:true,force:true}));
 fs.mkdirSync(path.join(outer,'services/internal-services-section'),{recursive:true});
 const source=path.join(outer,'services/source'),unqualified=path.join(outer,'data/state/unqualified'),inner=path.join(outer,'data/state/qualified'),leaf=path.join(inner,'services/child');
 for(const dir of[source,unqualified,path.join(inner,'services/internal-services-section'),leaf])fs.mkdirSync(dir,{recursive:true});
 assert.equal(await findServicesSectionRepositoryRoot(source),outer);
 assert.equal(await findServicesSectionRepositoryRoot(unqualified),null);
 assert.equal(await findServicesSectionRepositoryRoot(leaf),inner);
 const alias=path.join(outer,'selected-source');fs.symlinkSync(unqualified,alias,'dir');
 assert.equal(await findServicesSectionRepositoryRoot(alias),null);
 const innerAlias=path.join(outer,'selected-inner-source');fs.symlinkSync(inner,innerAlias,'dir');
 assert.equal(await findServicesSectionRepositoryRoot(path.join(innerAlias,'services/child')),inner);
});
