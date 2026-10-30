import {readFileSync,realpathSync} from 'node:fs';
import {isAbsolute,relative,resolve} from 'node:path';
import {javascriptInstalledResolver} from '@red-cup-engineering/javascript-node-services-section/module-closure';
import {nodeJobProgramEntries} from '@red-cup-engineering/node-job-service';

/** Collect caller-selected installed roots without running application or job programmes.
 * Job path and declaration policy belong exclusively to node-job-service. */
export function collectInstalledInterfaceInput({runtimeRoot,entries=[],declarationFiles=[],jobsDirectories=[]}={}) {
 if(typeof runtimeRoot!=='string'||!isAbsolute(runtimeRoot))throw new TypeError('absolute installed runtime required');
 const root=realpathSync(runtimeRoot),selected=new Set(),findings=[];
 const resolveModule=javascriptInstalledResolver();
 function owned(path) {
  if(typeof path!=='string'||!path||isAbsolute(path))throw new TypeError('declaration paths must be runtime-relative');
  const file=resolve(root,path),offset=relative(root,file);
  if(offset==='..'||offset.startsWith('../')||isAbsolute(offset))throw new TypeError('declaration path escapes runtime');
  return file;
 }
 if(![entries,declarationFiles,jobsDirectories].every(Array.isArray))throw new TypeError('entry and declaration selections must be arrays');
 for(const entry of entries) {
  if(typeof entry!=='string'||!isAbsolute(entry))throw new TypeError('entry paths must be absolute');
  selected.add(entry);
 }
 function collect(value) {
  if(!value||typeof value!=='object')return;
  if(typeof value.module==='string') {
   const target=resolveModule(value.module,root+'/package.json','import');
   if(!target?.file)findings.push({kind:'unresolved-declared-provider',specifier:value.module,reason:target?.external??'unresolved'});
   else selected.add(target.file);
  }
  for(const child of Object.values(value))if(child&&typeof child==='object')collect(child);
 }
 for(const file of declarationFiles)collect(JSON.parse(readFileSync(owned(file),'utf8')));
 for(const directory of jobsDirectories) {
  owned(directory);
  for(const entry of nodeJobProgramEntries({runtimeRoot:root,jobsDirectory:directory,missingPrograms:'retain'}))selected.add(entry);
 }
 return {entries:[...selected],findings};
}
