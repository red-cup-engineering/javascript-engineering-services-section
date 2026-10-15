import { matchesGlob } from 'node:path';

const normalized = value => value.replace(/^\.\//u, '').replace(/\/+$/u, '');
const covers = (entry, target) => target === entry || target.startsWith(entry + '/')
  || matchesGlob(target, entry) || matchesGlob(target, entry + '/**');

/** Read explicit publication exclusions, without claiming emitted-file or ignore-rule receiving.
 * npm includes package metadata, main and bin independently of the files allowlist.
 * https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#files
 */
export function publicationFilesExclusionsOf(manifest, targets) {
  if (!Array.isArray(targets) || targets.some(value => typeof value !== 'string' || !value))
    throw new TypeError('publication targets must be nonempty paths');
  if (manifest.files === undefined) return Object.freeze([]);
  if (!Array.isArray(manifest.files) || manifest.files.some(value => typeof value !== 'string' || !value))
    throw new TypeError('publication files must be an array of nonempty patterns');
  const bins = typeof manifest.bin === 'string' ? [manifest.bin] : Object.values(manifest.bin ?? {});
  const automatic = new Set(['package.json', manifest.main, ...bins].filter(value => typeof value === 'string').map(normalized));
  const included = manifest.files.filter(value => !value.startsWith('!')).map(normalized);
  const excluded = manifest.files.filter(value => value.startsWith('!')).map(value => normalized(value.slice(1)));
  return Object.freeze([...new Set(targets)].filter(value => {
    const target = normalized(value);
    if (automatic.has(target) || (!target.includes('/') && /^(?:readme|licen[cs]e)(?:\..*)?$/iu.test(target))) return false;
    // A wildcard's concrete members still need actual packing/compilation receiving.
    if (target.includes('*')) return false;
    return !included.some(entry => covers(entry, target)) || excluded.some(entry => covers(entry, target));
  }).sort());
}
