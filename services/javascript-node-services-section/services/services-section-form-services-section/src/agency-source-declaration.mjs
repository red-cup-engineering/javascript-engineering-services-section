import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { decodeYaml } from '@red-cup-engineering/yaml-frontmatter-codec-service';
import { encodeYaml } from '@red-cup-engineering/yaml-frontmatter-codec-service';
import path from 'node:path';
import { projectMarkdownFeatures } from '@red-cup-engineering/read-markdown-features-service';
import { readMarkdownSource } from '@red-cup-engineering/read-markdown-structure-service';
import { replaceMarkdownLinkTarget } from '@red-cup-engineering/markdown-engineering-services-section/replace-markdown-link-target';

/** Read the declaration from its exact witnessed bytes. A supplied reader view
 * is corroboration, never an independent source of authority or role data. */
export function readAgencySourceDeclaration(declaration) {
  const { source, sourceText, sha256, authored } = declaration;
  if (typeof source !== 'string' || typeof sourceText !== 'string'
    || createHash('sha256').update(sourceText).digest('hex') !== sha256)
    throw new TypeError('Exact agency source bytes required: ' + source);
  let record;
  if (source.endsWith('.json')) record = JSON.parse(sourceText);
  else {
    const match = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/u.exec(sourceText);
    if (!match) record = { body: sourceText };
    else {
      let front;
      try { front = decodeYaml(match[1]); }
      catch {
        // The original emitter left these prose scalars unquoted. This is a
        // carrier repair only; all parsing still belongs to the original codec.
        const repaired = match[1].replace(/^(description|name|title): ([^\n]+)$/gmu,
          (line, key, value) => /^[\[{'"|>]/u.test(value) ? line : key + ': ' + JSON.stringify(value));
        front = decodeYaml(repaired);
      }
      record = { ...front, body: sourceText.slice(match[0].length) };
    }
  }
  if (!record || typeof record !== 'object' || Array.isArray(record))
    throw new TypeError('Agency source must declare a mapping: ' + source);
  if (authored !== undefined && !isDeepStrictEqual(authored, record))
    throw new TypeError('Authored agency mapping differs from exact source bytes: ' + source);
  return record;
}

/** Preserve local Markdown references across the declared source moves.
 * The original Markdown parser owns link/code distinctions. This transient
 * migration correspondence is never a runtime source alias or authority map. */
export function relocateAgencySourceLinks(changes, references=[]) {
  const destinations=new Map([...changes.map(change=>[change.from,change.outputs[0].path]),...references.map(reference=>[reference.from,reference.to])]);
  const destinationOf=source=>{const visited=new Set();let at=source;while(destinations.has(at)&&destinations.get(at)!==at){if(visited.has(at))throw new TypeError('Cyclic source normalization correspondence');visited.add(at);at=destinations.get(at);}return at;};
  return changes.map(change=>({...change,outputs:change.outputs.map(output=>{
    let changed=false;
    const relocate=value=>{
      if(Array.isArray(value))return value.map(relocate);
      if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,key==='x-provenance'?item:relocate(item)]));
      if(typeof value!=='string'||!value.includes(']('))return value;
      const targets=new Set(projectMarkdownFeatures(readMarkdownSource(value)).filter(feature=>feature.type==='markdown-link').map(feature=>feature.target));
      const edits=[];
      for(const target of targets){
        if(!target||target.startsWith('#')||target.startsWith('/')||/^[a-z][a-z0-9+.-]*:/iu.test(target))continue;
        const match=/^([^#?]*)([\s\S]*)$/u.exec(target),file=match[1];
        if(!file)continue;
        let decoded;try{decoded=decodeURIComponent(file)}catch{continue;}
        const original=path.posix.normalize(path.posix.join(path.posix.dirname(change.from),decoded));
        const destination=destinationOf(original);
        const relative=path.posix.relative(path.posix.dirname(output.path),destination)||path.posix.basename(destination);
        const replacement=relative.split('/').map(encodeURIComponent).join('/')+match[2];
        if(replacement===target)continue;
        const received=replaceMarkdownLinkTarget(value,{target,replacement});
        if(received.count)edits.push(...received.edits);
      }
      let next=value,rightBoundary=value.length;
      for(const edit of edits.sort((a,b)=>b.span.start-a.span.start)){
        if(edit.span.end>rightBoundary||value.slice(edit.span.start,edit.span.end)!==edit.span.text)
          throw new TypeError('Overlapping or stale original source link spans');
        next=next.slice(0,edit.span.start)+edit.replacement+next.slice(edit.span.end);
        rightBoundary=edit.span.start;changed=true;
      }
      return next;
    };
    const input={source:output.path,sourceText:output.text,sha256:createHash('sha256').update(output.text).digest('hex')};
    const record=relocate(readAgencySourceDeclaration(input));
    if(!changed)return output;
    const text=output.path.endsWith('/SKILL.md')?(()=>{const{body,...front}=record;return'---\n'+encodeYaml(front)+'\n---\n'+body})():JSON.stringify(record,null,2)+'\n';
    return{...output,text};
  })}));
}
