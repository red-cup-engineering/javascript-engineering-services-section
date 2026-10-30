// Independent processes receive their actual installed imports and required package files.
// Package declarations alone do not make an enterprise service part of a game's runtime.
import { createHash, randomUUID } from 'node:crypto';
import { builtinModules, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { lstat, mkdir, readFile, readdir, readlink, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const inside = (root, path) => { const p = relative(root, path); return p === '' || (!isAbsolute(p) && p !== '..' && !p.startsWith('..' + sep)); };
const hash = (parts) => { const h = createHash('sha256'); for (const part of parts) { const b = Buffer.from(part); h.update(String(b.length) + ':'); h.update(b); } return h.digest('hex'); };
const fingerprintContext = (receipt, entry, compilerVersion) => hash(['runtime-imports/v3', compilerVersion, process.version, process.platform, process.arch, receipt.installKey ?? '', entry]);
const optional = async (action) => { try { return await action(); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
const child = (root, path) => { if (!path || isAbsolute(path) || !inside(root, resolve(root, path))) throw new Error('runtime path must be inside its release: ' + path); return resolve(root, path); };
const builtins = new Set(builtinModules.flatMap(name => [name, 'node:' + name]));

async function compilerFrom(packageFile) {
  return import(pathToFileURL(createRequire(packageFile ?? import.meta.url).resolve('esbuild')));
}

async function link(pointer, target) {
  await mkdir(dirname(pointer), { recursive: true });
  const temporary = pointer + '.' + randomUUID();
  await symlink(target, temporary);
  await rename(temporary, pointer);
}

/** Discover imports without executing or relocating code; retain package resources for dynamic reads. */
export async function runtimeFingerprint(release, project, cache = new Map(), { repository, entry, compiler } = {}) {
  const { build, version: compilerVersion } = compiler ?? await compilerFrom();
  const root = await realpath(release);
  const projectRoot = await realpath(child(root, project));
  const entryPath = child(projectRoot, entry);
  if (!inside(root, projectRoot)) throw new Error('runtime project escapes its release');
  let receipt;
  if (repository) {
    const key = 'receipt:' + root;
    if (!cache.has(key)) cache.set(key, JSON.parse(await readFile(join(root, 'release-receipt.json'), 'utf8')));
    receipt = cache.get(key);
    if (receipt.identityVersion !== 1 || !receipt.source?.commit || receipt.artifactDigest !== basename(root)) throw new Error('runtime source must have a verified Git release identity');
    const recorded = receipt.runtimeClosures?.[project];
    if (receipt.installKey && recorded?.context === fingerprintContext(receipt, entry, compilerVersion)) return { digest: recorded.digest, packages: recorded.packages, modules: recorded.modules };
  }
  const graph = await build({
    absWorkingDir: root, entryPoints: [entryPath], bundle: true, platform: 'node',
    format: 'esm', target: 'node' + process.versions.node.split('.')[0], write: false,
    metafile: true, outfile: join(root, '.runtime-discovery.mjs'), logLevel: 'silent',
    // Match Node's package resolution rather than activating bundler-only module exports
    // or workspace tsconfig aliases. Output is evidence only; original paths still execute.
    conditions: ['node'], mainFields: ['main'], tsconfigRaw: {},
    logOverride: { 'unsupported-dynamic-import': 'error', 'unsupported-require-call': 'error', 'indirect-require': 'error' },
  });
  for (const input of Object.values(graph.metafile.inputs)) {
    for (const dependency of input.imports) if (dependency.external && !builtins.has(dependency.path)) throw Object.assign(new Error('unresolved runtime import: ' + dependency.path), { code: 'ERR_RUNTIME_UNRESOLVED_IMPORT' });
  }
  const packages = new Set([projectRoot]);
  const imports = [];
  for (const input of Object.keys(graph.metafile.inputs).sort()) {
    const path = await realpath(resolve(root, input));
    if (!inside(root, path)) throw new Error('installed dependency escapes its release: ' + input);
    imports.push(relative(root, path));
    let owner = dirname(path);
    while (inside(root, owner) && !(await optional(() => lstat(join(owner, 'package.json'))))) {
      if (owner === root) throw new Error('runtime import has no package carrier: ' + input);
      owner = dirname(owner);
    }
    packages.add(owner);
  }
  async function contents(path, visiting = new Set()) {
    if (cache.has(path)) return cache.get(path);
    if (visiting.has(path)) throw new Error('cyclic runtime source link: ' + path);
    const next = new Set(visiting).add(path);
    const info = await lstat(path);
    let value;
    if (info.isSymbolicLink()) {
      const target = await realpath(path);
      if (!inside(root, target)) throw new Error('runtime source link escapes its release: ' + path);
      value = hash(['link', relative(root, target), await contents(target, next)]);
    } else if (info.isDirectory()) {
      const entries = (await readdir(path)).filter(n => n !== 'node_modules' && n !== '.git').sort();
      const parts = ['directory'];
      for (const name of entries) {
        const nested = join(path, name);
        // Filesystem nesting does not compose another package into this runtime.
        // Imported nested carriers participate independently through the graph.
        if ((await lstat(nested)).isDirectory() && await optional(() => lstat(join(nested, 'package.json')))) continue;
        parts.push(name, await contents(nested, next));
      }
      value = hash(parts);
    } else if (info.isFile()) value = hash(['file', String(info.mode & 0o111), await readFile(path)]);
    else throw new Error('unsupported runtime source: ' + path);
    cache.set(path, value);
    return value;
  }
  const parts = ['runtime-imports/v3', process.version, process.platform, process.arch, project, entry, ...imports];
  for (const directory of [...packages].sort()) parts.push(relative(root, directory), await contents(directory));
  return { digest: hash(parts), packages: packages.size, modules: imports.length };
}


/** Validate before admission; each existing binding supplies its own comparison baseline. */
export async function prepareRuntimeBindings({ releaseRoot, release, runtimes = [], home, repository, compilerPackage }) {
  const compiler = runtimes.length ? await compilerFrom(compilerPackage) : null;
  const cache = new Map();
  const names = new Set();
  const plans = [];
  for (const runtime of runtimes) {
    const { name, file, project, health, entry } = runtime;
    if (!/^[a-z][a-z0-9-]*\.service$/u.test(name ?? '') || names.has(name)) throw new Error('runtime unit name must be unique: ' + name);
    if (!health) throw new Error('runtime requires an observable health receiver: ' + name);
    names.add(name);
    const pointer = join(releaseRoot, 'runtimes', name);
    const beforeLink = await optional(() => readlink(pointer));
    const before = await optional(() => realpath(beforeLink === null ? join(releaseRoot, 'current') : pointer));
    if (beforeLink !== null && !before) throw new Error('runtime binding is dangling: ' + name);
    if (before && (dirname(before) !== releaseRoot)) throw new Error('runtime binding must name one admitted release: ' + name);
    const installedUnit = join(home, '.config/systemd/user', name);
    const beforeUnit = await optional(() => readFile(installedUnit));
    const unit = await readFile(child(release, file));
    const working = /^WorkingDirectory=(.+)$/mu.exec(unit.toString())?.[1]?.replace(/^%h(?=\/|$)/u, home);
    if (!working || resolve(working) !== child(pointer, project)) throw new Error('runtime unit must start from its own binding: ' + name);
    const command = /^ExecStart=\S*node\s+(\S+)(?:\s.*)?$/mu.exec(unit.toString());
    if (!command || command[1] !== entry) throw new Error('runtime unit must execute its declared entry: ' + name);
    const after = await runtimeFingerprint(release, project, cache, { repository, entry, compiler });
    let prior = null, comparison;
    if (before) {
      try { prior = await runtimeFingerprint(before, project, cache, { repository, entry, compiler }); }
      catch (error) {
        if (error.code !== 'ERR_RUNTIME_UNRESOLVED_IMPORT') throw error;
        // An uncertifiable old closure cannot justify retaining it. The new
        // closure is already established; receive it through ordinary rollback.
        comparison = error.message;
      }
    }
    plans.push({ ...runtime, pointer, beforeLink, before, installedUnit, beforeUnit, unit, after, comparison,
      target: '../' + basename(release), changed: prior?.digest !== after.digest || !unit.equals(beforeUnit ?? Buffer.alloc(0)) });
  }
  // Admission and subsequent promotion share the same installed artifact. Record the
  // established closure in its existing materialization receipt, never in a side registry.
  if (repository && plans.length) {
    const receiptPath = join(release, 'release-receipt.json');
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    receipt.runtimeClosures = { ...receipt.runtimeClosures, ...Object.fromEntries(plans.map(plan => [plan.project, { ...plan.after, context: fingerprintContext(receipt, plan.entry, compiler.version) }])) };
    await writeFile(receiptPath + '.tmp', JSON.stringify(receipt, null, 2) + '\n', { mode: 0o444 });
    await rename(receiptPath + '.tmp', receiptPath);
  }
  return plans;
}

/** A release transaction owns rollback; untouched processes are never restarted on rollback. */
export function runtimeBindingTransaction(plans, { systemctl, healthy, onStep = () => {} }) {
  const touched = [];
  return {
    async apply() {
      for (const plan of plans) {
        const active = (await systemctl(['is-active', plan.name]).catch(() => '')).trim() === 'active';
        touched.push({ plan, active });
        if (plan.changed) {
          await link(plan.pointer, plan.target);
          await mkdir(dirname(plan.installedUnit), { recursive: true });
          await writeFile(plan.installedUnit + '.tmp', plan.unit, { mode: 0o644 });
          await rename(plan.installedUnit + '.tmp', plan.installedUnit);
          await systemctl(['daemon-reload']);
          await systemctl(['enable', plan.name]);
          await systemctl(['restart', plan.name]);
        } else {
          if (plan.beforeLink === null) await link(plan.pointer, '../' + basename(plan.before));
          if (!active) await systemctl(['start', plan.name]);
        }
        if (!(await healthy(plan))) throw new Error('runtime did not answer: ' + plan.name);
        onStep(`${plan.name}: ${plan.changed ? 'received' : 'retained'} ${plan.changed ? basename(plan.target) : basename(plan.before)} (${plan.after.modules} imported modules in ${plan.after.packages} packages)${plan.comparison ? "; replaced: " + plan.comparison : ""}`);
      }
    },
    async rollback() {
      for (const { plan, active } of touched.reverse()) {
        if (plan.beforeLink !== null) await link(plan.pointer, plan.beforeLink);
        else await rm(plan.pointer, { force: true });
        if (!plan.changed && active) continue;
        if (plan.beforeUnit) {
          await writeFile(plan.installedUnit + '.tmp', plan.beforeUnit, { mode: 0o644 });
          await rename(plan.installedUnit + '.tmp', plan.installedUnit);
          await systemctl(['daemon-reload']);
          await systemctl([active ? 'restart' : 'stop', plan.name]);
        } else {
          await systemctl(['disable', '--now', plan.name]);
          await rm(plan.installedUnit, { force: true });
          await systemctl(['daemon-reload']);
        }
      }
    },
  };
}

/** Pins survive any number of platform promotions, and also survive removal from a spec. */
export async function retainedRuntimeTargets(releaseRoot) {
  const directory = join(releaseRoot, 'runtimes');
  const targets = [];
  for (const name of await optional(() => readdir(directory)) ?? []) {
    const target = await realpath(join(directory, name));
    if (dirname(target) !== releaseRoot) throw new Error('cannot retire releases with an unverified runtime binding: ' + name);
    targets.push(basename(target));
  }
  return [...new Set(targets)];
}
