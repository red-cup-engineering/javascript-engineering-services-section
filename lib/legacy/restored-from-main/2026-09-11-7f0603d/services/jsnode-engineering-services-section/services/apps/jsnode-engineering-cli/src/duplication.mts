import path from "node:path";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import {
  discoverJavaScriptSourceFiles,
  extractExecutableBehaviors,
  type ExecutableBehavior,
} from "@red-cup-engineering/javascript-computer";
import { eachWorkspacePackageDir, type DiscoveredPackage, type WorkspaceFilter } from "./workspace.mjs";

export interface DuplicationOptions extends WorkspaceFilter {
  readonly scope?: string;
  readonly minimumBytes?: number;
  readonly minimumImplementations?: number;
  readonly limit?: number;
  /** Candidates to skip before applying `limit`, for paging a large result
   *  across repeated calls without re-deriving it; `candidateCount` always
   *  reports the full, unpaged, unscoped-by-offset total. */
  readonly offset?: number;
  /** When false (default), each candidate's `implementations` and
   *  `ownerEvidence` arrays are capped (see COMPACT_IMPLEMENTATION_CAP,
   *  COMPACT_OWNER_EVIDENCE_CAP) so a broad, unscoped scan's output stays
   *  bounded even when a fingerprint has many consumer sites — mirroring
   *  jsnode_search's own `detail` toggle over its consumer arrays. Pass
   *  `true` for the full, uncapped per-implementation/per-owner-evidence
   *  detail; every other candidate field (byte totals, packages, consumers,
   *  owner) is always complete regardless of this flag. */
  readonly detail?: boolean;
  /** Optional directory for reusable, content-addressed per-file extraction
   * results. Workspace package/dependency ranking is never cached. */
  readonly cacheDir?: string;
  /** Write live progress lines to stderr as the scan runs, instead of
   *  producing no output at all until the whole scan (which can take
   *  minutes across a large workspace) either finishes or throws. */
  readonly progress?: boolean;
}

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
const EXECUTABLE_BEHAVIOR_ANALYZER_VERSION = "@red-cup-engineering/javascript-computer@0.2.4";

export interface BehaviorLocation extends ExecutableBehavior {
  readonly package: string;
  readonly packageDir: string;
  readonly file: string;
}

export interface PackageConcentration {
  readonly package: string;
  readonly implementationCount: number;
  readonly totalBytes: number;
  readonly removableBytes: number;
}

export interface DuplicationCandidate {
  readonly semanticFingerprint: string;
  /** Sorted by package/file/line; capped to COMPACT_IMPLEMENTATION_CAP
   *  entries unless the request set `detail: true` — see
   *  `implementationCount` for the true total regardless of capping. */
  readonly implementations: readonly BehaviorLocation[];
  /** Total implementation sites for this fingerprint, uncapped even when
   *  `implementations` above is capped by the compact default view. */
  readonly implementationCount: number;
  readonly implementationVariants: number;
  readonly packages: readonly string[];
  readonly consumers: readonly string[];
  /** Bytes removable by merging only byte-identical normalized implementations. */
  readonly exactDuplicateBytes: number;
  readonly removableBytes: number;
  /** Bytes removable after retaining this family's largest implementation in every package. */
  readonly packageLocalRemovableBytes: number;
  /** The package with the greatest local consolidation opportunity. */
  readonly largestPackageConcentration: PackageConcentration;
  /**
   * Bytes reserved for one retained implementation in a shared owner. This
   * uses the largest observed body as a planning assumption; it neither proves
   * that policy variants are mergeable nor that a receiving owner is ready.
   */
  readonly estimatedSharedOwnerBytes: number;
  /**
   * Conservative allowance for every participating source file to import and
   * delegate to that owner.  It deliberately includes more than a bare ESM
   * import so typed public adapters do not appear free to the ranking.
   */
  readonly estimatedReferenceOverheadBytes: number;
  /**
   * Conservative estimated source-byte saving after paying for the assumed
   * shared owner and all file-level references. It is planning evidence, not
   * proof of semantic equivalence or realized savings. A positive value is
   * actionable; zero or a negative value is theoretical evidence only.
   */
  readonly estimatedNetByteSavings: number;
  /**
   * The single owner this candidate should consolidate into, or null when
   * neither signal below names one. Never proof of a usable public contract
   * by itself -- see ownerEvidence.
   */
  readonly owner: string | null;
  /**
   * How `owner` was decided: `"dependency-graph"` when every other package in
   * the cluster already depends on it (the strongest signal: a real existing
   * edge); `"layering-law"` when no dependency edge exists among the cluster
   * at all, but exactly one package seats under a computer-data/computer-code/
   * computer-networking services section (owner-ruled 2026-09-06,
   * ".claude/rules/org-layering.md") and so is the law's owner regardless;
   * null when neither signal names one (no cluster package seats under a
   * primitive section, or more than one does -- an ambiguous case a person
   * decides, not a guess this field makes).
   */
  readonly ownerBasis: "dependency-graph" | "layering-law" | null;
  /** Source declarations for reviewing `owner`, including duplicate-name
   * carriers. These do not attest installed/published bytes or passing tests.
   * Capped to COMPACT_OWNER_EVIDENCE_CAP entries unless `detail: true`. */
  readonly ownerEvidence: readonly ReceivingOwnerEvidence[];
  readonly classification: "semantic-duplication";
}

export interface ReceivingOwnerEvidence {
  readonly package: string;
  readonly packageDir: string;
  readonly version: unknown;
  readonly exports: unknown;
  readonly main: unknown;
  readonly dependencies: unknown;
  readonly testCommand: unknown;
  readonly verification: "source-manifest-only";
}

function receivingOwnerEvidence(owner: string | null, records: readonly DiscoveredPackage[]): readonly ReceivingOwnerEvidence[] {
  return Object.freeze(records.filter((record) => record.name === owner)
    .sort((a, b) => a.dir.localeCompare(b.dir))
    .map(({ name, dir, manifest }) => Object.freeze({
      package: name,
      packageDir: dir,
      version: manifest["version"] ?? null,
      exports: manifest["exports"] ?? null,
      main: manifest["main"] ?? null,
      dependencies: manifest["dependencies"] ?? {},
      testCommand: (manifest["scripts"] as Record<string, unknown> | undefined)?.["test"] ?? null,
      verification: "source-manifest-only" as const,
    })));
}

/**
 * A named ESM import plus a delegating public adapter is commonly much larger
 * than the import alone.  This fixed reserve intentionally errs against a
 * consolidation; exact implementation planning remains the final assay.
 */
export const CONSERVATIVE_FILE_REFERENCE_OVERHEAD_BYTES = 256;

export interface WorkspaceDuplication {
  readonly root: string;
  readonly analyzedPackages: number;
  readonly analyzedFiles: number;
  readonly analyzedBehaviors: number;
  /** Files encountered through an ancestor package after their nested package
   *  had already claimed the physical source carrier. */
  readonly nestedPackageSourceFilesExcluded: number;
  /** Files beneath package-local generated or vendored artifact directories. */
  readonly artifactSourceFilesExcluded: number;
  /** Real source files the behavior analyzer itself could not extract from
   *  (a parse edge case in one file, not a workspace-wide failure) — skipped
   *  rather than aborting the whole scan, since one such file previously
   *  discarded every candidate the scan had already found. */
  readonly unanalyzableSourceFiles: readonly string[];
  readonly replicatedPackageCopiesExcluded: number;
  readonly candidateCount: number;
  readonly candidates: readonly DuplicationCandidate[];
}

function transitiveDependencies(packageName: string, dependencies: ReadonlyMap<string, readonly string[]>): ReadonlySet<string> {
  const reached = new Set<string>();
  const pending = [...(dependencies.get(packageName) ?? [])];
  while (pending.length > 0) {
    const name = pending.pop()!;
    if (reached.has(name)) continue;
    reached.add(name);
    pending.push(...(dependencies.get(name) ?? []));
  }
  return reached;
}

function existingOwner(packages: readonly string[], dependencies: ReadonlyMap<string, readonly string[]>): string | null {
  const distinct = [...new Set(packages)];
  const candidates = distinct.filter((candidate) => distinct.every(
    (consumer) => consumer === candidate || transitiveDependencies(consumer, dependencies).has(candidate),
  ));
  // A dependency cycle cannot establish which participant is upstream.
  return candidates.length === 1 && !transitiveDependencies(candidates[0]!, dependencies).has(candidates[0]!)
    ? candidates[0]! : null;
}

/** Services-section directory names the org-layering law (2026-09-06) names
 * furthest upstream: a duplicate found partly seated under one of these is
 * owned there even with no existing dependency edge to establish it. */
const UPSTREAM_PRIMITIVE_SECTION_SEGMENTS = Object.freeze([
  "computer-data-engineering-services-section",
  "computer-code-engineering-services-section",
  "computer-networking-engineering-services-section",
]);

function upstreamPrimitiveDomainOwner(implementations: readonly BehaviorLocation[]): string | null {
  const seated = new Set(
    implementations
      .filter((implementation) => {
        const segments = implementation.packageDir.split(path.sep);
        return UPSTREAM_PRIMITIVE_SECTION_SEGMENTS.some((segment) => segments.includes(segment));
      })
      .map((implementation) => implementation.package),
  );
  return seated.size === 1 ? [...seated][0]! : null;
}

function packageLocalConcentration(implementations: readonly BehaviorLocation[]): {
  readonly packageLocalRemovableBytes: number;
  readonly largestPackageConcentration: PackageConcentration;
  readonly estimatedSharedOwnerBytes: number;
  readonly estimatedReferenceOverheadBytes: number;
  readonly estimatedNetByteSavings: number;
} {
  const implementationsByPackage = new Map<string, BehaviorLocation[]>();
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
  const largestPackageConcentration: PackageConcentration = Object.freeze({
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

function existingCandidateOrder(a: DuplicationCandidate, b: DuplicationCandidate): number {
  return b.exactDuplicateBytes - a.exactDuplicateBytes
    || b.removableBytes - a.removableBytes
    || b.consumers.length - a.consumers.length
    || a.semanticFingerprint.localeCompare(b.semanticFingerprint);
}

function replicaKey(location: BehaviorLocation): string {
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

function isArtifactSource(file: string): boolean {
  const parts = file.split(path.sep);
  return parts.some((part) => DUPLICATION_ARTIFACT_DIRECTORIES.has(part.toLowerCase()));
}

/** A source-level provenance mark is required because generated browser
 * projections may live in ordinary public directories beside authored code. */
function isGeneratedSource(source: string): boolean {
  return GENERATED_SOURCE_HEADER.test(source);
}

function isCampaignSource(file: string): boolean {
  return !/(^|\/)(?:test|tests|fixtures?)(\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/iu.test(file);
}

function isCampaignPackage(root: string, directory: string): boolean {
  const relative = path.relative(root, directory);
  return isCampaignSource(relative) && !isArtifactSource(relative);
}

function owningPackageDirectory(file: string, packageDirectories: readonly string[]): string | undefined {
  return packageDirectories.find((directory) => file === directory || file.startsWith(`${directory}${path.sep}`));
}

interface CachedExecutableBehaviors {
  readonly schemaVersion: number;
  readonly analyzerVersion: string;
  readonly sourceIdentity: string;
  readonly extension: string;
  readonly behaviors: readonly ExecutableBehavior[];
}

function sourceIdentity(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function cachedBehaviors(cacheDir: string | undefined, source: string, file: string): readonly ExecutableBehavior[] {
  if (cacheDir === undefined) return extractExecutableBehaviors(source, file);
  const identity = sourceIdentity(source);
  const extension = path.extname(file).toLowerCase();
  const cacheKey = createHash("sha256")
    .update(`${DUPLICATION_CACHE_SCHEMA_VERSION}\u0000${EXECUTABLE_BEHAVIOR_ANALYZER_VERSION}\u0000${extension}\u0000${identity}`)
    .digest("hex");
  const entry = path.join(cacheDir, `${cacheKey}.json`);
  try {
    const cached = JSON.parse(readFileSync(entry, "utf8")) as CachedExecutableBehaviors;
    if (cached.schemaVersion === DUPLICATION_CACHE_SCHEMA_VERSION
      && cached.analyzerVersion === EXECUTABLE_BEHAVIOR_ANALYZER_VERSION
      && cached.sourceIdentity === identity
      && cached.extension === extension
      && Array.isArray(cached.behaviors)) return cached.behaviors;
  } catch { /* Missing, corrupt, or unreadable cache entries are cache misses. */ }

  const behaviors = extractExecutableBehaviors(source, file);
  try {
    mkdirSync(cacheDir, { recursive: true });
    const payload: CachedExecutableBehaviors = {
      schemaVersion: DUPLICATION_CACHE_SCHEMA_VERSION,
      analyzerVersion: EXECUTABLE_BEHAVIOR_ANALYZER_VERSION,
      sourceIdentity: identity,
      extension,
      behaviors,
    };
    const temporary = `${entry}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(payload));
    renameSync(temporary, entry);
  } catch { /* Analysis remains correct when a cache cannot be written. */ }
  return behaviors;
}

/** Find independently present executable behaviors with the same normalized
 * TypeScript AST. Duplicate physical copies of the same package/file carrier
 * are collapsed before ranking, so copied package forests cannot masquerade as
 * semantic consolidation opportunities. */
export function workspaceDuplication(root: string, options: DuplicationOptions = {}): WorkspaceDuplication {
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
  const dependencies = new Map<string, readonly string[]>();
  const consumers = new Map<string, Set<string>>();
  for (const pkg of workspacePackageRecords) {
    const raw = pkg.manifest["dependencies"];
    const internal = raw && typeof raw === "object"
      ? Object.keys(raw as Record<string, unknown>).filter((name) => packageNames.has(name))
      : [];
    dependencies.set(pkg.name, internal);
    for (const provider of internal) {
      const set = consumers.get(provider) ?? new Set<string>();
      set.add(pkg.name);
      consumers.set(provider, set);
    }
  }

  const groups = new Map<string, BehaviorLocation[]>();
  let analyzedFiles = 0;
  let analyzedBehaviors = 0;
  let nestedPackageSourceFilesExcluded = 0;
  let artifactSourceFilesExcluded = 0;
  const unanalyzableSourceFiles: string[] = [];
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
      let source: string;
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
      let behaviors: readonly ExecutableBehavior[];
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
  const candidates: DuplicationCandidate[] = [];
  for (const [semanticFingerprint, group] of groups) {
    const unique = new Map<string, BehaviorLocation>();
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
    const variants = new Map<string, BehaviorLocation[]>();
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
    const ownerBasis = dependencyGraphOwner !== null ? "dependency-graph" as const
      : layeringLawOwner !== null ? "layering-law" as const
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
