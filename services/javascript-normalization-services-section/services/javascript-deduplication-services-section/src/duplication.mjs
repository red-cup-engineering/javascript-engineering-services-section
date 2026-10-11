import path from "node:path";
import { semanticId } from "@red-cup-engineering/computer-content-engineering-services-section/semiotic-content-address";
import { mkdirSync, readFileSync } from "node:fs";
import {
  discoverJavaScriptSourceFiles,
  extractExecutableBehaviors,

} from "@red-cup-engineering/javascript-computer";
import { eachWorkspacePackageDir } from "@red-cup-engineering/javascript-computer";
import { writeFileTextSync } from "@red-cup-engineering/computer-file-engineering-services-section/write-file";

  

/** Compact-view (`detail: false`, the default) cap on one candidate's
 *  `implementations` array. The array stays sorted by package/file/line, so
 *  a capped view keeps the first sites alphabetically by package. */
const COMPACT_IMPLEMENTATION_CAP = 5;
/** Compact-view cap on one candidate's `ownerEvidence` array. */
const COMPACT_OWNER_EVIDENCE_CAP = 3;

/** Change this whenever the serialized behavior carrier or its extraction
 * interpretation changes. Cache entries also include the installed analyzer
 * version, so a dependency upgrade cannot reuse old AST results. */
export const DUPLICATION_CACHE_SCHEMA_VERSION = 1;
const analyzerManifest = JSON.parse(readFileSync(new URL(import.meta.resolve("@red-cup-engineering/javascript-computer/package.json")), "utf8"));
const EXECUTABLE_BEHAVIOR_ANALYZER_VERSION = `${analyzerManifest.name}@${analyzerManifest.version}`;

  

function receivingOwnerEvidence(owner, records) {
  return Object.freeze(records.filter((record) => record.name === owner)
    .sort((a, b) => a.dir.localeCompare(b.dir))
    .map(({ name, dir, manifest }) => Object.freeze({
      package: name,
      packageDir: dir,
      version: manifest["version"] ?? null,
      exports: manifest["exports"] ?? null,
      main: manifest["main"] ?? null,
      dependencies: manifest["dependencies"] ?? {},
      testCommand: (manifest["scripts"])?.["test"] ?? null,
      verification: "source-manifest-only",
    })));
}

/**
 * A named ESM import plus a delegating public adapter is commonly much larger
 * than the import alone.  This fixed reserve intentionally errs against a
 * consolidation; exact implementation planning remains the final assay.
 */
export const CONSERVATIVE_FILE_REFERENCE_OVERHEAD_BYTES = 256;

  

function transitiveDependencies(packageName, dependencies) {
  const reached = new Set();
  const pending = [...(dependencies.get(packageName) ?? [])];
  while (pending.length > 0) {
    const name = pending.pop();
    if (reached.has(name)) continue;
    reached.add(name);
    pending.push(...(dependencies.get(name) ?? []));
  }
  return reached;
}

function existingOwner(packages, dependencies) {
  const distinct = [...new Set(packages)];
  const candidates = distinct.filter((candidate) => distinct.every(
    (consumer) => consumer === candidate || transitiveDependencies(consumer, dependencies).has(candidate),
  ));
  // A dependency cycle cannot establish which participant is upstream.
  return candidates.length === 1 && !transitiveDependencies(candidates[0], dependencies).has(candidates[0])
    ? candidates[0] : null;
}

/** Services-section directory names the org-layering law (2026-09-06) names
 * furthest upstream: a duplicate found partly seated under one of these is
 * owned there even with no existing dependency edge to establish it. */
const UPSTREAM_PRIMITIVE_SECTION_SEGMENTS = Object.freeze([
  "computer-data-engineering-services-section",
  "computer-code-engineering-services-section",
  "computer-networking-engineering-services-section",
]);

function upstreamPrimitiveDomainOwner(implementations) {
  const seated = new Set(
    implementations
      .filter((implementation) => {
        const segments = implementation.packageDir.split(path.sep);
        return UPSTREAM_PRIMITIVE_SECTION_SEGMENTS.some((segment) => segments.includes(segment));
      })
      .map((implementation) => implementation.package),
  );
  return seated.size === 1 ? [...seated][0] : null;
}

function packageLocalConcentration(implementations)

 {
  const implementationsByPackage = new Map();
  for (const implementation of implementations) {
    const group = implementationsByPackage.get(implementation.package) ?? [];
    group.push(implementation);
    implementationsByPackage.set(implementation.package, group);
  }
  const concentrations = [...implementationsByPackage.entries()].map(([packageName, group]) => {
    const totalBytes = group.reduce((sum, implementation) => sum + implementation.bytes, 0);
    return Object.freeze({
      package: packageName,
      implementationCount: group.length,
      totalBytes,
      removableBytes: totalBytes - Math.max(...group.map((implementation) => implementation.bytes)),
    });
  }).sort((a, b) => b.removableBytes - a.removableBytes || a.package.localeCompare(b.package));
  const largestConcentration = concentrations[0];
  if (largestConcentration === undefined) throw new Error("duplication candidate has no implementations");
  const largestPackageConcentration = Object.freeze({
    package: largestConcentration.package,
    implementationCount: largestConcentration.implementationCount,
    totalBytes: largestConcentration.totalBytes,
    removableBytes: largestConcentration.removableBytes,
  });
  const totalBytes = implementations.reduce((sum, implementation) => sum + implementation.bytes, 0);
  // One owner retains one body, not one body per contributing package. The
  // largest body is a size-planning assumption when variants differ.
  const estimatedSharedOwnerBytes = Math.max(...implementations.map((implementation) => implementation.bytes));
  // A reference is paid once per distinct physical source carrier.
  const estimatedReferenceOverheadBytes = new Set(
    implementations.map((implementation) => `${implementation.package}\u0000${implementation.file}`),
  ).size * CONSERVATIVE_FILE_REFERENCE_OVERHEAD_BYTES;
  return Object.freeze({
    packageLocalRemovableBytes: concentrations.reduce((sum, concentration) => sum + concentration.removableBytes, 0),
    largestPackageConcentration,
    estimatedSharedOwnerBytes,
    estimatedReferenceOverheadBytes,
    estimatedNetByteSavings: totalBytes - estimatedSharedOwnerBytes - estimatedReferenceOverheadBytes,
  });
}

function existingCandidateOrder(a, b) {
  return b.exactDuplicateBytes - a.exactDuplicateBytes
    || b.removableBytes - a.removableBytes
    || b.consumers.length - a.consumers.length
    || a.semanticFingerprint.localeCompare(b.semanticFingerprint);
}

function replicaKey(location) {
  return [location.package, location.file, location.name, location.kind, location.implementationFingerprint].join("\u0000");
}

const DUPLICATION_ARTIFACT_DIRECTORIES = new Set([
  ".lake", "build", "generated", "legacy", "vendor", "vendored", "vendored-js",
  // Bundler/dev-server temp output, never authored source: a Cloudflare
  // Workers `wrangler dev` run writes a bundled, minified copy of a site's
  // whole dependency graph under .wrangler/tmp/dev-*/index.js (reproduced
  // 2026-09-06: it crashed workspace duplication analysis entirely — no
  // top-level declaration for its own minified anonymous behaviors).
  ".wrangler",
]);
const GENERATED_SOURCE_HEADER = /^\uFEFF?\/\/\s*@generated\b/u;

function isArtifactSource(file) {
  const parts = file.split(path.sep);
  return parts.some((part) => DUPLICATION_ARTIFACT_DIRECTORIES.has(part.toLowerCase()));
}

/** A source-level provenance mark is required because generated browser
 * projections may live in ordinary public directories beside authored code. */
function isGeneratedSource(source) {
  return GENERATED_SOURCE_HEADER.test(source);
}

function isCampaignSource(file) {
  return !/(^|\/)(?:test|tests|fixtures?)(\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/iu.test(file);
}

function isCampaignPackage(root, directory) {
  const relative = path.relative(root, directory);
  return isCampaignSource(relative) && !isArtifactSource(relative);
}

function owningPackageDirectory(file, packageDirectories) {
  return packageDirectories.find((directory) => file === directory || file.startsWith(`${directory}${path.sep}`));
}

/** The content identity of one source text: the house `ni:` URI of its canonical CBOR bytes,
 *  never a locally chosen hash. */
function sourceIdentity(source) {
  return semanticId(source);
}

/** A filename-safe form of a content identity: the digest segment of the `ni:` URI. */
function identityFileName(identity) {
  return identity.slice(identity.lastIndexOf(";") + 1).replace(/[^A-Za-z0-9_-]/gu, "_");
}

function cachedBehaviors(cacheDir, source, file) {
  if (cacheDir === undefined) return extractExecutableBehaviors(source, file);
  const identity = sourceIdentity(source);
  const extension = path.extname(file).toLowerCase();
  const cacheKey = identityFileName(semanticId([DUPLICATION_CACHE_SCHEMA_VERSION, EXECUTABLE_BEHAVIOR_ANALYZER_VERSION, extension, identity]));
  const entry = path.join(cacheDir, `${cacheKey}.json`);
  try {
    const cached = JSON.parse(readFileSync(entry, "utf8"));
    if (cached.schemaVersion === DUPLICATION_CACHE_SCHEMA_VERSION
      && cached.analyzerVersion === EXECUTABLE_BEHAVIOR_ANALYZER_VERSION
      && cached.sourceIdentity === identity
      && cached.extension === extension
      && Array.isArray(cached.behaviors)) return cached.behaviors;
  } catch { /* Missing, corrupt, or unreadable cache entries are cache misses. */ }

  const behaviors = extractExecutableBehaviors(source, file);
  try {
    mkdirSync(cacheDir, { recursive: true });
    const payload = {
      schemaVersion: DUPLICATION_CACHE_SCHEMA_VERSION,
      analyzerVersion: EXECUTABLE_BEHAVIOR_ANALYZER_VERSION,
      sourceIdentity: identity,
      extension,
      behaviors,
    };
    writeFileTextSync(entry, JSON.stringify(payload));
  } catch { /* Analysis remains correct when a cache cannot be written. */ }
  return behaviors;
}

/** Find independently present executable behaviors with the same normalized
 * TypeScript AST. Duplicate physical copies of the same package/file carrier
 * are collapsed before ranking, so copied package forests cannot masquerade as
 * semantic consolidation opportunities. */
export function workspaceDuplication(root, options = {}) {
  const minimumBytes = options.minimumBytes ?? 48;
  const minimumImplementations = options.minimumImplementations ?? 2;
  const detail = options.detail ?? false;
  const workspacePackageRecords = [...eachWorkspacePackageDir(root, options.exclude === undefined ? {} : { exclude: options.exclude })];
  const packageRecords = workspacePackageRecords
    .filter((pkg) => isCampaignPackage(root, pkg.dir))
    .filter((pkg) => options.scope === undefined || pkg.name.includes(options.scope) || pkg.dir.includes(options.scope));
  const packageDirectories = workspacePackageRecords
    .map((pkg) => path.resolve(pkg.dir))
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
  const packageNames = new Set(workspacePackageRecords.map((pkg) => pkg.name));
  const dependencies = new Map();
  const consumers = new Map();
  for (const pkg of workspacePackageRecords) {
    const raw = pkg.manifest["dependencies"];
    const internal = raw && typeof raw === "object"
      ? Object.keys(raw).filter((name) => packageNames.has(name))
      : [];
    dependencies.set(pkg.name, internal);
    for (const provider of internal) {
      const set = consumers.get(provider) ?? new Set();
      set.add(pkg.name);
      consumers.set(provider, set);
    }
  }

  const groups = new Map();
  let analyzedFiles = 0;
  let analyzedBehaviors = 0;
  let nestedPackageSourceFilesExcluded = 0;
  let artifactSourceFilesExcluded = 0;
  const unanalyzableSourceFiles = [];
  for (const pkg of packageRecords) {
    for (const file of discoverJavaScriptSourceFiles(pkg.dir)) {
      const owner = owningPackageDirectory(file, packageDirectories);
      if (owner !== path.resolve(pkg.dir)) {
        nestedPackageSourceFilesExcluded++;
        continue;
      }
      const relativeFile = path.relative(pkg.dir, file);
      if (isArtifactSource(relativeFile)) {
        artifactSourceFilesExcluded++;
        continue;
      }
      let source;
      try { source = readFileSync(file, "utf8"); }
      catch { continue; }
      if (isGeneratedSource(source)) {
        artifactSourceFilesExcluded++;
        continue;
      }
      if (!isCampaignSource(relativeFile)) continue;
      analyzedFiles++;
      if (options.progress === true && analyzedFiles % 200 === 0) {
        process.stderr.write(`jsnode-duplication: scanned ${analyzedFiles} files (${groups.size} fingerprint groups so far)...\n`);
      }
      let behaviors;
      try {
        behaviors = cachedBehaviors(options.cacheDir, source, file);
      } catch (error) {
        unanalyzableSourceFiles.push(file);
        if (options.progress === true) {
          process.stderr.write(`jsnode-duplication: skipping unanalyzable file ${file}: ${error instanceof Error ? error.message : String(error)}\n`);
        }
        continue;
      }
      for (const behavior of behaviors) {
        if (behavior.bytes < minimumBytes) continue;
        analyzedBehaviors++;
        const location = Object.freeze({
          ...behavior,
          package: pkg.name,
          packageDir: pkg.dir,
          file: path.relative(pkg.dir, file),
        });
        const group = groups.get(behavior.semanticFingerprint) ?? [];
        group.push(location);
        groups.set(behavior.semanticFingerprint, group);
      }
    }
  }

  let replicatedPackageCopiesExcluded = 0;
  const candidates = [];
  for (const [semanticFingerprint, group] of groups) {
    const unique = new Map();
    for (const location of group) {
      const key = replicaKey(location);
      if (unique.has(key)) replicatedPackageCopiesExcluded++;
      else unique.set(key, location);
    }
    const implementations = [...unique.values()]
      .sort((a, b) => a.package.localeCompare(b.package) || a.file.localeCompare(b.file) || a.line - b.line);
    if (implementations.length < minimumImplementations) continue;
    const packages = [...new Set(implementations.map((item) => item.package))].sort();
    const consumerNames = [...new Set(packages.flatMap((name) => [...(consumers.get(name) ?? [])]))].sort();
    const totalBytes = implementations.reduce((sum, item) => sum + item.bytes, 0);
    const largest = Math.max(...implementations.map((item) => item.bytes));
    const variants = new Map();
    for (const implementation of implementations) {
      const rows = variants.get(implementation.implementationFingerprint) ?? [];
      rows.push(implementation);
      variants.set(implementation.implementationFingerprint, rows);
    }
    const exactDuplicateBytes = [...variants.values()].reduce((sum, rows) => {
      if (rows.length < 2) return sum;
      return sum + rows.reduce((bytes, row) => bytes + row.bytes, 0) - Math.max(...rows.map((row) => row.bytes));
    }, 0);
    const {
      packageLocalRemovableBytes,
      largestPackageConcentration,
      estimatedSharedOwnerBytes,
      estimatedReferenceOverheadBytes,
      estimatedNetByteSavings,
    } = packageLocalConcentration(implementations);
    const dependencyGraphOwner = existingOwner(packages, dependencies);
    const layeringLawOwner = upstreamPrimitiveDomainOwner(implementations);
    const owner = dependencyGraphOwner ?? layeringLawOwner;
    const ownerBasis = dependencyGraphOwner !== null ? "dependency-graph"
      : layeringLawOwner !== null ? "layering-law"
      : null;
    const ownerEvidence = receivingOwnerEvidence(owner, workspacePackageRecords);
    candidates.push(Object.freeze({
      semanticFingerprint,
      implementations: Object.freeze(detail ? implementations : implementations.slice(0, COMPACT_IMPLEMENTATION_CAP)),
      implementationCount: implementations.length,
      implementationVariants: new Set(implementations.map((item) => item.implementationFingerprint)).size,
      packages: Object.freeze(packages),
      consumers: Object.freeze(consumerNames),
      exactDuplicateBytes,
      removableBytes: totalBytes - largest,
      packageLocalRemovableBytes,
      largestPackageConcentration,
      estimatedSharedOwnerBytes,
      estimatedReferenceOverheadBytes,
      estimatedNetByteSavings,
      owner,
      ownerBasis,
      ownerEvidence: Object.freeze(detail ? ownerEvidence : ownerEvidence.slice(0, COMPACT_OWNER_EVIDENCE_CAP)),
      classification: "semantic-duplication",
    }));
  }
  candidates.sort((a, b) => {
    const aIsActionable = a.estimatedNetByteSavings > 0;
    const bIsActionable = b.estimatedNetByteSavings > 0;
    if (aIsActionable !== bIsActionable) return Number(bIsActionable) - Number(aIsActionable);
    if (aIsActionable && bIsActionable) {
      return b.estimatedNetByteSavings - a.estimatedNetByteSavings
        || b.packageLocalRemovableBytes - a.packageLocalRemovableBytes
        || existingCandidateOrder(a, b);
    }
    const aHasPackageLocalOpportunity = a.packageLocalRemovableBytes > 0;
    const bHasPackageLocalOpportunity = b.packageLocalRemovableBytes > 0;
    if (!aHasPackageLocalOpportunity && !bHasPackageLocalOpportunity) return existingCandidateOrder(a, b);
    return Number(bHasPackageLocalOpportunity) - Number(aHasPackageLocalOpportunity)
      || b.packageLocalRemovableBytes - a.packageLocalRemovableBytes
      || existingCandidateOrder(a, b);
  });
  const paged = options.offset === undefined ? candidates : candidates.slice(Math.max(0, options.offset));
  const limited = options.limit === undefined ? paged : paged.slice(0, Math.max(0, options.limit));
  return Object.freeze({
    root: path.resolve(root),
    analyzedPackages: packageRecords.length,
    analyzedFiles,
    analyzedBehaviors,
    nestedPackageSourceFilesExcluded,
    artifactSourceFilesExcluded,
    unanalyzableSourceFiles: Object.freeze(unanalyzableSourceFiles),
    replicatedPackageCopiesExcluded,
    candidateCount: candidates.length,
    candidates: Object.freeze(limited),
  });
}
