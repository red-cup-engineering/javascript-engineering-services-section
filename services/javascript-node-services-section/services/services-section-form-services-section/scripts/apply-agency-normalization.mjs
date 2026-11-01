import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const hash = text => createHash('sha256').update(text).digest('hex');
function fileAt(root, relative, {output=false} = {}) {
  if (typeof relative !== 'string' || !/^services\//u.test(relative) || path.posix.normalize(relative) !== relative
    || relative.split('/').some(part => !part || part === '.' || part === '..')
    || !( /\/lib\/agency\/[^/]+\/[^/]+(?:\/[^/]+)?\.(json|md)$/u.test(relative)
      || (!output && /\/skills\/[^/]+\/SKILL\.md$/u.test(relative)) ))
    throw new TypeError('Explicit authored agency source path required');
  const file = path.join(root, relative);
  let at = root;
  for (const part of relative.split('/')) {
    at = path.join(at, part);
    if (!existsSync(at)) break;
    if (lstatSync(at).isSymbolicLink() || realpathSync(at) !== at) throw new TypeError('Canonical agency source cannot follow links');
  }
  return file;
}

/** Apply only the complete, source-hash-bound plan, with all sources retained in its custody. */
export function applyAgencyNormalization({ root, plan }) {
  if (!path.isAbsolute(root) || path.resolve(root) !== root || realpathSync(root) !== root
    || plan?.kind !== 'agency-source-normalization-plan/v1' || !Array.isArray(plan.changes)
    || plan.blockers?.length) throw new TypeError('Complete canonical agency normalization plan required');
  const destinations = new Set(), sourcePaths = new Set(), ready = [];
  // Receive every input and collision before the first source mutation.
  for (const change of plan.changes) {
    if (hash(change.sourceText) !== change.sha256 || !Array.isArray(change.outputs) || !change.outputs.length)
      throw new TypeError('Original byte-bound normalization change required');
    if (change.inputs !== undefined && !Array.isArray(change.inputs)) throw new TypeError('Companion inputs must be original witnessed sources');
    const inputs = [{ from: change.from, sourceText: change.sourceText, sha256: change.sha256 }, ...(change.inputs ?? [])].map(input => {
      if (typeof input.sourceText !== 'string' || hash(input.sourceText) !== input.sha256) throw new TypeError('Exact original companion bytes required');
      const file = fileAt(root, input.from);
      if (sourcePaths.has(file)) throw new TypeError('Duplicate normalization input');
      sourcePaths.add(file);
      return { ...input, file, current: existsSync(file) ? readFileSync(file, 'utf8') : undefined };
    });
    const outputs = change.outputs.map(output => {
      const file = fileAt(root, output.path, {output:true});
      if (destinations.has(file)) throw new TypeError('Duplicate normalization output');
      destinations.add(file);
      if (output.path.endsWith('.json')) JSON.parse(output.text);
      else if (!output.path.endsWith('/SKILL.md') || !/^---\n[\s\S]*?\n---\n/u.test(output.text))
        throw new TypeError('Canonical agency record or skill method required');
      const before = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
      if (before !== undefined && before !== output.text && !inputs.some(input => input.file === file)) throw new TypeError('Occupied normalization destination: ' + output.path);
      return { ...output, file, before };
    });
    const already = outputs.every(output => output.before === output.text);
    for (const input of inputs) {
      const sourceReceived = outputs.some(output => output.file === input.file && output.text === input.current);
      if (input.current !== input.sourceText && !sourceReceived && !(already && input.current === undefined))
        throw new TypeError('Original source changed before normalization: ' + input.from);
    }
    ready.push({ inputs, outputs, already });
  }
  let written = 0, retired = 0;
  for (const { inputs, outputs, already } of ready) {
    if (!already) for (const output of outputs) {
      if (output.before === output.text) continue;
      // A concurrent source or target is an obstruction, never an overwrite.
      const now = existsSync(output.file) ? readFileSync(output.file, 'utf8') : undefined;
      if (now !== output.before) throw new TypeError('Normalization output changed during apply');
      mkdirSync(path.dirname(output.file), { recursive: true });
      const temporary = output.file + '.normalizing-' + randomUUID();
      writeFileSync(temporary, output.text, { flag: 'wx' });
      renameSync(temporary, output.file); written++;
    }
    if (outputs.some(output => readFileSync(output.file, 'utf8') !== output.text)) throw new TypeError('Normalization output readback differs');
    for (const input of inputs) if (input.current !== undefined && !outputs.some(output => output.file === input.file)) {
      if (readFileSync(input.file, 'utf8') !== input.sourceText) throw new TypeError('Original source changed before retirement');
      unlinkSync(input.file); retired++;
    }
  }
  return { kind: 'agency-source-normalization-applied/v1', sources: ready.reduce((total, item) => total + item.inputs.length, 0), written, retired,
    outputs: ready.flatMap(({ outputs }) => outputs.map(output => ({ path: output.path, sha256: hash(output.text) }))),
    appointmentsCreated: 0, grantsCreated: 0 };
}
