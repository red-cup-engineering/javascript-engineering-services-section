import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire, isBuiltin } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const storeRoot = /^\/gnu\/store\/[a-z0-9]{32}-[^/]+$/;
const sha512 = /^sha512-[A-Za-z0-9+/]{86}==$/;
const sha256 = b => createHash('sha256').update(b).digest('hex');
const own = (v, keys) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join() !== [...keys].sort().join())
    throw new TypeError('exact native Code input fields required');
};
const confined = (root, file) => typeof root === 'string' && typeof file === 'string'
  && path.normalize(root) === root && path.normalize(file) === file && file.startsWith(root + '/');
const identity = x => x.name + '@' + x.version;
const version = v => typeof v === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(v);
const regular = async p => {
  const s = await fs.lstat(p);
  if (!s.isFile() || s.isSymbolicLink() || await fs.realpath(p) !== p) throw Error('regular unredirected native input required');
  return s;
};
export function validateProviderBill(bill) {
  own(bill, ['kind', 'package', 'archives', 'edges', 'providerInputs', 'archiveExtractor']);
  if (bill.kind !== 'native-code-provider-bill/v1') throw Error('native provider bill kind');
  own(bill.package, ['name', 'version', 'sourceCommit', 'integrity']);
  if (!packageName.test(bill.package.name) || !version(bill.package.version)
      || !/^[a-f0-9]{40}$/.test(bill.package.sourceCommit) || !sha512.test(bill.package.integrity))
    throw Error('exact source artifact identity required');
  if (!Array.isArray(bill.archives) || !bill.archives.length || bill.archives.length > 32
      || !Array.isArray(bill.edges) || bill.edges.length > 1024
      || !Array.isArray(bill.providerInputs) || !bill.providerInputs.length || bill.providerInputs.length > 8
      || new Set(bill.providerInputs).size !== bill.providerInputs.length || bill.providerInputs.some(x => !storeRoot.test(x)))
    throw Error('bounded native provider bill required');
  const extractor = bill.archiveExtractor;
  own(extractor, ['name', 'version', 'package', 'module', 'root']);
  if (!packageName.test(extractor.name) || !version(extractor.version)
      || !bill.providerInputs.includes(extractor.root) || !confined(extractor.root, extractor.package)
      || !confined(extractor.package, extractor.module)) throw Error('received archive extractor required');
  const ids = new Set();
  for (const a of bill.archives) {
    own(a, ['name', 'version', 'integrity', 'archive']);
    if (!packageName.test(a.name) || !version(a.version) || !sha512.test(a.integrity)
        || typeof a.archive !== 'string' || !path.isAbsolute(a.archive) || ids.has(identity(a)))
      throw Error('unique exact archived provider required');
    ids.add(identity(a));
  }
  const root = bill.archives.find(a => identity(a) === identity(bill.package));
  if (!root || root.integrity !== bill.package.integrity) throw Error('root archive differs from selected package');
  const edges = new Set();
  for (const e of bill.edges) {
    own(e, ['consumer', 'name', 'version', 'provider']);
    if (!ids.has(e.consumer) || !packageName.test(e.name) || !version(e.version) || edges.has(e.consumer + '\0' + e.name))
      throw Error('unique declared dependency edge required');
    edges.add(e.consumer + '\0' + e.name);
    if (e.provider.kind === 'artifact') {
      own(e.provider, ['kind', 'identity']);
      if (e.provider.identity !== identity(e) || !ids.has(e.provider.identity)) throw Error('artifact edge identity differs');
    } else if (e.provider.kind === 'registered') {
      own(e.provider, ['kind', 'root', 'path']);
      if (!bill.providerInputs.includes(e.provider.root) || typeof e.provider.path !== 'string'
          || !confined(e.provider.root, e.provider.path)) throw Error('registered provider outside received inputs');
    } else throw Error('native provider kind required');
  }
  return bill;
}
async function sourceInventory(root) {
  if (await fs.realpath(root) !== root || !(await fs.lstat(root)).isDirectory()) throw Error('unredirected source required');
  const files = []; let total = 0, count = 0;
  async function walk(dir, prefix) {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++count > 32768) throw Error('native source path bound');
      const name = prefix ? prefix + '/' + entry.name : entry.name, file = path.join(dir, entry.name);
      const s = await fs.lstat(file);
      if (s.isSymbolicLink()) throw Error('native source links are not artifact bytes');
      if (s.isDirectory()) await walk(file, name);
      else if (s.isFile()) {
        if (s.size > 67108864 || (total += s.size) > 268435456) throw Error('native source byte bound');
        const b = await fs.readFile(file);
        const after = await fs.lstat(file);
        if (s.ino !== after.ino || s.size !== after.size || s.mtimeMs !== after.mtimeMs) throw Error('native source changed');
        files.push([name, b.length, sha256(b)]);
      } else throw Error('unsupported native source member');
    }
  }
  await walk(root, '');
  return files.sort((a, b) => a[0].localeCompare(b[0]));
}
export async function materializeNativeCodeProgramme(input) {
  own(input, ['version', 'source', 'entry', 'nodeProgram', 'parserModule', 'policyModule', 'tarModule', 'bill', 'output']);
  if (input.version !== 1 || typeof input.entry !== 'string' || input.entry.startsWith('/')
      || input.entry.split('/').some(x => !x || x === '.' || x === '..')) throw Error('confined native entry required');
  const bill = validateProviderBill(input.bill), output = path.resolve(input.output);
  if (output === '/' || await fs.realpath(path.dirname(output)) !== path.dirname(output)) throw Error('native output parent required');
  for (const root of bill.providerInputs) if (await fs.realpath(root) !== root) throw Error('redirected registered root');
  if (input.tarModule !== bill.archiveExtractor.module) throw Error('archive extractor differs from bill');
  const extractor = JSON.parse(await fs.readFile(path.join(bill.archiveExtractor.package, 'package.json'), 'utf8'));
  if (await fs.realpath(bill.archiveExtractor.package) !== bill.archiveExtractor.package)
    throw Error('redirected archive extractor');
  await regular(input.tarModule);
  if (extractor.name !== bill.archiveExtractor.name || extractor.version !== bill.archiveExtractor.version)
    throw Error('archive extractor manifest differs');
  const tar = await import(pathToFileURL(input.tarModule));
  await fs.mkdir(output, { mode: 0o755 });
  const roots = new Map(), receiving = [];
  for (const a of bill.archives) {
    const stat = await regular(a.archive);
    if (stat.size > 67108864) throw Error('native archive bound');
    const bytes = await fs.readFile(a.archive);
    if ('sha512-' + createHash('sha512').update(bytes).digest('base64') !== a.integrity) throw Error('native archive integrity differs');
    const root = path.join(output, '.native', encodeURIComponent(identity(a)));
    await fs.mkdir(root, { recursive: true });
    let count = 0, unpacked = 0;
    await tar.x({ file: a.archive, cwd: root, strip: 1, strict: true, preservePaths: false,
      filter: (p, e) => {
        if (++count > 32768 || !p.startsWith('package/') || p.split('/').includes('..')
            || !['File', 'Directory', 'OldFile'].includes(e.type) || (unpacked += e.size ?? 0) > 268435456)
          throw Error('native archive member outside supported carrier');
        return true;
      } });
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    if (manifest.name !== a.name || manifest.version !== a.version) throw Error('native archived manifest identity differs');
    roots.set(identity(a), root);
    receiving.push({ name: a.name, version: a.version, integrity: a.integrity, bytes: bytes.length, files: (await sourceInventory(root)).length });
  }
  const selected = roots.get(identity(bill.package));
  const manifest = JSON.parse(await fs.readFile(path.join(selected, 'package.json'), 'utf8'));
  if (manifest.gitHead !== bill.package.sourceCommit) throw Error('native root source commit differs');
  const source = await sourceInventory(path.resolve(input.source)), artifact = await sourceInventory(selected);
  if (JSON.stringify(source) !== JSON.stringify(artifact)) throw Error('native authored source differs from selected archive');
  const edgeReceiving = [];
  for (const a of bill.archives) {
    const root = roots.get(identity(a)), m = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
    const declared = { ...m.dependencies, ...m.optionalDependencies }, edges = bill.edges.filter(e => e.consumer === identity(a));
    if (Object.keys(declared).sort().join() !== edges.map(e => e.name).sort().join()) throw Error('native provider bill omits or adds declared edges');
    for (const e of edges) {
      if (declared[e.name] !== e.version) throw Error('native dependency pin differs from bill');
      const provider = e.provider.kind === 'artifact' ? roots.get(e.provider.identity) : e.provider.path;
      if (await fs.realpath(provider) !== provider) throw Error('redirected native dependency');
      const supplied = JSON.parse(await fs.readFile(path.join(provider, 'package.json'), 'utf8'));
      if (supplied.name !== e.name || supplied.version !== e.version) throw Error('native dependency manifest differs');
      const link = path.join(root, 'node_modules', e.name);
      await fs.mkdir(path.dirname(link), { recursive: true });
      await fs.symlink(e.provider.kind === 'artifact' ? path.relative(path.dirname(link), provider) : provider, link);
      edgeReceiving.push({ consumer: e.consumer, name: e.name, version: e.version,
        provider: e.provider.kind === 'artifact' ? { kind: 'artifact', identity: e.provider.identity } : e.provider });
    }
  }
  for (const a of bill.archives) {
    if (a.name === bill.package.name && identity(a) !== identity(bill.package)) continue;
    if (a.name !== bill.package.name && bill.archives.filter(b => b.name === a.name).length > 1) continue;
    const root = roots.get(identity(a)), link = path.join(output, 'node_modules', a.name);
    await fs.mkdir(path.dirname(link), { recursive: true });
    await fs.symlink(path.relative(path.dirname(link), root), link);
  }
  await fs.writeFile(path.join(output, 'package.json'), JSON.stringify({
    private: true, type: 'module', nativeProgramme: { kind: 'native-provider-context-reuse/v1',
      package: bill.package.name, entry: input.entry, sourceCommit: bill.package.sourceCommit,
      integrity: bill.package.integrity, dependencyPolicy: 'received', programmeScope: 'package', providerInputs: bill.providerInputs }
  }, null, 2));
  const require = createRequire(path.join(output, 'package.json'));
  const policyFile = input.policyModule.startsWith('/') ? input.policyModule : require.resolve(input.policyModule);
  if (!confined(output, policyFile) && !bill.providerInputs.some(r => confined(r, policyFile)))
    throw Error('dependency policy leaves selected inputs');
  await regular(policyFile);
  const policy = await import(pathToFileURL(policyFile));
  if (typeof policy.dependencySpecificationViolations !== 'function') throw Error('original exact-dependency policy required');
  for (const a of bill.archives) {
    if (typeof policy.isExactSemver !== 'function' || !policy.isExactSemver(a.version))
      throw Error('native archived package version is not exact semver');
    const m = JSON.parse(await fs.readFile(path.join(roots.get(identity(a)), 'package.json'), 'utf8'));
    const violations = policy.dependencySpecificationViolations(m);
    if (violations.length) throw Error('native declared dependency policy refused');
  }
  // The original parser supplies syntax authority; programmes are never run at
  // construction. Static resolution covers every reachable literal ESM import.
  if (!bill.providerInputs.some(r => confined(r, input.parserModule))) throw Error('parser leaves selected inputs');
  await regular(input.parserModule);
  const parser = await import(pathToFileURL(input.parserModule));
  const parse = parser.parseJavaScript;
  if (typeof parse !== 'function') throw Error('original JavaScript parser required');
  const entry = path.join(selected, input.entry); await regular(entry);
  const modules = new Set(); let staticEdges = 0, dynamicExpressions = 0, sourceBytes = 0;
  async function receiveModule(file) {
    file = await fs.realpath(file);
    if (modules.has(file) || !['.js', '.mjs'].includes(path.extname(file))) return;
    if (!confined(output, file) && !bill.providerInputs.some(r => confined(r, file)))
      throw Error('static import leaves declared programme inputs');
    if (modules.size >= 4096) throw Error('native static module bound');
    modules.add(file);
    const text = await fs.readFile(file, 'utf8');
    if ((sourceBytes += Buffer.byteLength(text)) > 67108864) throw Error('native static source byte bound');
    const ast = parse(text, { sourceType: 'module' }), specifiers = [];
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source)
        specifiers.push(node.source.value);
      if (node.type === 'ImportExpression') {
        if (node.source?.type === 'Literal' && typeof node.source.value === 'string') specifiers.push(node.source.value);
        else dynamicExpressions++;
      }
      for (const [key, value] of Object.entries(node)) {
        if (['tokens', 'comments', 'source'].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
      }
    }
    visit(ast);
    for (const specifier of specifiers) {
      if (isBuiltin(specifier)) continue;
      const url = import.meta.resolve(specifier, pathToFileURL(file).href);
      if (!url.startsWith('file:')) throw Error('unsupported native static import protocol');
      const target = fileURLToPath(url); await regular(target); staticEdges++;
      await receiveModule(target);
    }
  }
  await receiveModule(entry);
  const receipt = { kind: 'native-code-programme.received/v1', package: bill.package,
    entry: 'node_modules/' + bill.package.name + '/' + input.entry, archives: receiving,
    edges: edgeReceiving, sourceFiles: source.length, sourceDigest: sha256(JSON.stringify(source)),
    providerInputs: bill.providerInputs, nodeProgram: input.nodeProgram,
    dependencyPolicy: 'received', applicationExecuted: false,
    staticImports: { modules: modules.size, edges: staticEdges, dynamicExpressions,
      scope: 'literal ESM imports of the selected programme entry; expressions remain runtime duties' } };
  await fs.writeFile(path.join(output, 'native-code-receiving.json'), JSON.stringify(receipt, null, 2));
  return receipt;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // CLI input is an original Guix-generated, credential-free descriptor.
  const guix = process.argv[2] === '--guix-inputs';
  const input = JSON.parse(await fs.readFile(process.argv[guix ? 3 : 2], 'utf8'));
  if (guix) {
    if (process.argv.length !== 6 + input.bill.archives.length) throw Error('exact sealed Guix archive inputs required');
    input.source = process.argv[4]; input.output = process.argv[5];
    for (let i = 0; i < input.bill.archives.length; i++) input.bill.archives[i].archive = process.argv[6 + i];
  }
  await materializeNativeCodeProgramme(input);
}

