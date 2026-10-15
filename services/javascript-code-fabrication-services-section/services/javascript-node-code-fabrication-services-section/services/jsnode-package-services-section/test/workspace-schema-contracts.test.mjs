import test from 'node:test';
import assert from 'node:assert/strict';
const root=new URL('../src/workspace/',import.meta.url);
const schemaModules={};
for(const name of ['admission','bins','exports','package-surface','publication-status']) schemaModules[name]=await import(new URL(`schemas/${name}.mjs`,root));
const {publicationStatusProofOf,publicationReleasePolicyOf,publicationArtifactTargetPathsOf}=await import(new URL('publication-status.mjs',root));
const {packageScriptCatalogOfPackageManifest}=await import(new URL('bins/script-catalog.mjs',root));
const admission={kind:'metroplat.admission.package-manifest',source:'package.json',manifest:{name:'@fixture/package',exports:{'.':'./src/index.mjs'},bin:{fixture:'./scripts/run.mjs'},files:['src','scripts']}};
const entry={kind:'metroplat.exports.entry',specifier:'.',mode:'material',import:'./src/index.mjs'};
const exports={kind:'metroplat.exports.surface',source:'package.json',packageName:'@fixture/package',entries:[entry]};
const binEntry={kind:'metroplat.bins.entry',command:'fixture',target:'./scripts/run.mjs',mode:'script'};
const bins={kind:'metroplat.bins.surface',source:'package.json',packageName:'@fixture/package',entries:[binEntry]};
const commitment={kind:'metroplat.package-surface.commitment',face:'export',name:'.',mode:'material',target:'./src/index.mjs'};
const surface={kind:'metroplat.package-surface',source:'package.json',packageName:'@fixture/package',exports,bins,commitments:[commitment]};
const target={kind:'metroplat.publication-status.artifact-target',face:'export',name:'.',obligation:'import',target:'./src/index.mjs',exists:true};
const proof={kind:'metroplat.publication-status.proof',source:'package.json',packageName:'@fixture/package',surface,targets:[target],missing:[],nonExecutableBins:[],ok:true};
const release={kind:'metroplat.publication-status.release-policy',source:'package.json',packageName:'@fixture/package',private:false,artifactProof:proof,includedFiles:['src'],scripts:[],localArtifactOk:true,npmPublishable:true,obligations:[],evidence:['package.json']};
const script={kind:'metroplat.bins.script-entry',name:'check',command:'node --check src/index.mjs'};
const catalog={kind:'metroplat.bins.script-catalog',source:'package.json',packageName:'@fixture/package',entries:[script]};
const cases=[
 ['admission','packageManifestAdmissionContract',admission],
 ['admission','admissionFailureContract',{kind:'metroplat.admission.failure',source:'package.json',reason:'missing name'}],
 ['admission','workspaceDeclarationAdmissionContract',{kind:'metroplat.admission.workspace-declaration',source:'pnpm-workspace.yaml',packages:['services/**']}],
 ['admission','pnpmLockfileAdmissionContract',{kind:'metroplat.admission.pnpm-lockfile',source:'pnpm-lock.yaml',lockfileVersion:'9.0',importers:[{path:'.',dependencies:[{name:'@fixture/package',field:'dependencies',specifier:'workspace:*',version:'link:services/package',workspaceLink:true}]}]}],
 ['bins','binSurfaceEntryContract',binEntry],['bins','binSurfaceContract',bins],['bins','packageScriptCatalogEntryContract',script],['bins','packageScriptCatalogContract',catalog],
 ['exports','exportSurfaceEntryContract',entry],['exports','exportSurfaceContract',exports],
 ['package-surface','packageSurfaceCommitmentContract',commitment],['package-surface','packageSurfaceContract',surface],
 ['publication-status','publicationArtifactTargetContract',target],['publication-status','publicationStatusProofContract',proof],['publication-status','publicationReleasePolicyContract',release],
];
for(const [module,name,value] of cases) test(`${name}: genuine provider accepts valid value and refuses required/type/extra violations`,()=>{
 const c=schemaModules[module][name];assert.equal(c.validate(value),true);assert.strictEqual(c.assert(value),value);
 assert.equal(c.validate({...value,kind:'not-this-kind'}),false);assert.throws(()=>c.assert({...value,kind:'not-this-kind'}),TypeError);
 assert.equal(c.validate({...value,uncontracted:true}),false);
 for(const field of c.schema.required) { const bad=structuredClone(value);delete bad[field];assert.equal(c.validate(bad),false,`${name}.${field} is required`); }
});
test('nested explicit and relative references reject malformed child values',()=>{
 for(const [module,name,value,mutate] of [
  ['bins','binSurfaceContract',bins,v=>v.entries[0].mode='invalid'],
  ['bins','packageScriptCatalogContract',catalog,v=>v.entries[0].command=''],
  ['exports','exportSurfaceContract',exports,v=>v.entries[0].specifier=''],
  ['package-surface','packageSurfaceContract',surface,v=>v.exports.entries[0].mode='invalid'],
  ['package-surface','packageSurfaceContract',surface,v=>v.bins.entries[0].target=''],
  ['package-surface','packageSurfaceContract',surface,v=>v.commitments[0].face='invalid'],
  ['publication-status','publicationStatusProofContract',proof,v=>v.surface.bins.entries[0].target=''],
  ['publication-status','publicationStatusProofContract',proof,v=>v.targets[0].exists='yes'],
  ['publication-status','publicationReleasePolicyContract',release,v=>v.artifactProof.surface.exports.entries[0].specifier=''],
 ]){const bad=structuredClone(value);mutate(bad);assert.equal(schemaModules[module][name].validate(bad),false,name);}
});
test('actual script-catalog consumer carries admitted script names without running commands',()=>{
 assert.deepEqual(packageScriptCatalogOfPackageManifest({...admission,manifest:{...admission.manifest,scripts:{check:script.command,empty:'',bad:4}}}),catalog);
});
test('actual publication consumer receives source-only package without mandatory build script',()=>{
 const facts=[{target:'./src/index.mjs',exists:true},{target:'./scripts/run.mjs',exists:true,executable:true}];
 const received=publicationStatusProofOf(surface,facts);assert.equal(received.ok,true);
 assert.deepEqual(publicationArtifactTargetPathsOf(surface),['./scripts/run.mjs','./src/index.mjs']);
 const policy=publicationReleasePolicyOf(admission,received);assert.equal(policy.localArtifactOk,true);assert.equal(policy.npmPublishable,true);assert.deepEqual(policy.scripts,[]);
});
test('actual publication consumer retains missing, nonexecutable, private, exclusion and TS boundaries',()=>{
 const complete=publicationStatusProofOf(surface,[{target:'./src/index.mjs',exists:true},{target:'./scripts/run.mjs',exists:true,executable:true}]);
 const missing=publicationStatusProofOf(surface,[]);assert.equal(missing.ok,false);assert.equal(publicationReleasePolicyOf(admission,missing).localArtifactOk,false);
 const nonexec=publicationStatusProofOf(surface,[{target:'./src/index.mjs',exists:true},{target:'./scripts/run.mjs',exists:true}]);assert.equal(nonexec.ok,false);assert.deepEqual(nonexec.nonExecutableBins,['./scripts/run.mjs']);
 assert.equal(publicationReleasePolicyOf({...admission,manifest:{...admission.manifest,private:true}},complete).npmPublishable,false);
 assert.equal(publicationReleasePolicyOf({...admission,manifest:{...admission.manifest,files:[]}},complete).localArtifactOk,false);
 const tsSurface=structuredClone(surface);tsSurface.exports.entries[0].import='./src/index.ts';
 const tsProof=publicationStatusProofOf(tsSurface,[{target:'./src/index.ts',exists:true},{target:'./scripts/run.mjs',exists:true,executable:true}]);assert.equal(publicationReleasePolicyOf(admission,tsProof).localArtifactOk,false);
 assert.throws(()=>publicationReleasePolicyOf({...admission,manifest:{name:'other'}},complete),/names differ/);
});
