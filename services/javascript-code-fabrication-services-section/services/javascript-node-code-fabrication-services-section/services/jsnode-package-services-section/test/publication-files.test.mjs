import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationFilesExclusionsOf} from '../src/workspace/publication-files.mjs';

// Received independently against npm 11.9.0 pack --dry-run --ignore-scripts
// --offline, using real files for every target. These cases test declaration
// inclusion only; .npmignore and actual packed-file presence remain receiving.
const targets=['package.json','README.md','LICENSE','index.js','entry.mjs','bin/tool.mjs','src/kept.mjs','src/internal/hidden.mjs','dist/result.json','other.txt'];
test('an omitted files field states no explicit exclusion',()=>{
  assert.deepEqual(publicationFilesExclusionsOf({},targets),[]);
});
test('an implicit Node index.js entrance is not automatic npm inclusion',()=>{
  assert.deepEqual(publicationFilesExclusionsOf({files:[]},targets),[
    'bin/tool.mjs','dist/result.json','entry.mjs','index.js','other.txt','src/internal/hidden.mjs','src/kept.mjs',
  ]);
});
test('only explicit main and bin join mandatory package metadata',()=>{
  assert.deepEqual(publicationFilesExclusionsOf({files:[],main:'entry.mjs',bin:{fixture:'bin/tool.mjs'}},targets),[
    'dist/result.json','index.js','other.txt','src/internal/hidden.mjs','src/kept.mjs',
  ]);
  assert.deepEqual(publicationFilesExclusionsOf({files:[],main:'index.js'},['index.js']),[]);
  assert.deepEqual(publicationFilesExclusionsOf({files:[],bin:'bin/tool.mjs'},['bin/tool.mjs']),[]);
});
test('directory, glob and normalized directory allowlists preserve actual exclusions',()=>{
  const excluded=['bin/tool.mjs','dist/result.json','entry.mjs','index.js','other.txt'];
  for(const files of [['src'],['src/**/*.mjs'],['./src/']])
    assert.deepEqual(publicationFilesExclusionsOf({files},targets),excluded);
});
test('negative directory declaration excludes its nested files',()=>{
  assert.deepEqual(publicationFilesExclusionsOf({files:['src','!src/internal']},targets),[
    'bin/tool.mjs','dist/result.json','entry.mjs','index.js','other.txt','src/internal/hidden.mjs',
  ]);
});
test('invalid declarations refuse and wildcard materialization stays unclaimed',()=>{
  assert.throws(()=>publicationFilesExclusionsOf({files:'src'},['src/a.mjs']),/array/);
  assert.throws(()=>publicationFilesExclusionsOf({files:['src']},['']),/nonempty/);
  assert.deepEqual(publicationFilesExclusionsOf({files:[]},['dist/*.json']),[]);
});
