import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {materializeNativeCodeProgramme} from '../src/materialize-native-code-programme.mjs';

const provider = process.env.NATIVE_CODE_PROVIDER_ROOT;
if (!provider) throw Error('native receiving requires its explicit registered provider root');
const tarPackage = provider + '/node_modules/.pnpm/tar@7.5.22/node_modules/tar';
const tarModule = tarPackage + '/dist/esm/index.js';
const tar = await import(tarModule);
const parserModule = provider + '/node_modules/.pnpm/@red-cup-engineering+javascript-parser-service@0.1.0/node_modules/@red-cup-engineering/javascript-parser-service/src/javascript-parser.mjs';
const policyModule = provider + '/node_modules/.pnpm/@red-cup-engineering+npm-workspace-publication-service@0.16.1-dev.0/node_modules/@red-cup-engineering/npm-workspace-publication-service/src/dependency-policy.mjs';

async function fixture(t) {
 const root = await fs.mkdtemp(path.join(os.tmpdir(),'native-code-fixture-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const archives = [], sources = [];
 for (const version of ['1.0.0','2.0.0']) {
  const source = path.join(root,version); await fs.mkdir(path.join(source,'scripts'),{recursive:true});
  await fs.writeFile(path.join(source,'package.json'),JSON.stringify({name:'@fixture/main',version,type:'module',gitHead:'a'.repeat(40)}));
  await fs.writeFile(path.join(source,'scripts/run.mjs'),"throw Error('application must not execute during construction');\n");
  const archive=path.join(root,version+'.tgz');
  await tar.c({cwd:source,file:archive,gzip:true,prefix:'package'},['package.json','scripts']);
  const bytes=await fs.readFile(archive);
  archives.push({name:'@fixture/main',version,archive,integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64')});
  sources.push(source);
 }
 return {root,input:{version:1,source:sources[1],entry:'scripts/run.mjs',nodeProgram:process.execPath,
  parserModule,policyModule,tarModule,output:path.join(root,'product'),
  bill:{kind:'native-code-provider-bill/v1',
   package:{name:'@fixture/main',version:'2.0.0',sourceCommit:'a'.repeat(40),integrity:archives[1].integrity},
   archives,edges:[],providerInputs:[provider],
   archiveExtractor:{name:'tar',version:'7.5.22',root:provider,package:tarPackage,module:tarModule}
  }}};
}
test('actual archive construction selects the requested root despite older same-name archive first',async t=>{
 const {input}=await fixture(t);const received=await materializeNativeCodeProgramme(input);
 assert.equal(received.applicationExecuted,false);
 const exposed=JSON.parse(await fs.readFile(path.join(input.output,'node_modules/@fixture/main/package.json'),'utf8'));
 assert.equal(exposed.version,'2.0.0');
 assert.equal(received.entry,'node_modules/@fixture/main/scripts/run.mjs');
 assert.equal(received.staticImports.modules,1);
});
test('changed archived bytes refuse at actual native extraction',async t=>{
 const {input}=await fixture(t);
 await fs.appendFile(input.bill.archives[0].archive,'changed');
 await assert.rejects(materializeNativeCodeProgramme(input),/archive integrity differs/);
});
test('authored source differing from the exact archived root refuses before product receiving',async t=>{
 const {input}=await fixture(t);
 await fs.writeFile(path.join(input.source,'scripts/run.mjs'),'export const substituted=true;\n');
 await assert.rejects(materializeNativeCodeProgramme(input),/authored source differs/);
 await assert.rejects(fs.stat(path.join(input.output,'native-code-receiving.json')),e=>e.code==='ENOENT');
});

