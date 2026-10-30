/** Read the complete selected installed module family without executing it. */
import {existsSync,readFileSync,realpathSync,statSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readImports} from '@red-cup-engineering/javascript-computer/imports';
import {indexModuleCorpus} from '@red-cup-engineering/javascript-computer/module-corpus';
import {javascriptInstalledResolver} from '@red-cup-engineering/javascript-node-services-section/module-closure';

export function assessInstalledInterfaces({entries,namespaces}={}) {
  if(!Array.isArray(entries)||entries.length===0||entries.some(x=>typeof x!=='string')
    ||!Array.isArray(namespaces)||namespaces.length===0||namespaces.some(x=>typeof x!=='string'||!x))
    throw new TypeError('installed assessment requires explicit programmes and package namespaces');
  const findings=[],files=new Map(),edges=[],resolutions=new Map(),owners=new Map(),boundaries=new Set(),pending=[...entries];
  const resolveModule=javascriptInstalledResolver();let dynamic=0;
  const ownerOf=file=>{
    let dir=dirname(file);const seen=[];
    while(!owners.has(dir)){
      seen.push(dir);const p=join(dir,'package.json');
      if(existsSync(p)){owners.set(dir,JSON.parse(readFileSync(p,'utf8')));break;}
      const up=dirname(dir);if(up===dir)throw new TypeError('installed module has no package owner: '+file);dir=up;
    }
    const owner=owners.get(dir);for(const p of seen)owners.set(p,owner);return owner;
  };
  while(pending.length){
    const input=pending.pop();let file;
    try{file=realpathSync(resolve(input));if(!statSync(file).isFile())throw new TypeError('module is not a regular file');}
    catch(error){findings.push({kind:'missing-programme',file:input,reason:error.code??error.message});continue;}
    if(files.has(file)||boundaries.has(file))continue;
    const manifest=ownerOf(file);
    if(!namespaces.some(prefix=>manifest.name?.startsWith(prefix))||file.endsWith('.json')
      ||file.endsWith('.cjs')||file.endsWith('.js')&&manifest.type!=='module'){boundaries.add(file);continue;}
    const content=readFileSync(file,'utf8');let imports;
    try{imports=readImports(content);}catch(error){findings.push({kind:'unreadable-module',file,reason:error.message});continue;}
    files.set(file,{absolutePath:file,content,package:manifest.name,version:manifest.version,
      sha256:createHash('sha256').update(content).digest('hex')});
    for(const demand of imports){
      if(demand.specifier===undefined){dynamic++;continue;}
      let target;
      try{target=resolveModule(demand.specifier,file,'import');}
      catch(error){findings.push({kind:'unresolved-import',file,...demand,reason:error.message});continue;}
      if(target===null||target?.builtin)continue;
      if(!target?.file){findings.push({kind:'unresolved-import',file,...demand,reason:target?.external??'module unavailable'});continue;}
      let provider;
      try{provider=realpathSync(target.file);if(!statSync(provider).isFile())throw new TypeError('provider is not a regular file');}
      catch(error){findings.push({kind:'missing-provider',file,...demand,provider:target.file,reason:error.code??error.message});continue;}
      resolutions.set(file+'\0'+demand.specifier,provider);edges.push({file,provider,...demand});pending.push(provider);
    }
  }
  const corpus=indexModuleCorpus({files:[...files.values()],resolve:(specifier,file)=>resolutions.get(file+'\0'+specifier)});
  for(const edge of edges){
    if(!['named','default'].includes(edge.mode)||!files.has(edge.provider)||!corpus.modules.has(edge.provider))continue;
    if(corpus.exportedDeclarations(edge.provider,edge.name).length===0){
      // The corpus follows declarations inside its admitted set. An explicit
      // export can lawfully bind an imported JSON value or a vendor boundary.
      const explicit=corpus.modules.get(edge.provider).program.body.some(node=>
        node.type==='ExportNamedDeclaration'&&(node.specifiers??[]).some(s=>(s.exported.name??s.exported.value)===edge.name)
        ||node.type==='ExportDefaultDeclaration'&&edge.name==='default'
        ||node.type==='ExportAllDeclaration'&&node.exported&&(node.exported.name??node.exported.value)===edge.name);
      if(!explicit)findings.push({kind:'missing-export',...edge});
    }
  }
  return {kind:'node-runtime.installed-interfaces',status:findings.length?'refused':'admitted',
    entries:[...entries],modules:files.size,boundaries:boundaries.size,dynamicImports:dynamic,
    sources:[...files.values()].map(({content,...file})=>file),findings};
}
