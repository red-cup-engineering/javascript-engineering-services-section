import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  AmbiguousLockEvidenceError,
  collectLockedReleases,
  recoverNpmCacheReleaseTarballs
} from "@red-cup-engineering/npm-cache-release-recovery-service";

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

export function parseRecoveryOptions(argv) {
  const options = { cachePath: undefined, lockPaths: [], outputPath: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--cache") options.cachePath = requiredValue(argv, index++, "--cache");
    else if (argument === "--lock") options.lockPaths.push(requiredValue(argv, index++, "--lock"));
    else if (argument === "--output") options.outputPath = requiredValue(argv, index++, "--output");
    else throw new Error(`Unknown option: ${argument}`);
  }
  if (!options.cachePath) throw new Error("--cache is required and must name an npm cache directory");
  if (options.lockPaths.length === 0) throw new Error("at least one --lock is required");
  return options;
}

function evidenceConflict(release, candidate) {
  return release.resolved !== candidate.resolved || release.integrity !== candidate.integrity;
}

export function combineLockEvidence(locks) {
  const releases = new Map();
  for (const { path, packageLock } of locks) {
    for (const release of collectLockedReleases(packageLock)) {
      const key = `${release.name}@${release.version}`;
      const candidate = { ...release, sources: [{ path, lockPaths: release.lockPaths }] };
      const previous = releases.get(key);
      if (!previous) {
        releases.set(key, candidate);
        continue;
      }
      if (evidenceConflict(previous, candidate)) {
        throw new AmbiguousLockEvidenceError(release.name, release.version, [previous, candidate]);
      }
      previous.sources.push(...candidate.sources);
    }
  }
  return [...releases.values()]
    .map((release) => ({ ...release, sources: release.sources.sort((left, right) => left.path.localeCompare(right.path)) }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
}

export function recoveryPackageLock(releases) {
  return {
    lockfileVersion: 3,
    packages: Object.fromEntries(releases.map((release) => [
      `node_modules/${release.name}`,
      { version: release.version, resolved: release.resolved, integrity: release.integrity }
    ]))
  };
}

function isContained(root, target) {
  const path = relative(root, target);
  return path !== "" && !path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path);
}

export function canonicalTarballPath(outputPath, { name, version }) {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(name)) throw new TypeError(`Unsafe npm package name: ${name}`);
  if (!/^[a-z0-9][a-z0-9._+-]*$/iu.test(version) || version === "." || version === "..") throw new TypeError(`Unsafe package version: ${version}`);
  const root = resolve(outputPath);
  const target = resolve(root, name, version, "package.tgz");
  if (!isContained(root, target)) throw new Error("Canonical tarball path escapes the output directory");
  return target;
}

export async function materializeTarball(outputPath, tarball, fs = { lstat, mkdir, realpath, writeFile }) {
  const target = canonicalTarballPath(outputPath, tarball);
  const root = resolve(outputPath);
  await fs.mkdir(root, { recursive: true });
  const realRoot = await fs.realpath(root);
  let directory = root;
  for (const component of relative(root, dirname(target)).split(sep)) {
    directory = resolve(directory, component);
    try { await fs.mkdir(directory); } catch (error) { if (error?.code !== "EEXIST") throw error; }
    const status = await fs.lstat(directory);
    if (!status.isDirectory() || status.isSymbolicLink()) throw new Error("Tarball destination contains a non-directory or symbolic link");
    const realDirectory = await fs.realpath(directory);
    if (!isContained(realRoot, realDirectory)) throw new Error("Tarball destination escapes the output directory");
  }
  await fs.writeFile(target, tarball.data, { flag: "wx" });
  return target;
}

export async function auditNpmCacheReleaseRecovery(options, dependencies = {}) {
  const fs = { readFile, lstat, mkdir, realpath, writeFile, ...dependencies.fs };
  const readLock = dependencies.readLock ?? (async (path) => JSON.parse(await fs.readFile(path, "utf8")));
  const locks = [];
  for (const path of options.lockPaths) locks.push({ path: resolve(path), packageLock: await readLock(path) });
  const releases = combineLockEvidence(locks);
  const written = [];
  const audit = await (dependencies.recover ?? recoverNpmCacheReleaseTarballs)({
    packageLock: recoveryPackageLock(releases),
    cachePath: options.cachePath,
    readCacheEntry: dependencies.readCacheEntry,
    onTarball: options.outputPath ? async (tarball) => {
      const path = await materializeTarball(options.outputPath, tarball, fs);
      written.push(path);
    } : undefined
  });
  const evidence = new Map(releases.map((release) => [`${release.name}@${release.version}`, release.sources]));
  return {
    type: "NpmCacheReleaseRecoveryAudit",
    cachePath: options.cachePath,
    locks: locks.map(({ path }) => path),
    outputPath: options.outputPath ? resolve(options.outputPath) : null,
    audit: audit.map((entry) => ({ ...entry, sources: evidence.get(`${entry.name}@${entry.version}`) })),
    written
  };
}

export async function runNpmCacheReleaseRecovery(argv, dependencies = {}) {
  const options = parseRecoveryOptions(argv);
  const result = await auditNpmCacheReleaseRecovery(options, dependencies);
  (dependencies.write ?? process.stdout.write.bind(process.stdout))(`${JSON.stringify(result)}\n`);
  return result;
}
