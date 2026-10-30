import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectInstalledInterfaceInput} from '../src/collect-installed-interface-input.mjs';
function fixture(t,patch={}) {
 const root=mkdtempSync(join(tmpdir(),'installed-input-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 mkdirSync(join(root,'jobs'));writeFileSync(join(root,'package.json'),'{}');
 writeFileSync(join(root,'jobs/example.json'),JSON.stringify({id:'example',summary:'Example',directory:'owner',node:['main.mjs'],finally:['checkpoint.mjs'],...patch}));
 return root;
}
test('composition retains application, absent job and unresolved declared roots',t=>{
 const runtimeRoot=fixture(t),app=join(runtimeRoot,'app.mjs');
 writeFileSync(join(runtimeRoot,'host.json'),JSON.stringify({nested:{module:'@fixture/absent'}}));
 const result=collectInstalledInterfaceInput({runtimeRoot,entries:[app,app],declarationFiles:['host.json'],jobsDirectories:['jobs']});
 assert.deepEqual(result.entries,[app,join(runtimeRoot,'owner/main.mjs'),join(runtimeRoot,'owner/checkpoint.mjs')]);
 assert.equal(result.findings.length,1);assert.equal(result.findings[0].kind,'unresolved-declared-provider');
});
test('composition refuses malformed declarations through the canonical job validator',t=>{
 const runtimeRoot=fixture(t,{node:[]});assert.throws(()=>collectInstalledInterfaceInput({runtimeRoot,jobsDirectories:['jobs']}),/needs node/);
});
test('caller declaration selection cannot escape the installed runtime',t=>{
 const runtimeRoot=fixture(t);assert.throws(()=>collectInstalledInterfaceInput({runtimeRoot,declarationFiles:['../outside.json']}),/escapes/);
});
