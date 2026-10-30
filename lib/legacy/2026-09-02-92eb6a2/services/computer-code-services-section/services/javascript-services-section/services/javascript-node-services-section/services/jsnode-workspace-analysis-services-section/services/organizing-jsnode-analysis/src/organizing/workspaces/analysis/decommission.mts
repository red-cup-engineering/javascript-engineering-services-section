/**
 * decommission — readiness to earn package retirement.
 *
 * This read is deliberately conservative. It does not delete packages or claim
 * non-use from silence alone; it gathers the graph and source-demand evidence a
 * maintainer needs before doing the package-submodule retirement work:
 *
 *   - lifecycle and legacy/supersession markers
 *   - runtime dependents in the workspace DAG
 *   - source-level package consumers, including coarse imports that make usage
 *     indeterminate
 *   - explicit blockers and next evidence to gather
 *
 * Pure over the workspace carrier, dependency graph, and optional consumption
 * index. Filesystem walking belongs to the readers that build those inputs.
 */
import type { JSNodePackage, JSNodeWorkspace, PackageDependency, PackageLifecycle } from "../../packages/carrier.mts";
import type { ConsumptionIndex } from "../consumption.mjs";
import type { WorkspaceDependencyGraph } from "../graph.mts";
import { workspaceLifecycle, type MigrationDebtEdge } from "./lifecycle.mts";

export type DecommissionReadiness = "ready-to-prove" | "blocked" | "held" | "investigate";
export type DecommissionInvestigationKind =
  | "explicit-retirement-signal"
  | "blocked-live-use"
  | "provider-adapter"
  | "cockpit-specialization"
  | "archive-restoration"
  | "domain-fiber"
  | "unclassified-code-island";

export interface PackageDecommissionCandidate {
  readonly package: string;
  readonly packageDir: string | null;
  readonly manifestPath: string | null;
  readonly layer: JSNodePackage["layer"];
  readonly lifecycle: PackageLifecycle;
  readonly maturity: JSNodePackage["maturity"];
  readonly readiness: DecommissionReadiness;
  readonly investigationKind: DecommissionInvestigationKind;
  readonly investigationSignals: readonly string[];
  readonly reasons: readonly string[];
  readonly blockers: readonly string[];
  readonly markers: readonly string[];
  readonly runtimeDependents: readonly string[];
  readonly activeRuntimeDependents: readonly string[];
  readonly declaredDependents: readonly PackageDeclaredDependent[];
  readonly activeDeclaredDependents: readonly PackageDeclaredDependent[];
  readonly sourceConsumers: readonly string[];
  readonly sourceImports: readonly PackageSourceImport[];
  readonly sourceImportFiles: readonly PackageSourceImportFile[];
  readonly activeSourceConsumers: readonly string[];
  readonly coarseSourceConsumers: readonly string[];
  readonly sourceMarkers: readonly PackageSourceMarker[];
  readonly exports: number;
  readonly runtimeDependencies: readonly string[];
  readonly declaredDependencies: readonly PackageDependency[];
  readonly bins: readonly string[];
  readonly scripts: readonly string[];
  readonly proofObligations: readonly PackageRetirementProofObligation[];
  readonly proofEvidence: readonly PackageRetirementProofEvidence[];
  readonly nextEvidence: readonly string[];
}

export interface PackageSourceImport {
  readonly consumer: string;
  readonly file: string;
  readonly specifier: string;
  readonly mode: string;
  readonly typeOnly: boolean;
  readonly name?: string;
}

export interface PackageDeclaredDependent {
  readonly package: string;
  readonly kind: PackageDependency["kind"];
  readonly range: string;
}

export interface PackageSourceImportFile {
  readonly consumer: string;
  readonly file: string;
  readonly imports: number;
  readonly typeOnlyImports: number;
  readonly specifiers: readonly string[];
  readonly symbols: readonly string[];
}

export interface WorkspaceDecommissionReadiness {
  readonly kind: "jsnode.decommission-readiness";
  readonly packageCount: number;
  readonly candidateCount: number;
  readonly readyToProve: number;
  readonly blocked: number;
  readonly held: number;
  readonly investigate: number;
  readonly migrationDebt: readonly MigrationDebtEdge[];
  readonly candidates: readonly PackageDecommissionCandidate[];
}

export interface PackageSourceMarker {
  readonly package: string;
  readonly file: string;
  readonly line: number;
  readonly term: string;
  readonly excerpt: string;
}

export interface PackageDecommissionLocation {
  readonly package: string;
  readonly packageDir: string;
  readonly manifestPath: string;
}

export type PackageRetirementProofKind =
  | "role-proof"
  | "workspace-membership"
  | "lockfile-importer"
  | "submodule-state"
  | "live-reference-scan"
  | "focused-verification"
  | "filesystem-cleanup";

export interface PackageRetirementProofObligation {
  readonly kind: PackageRetirementProofKind;
  readonly surface: string;
  readonly requirement: string;
}

export type PackageRetirementProofEvidenceState = "observed" | "absent" | "requires-check";

export interface PackageRetirementProofEvidence {
  readonly kind: PackageRetirementProofKind;
  readonly surface: string;
  readonly state: PackageRetirementProofEvidenceState;
  readonly evidence: readonly string[];
  readonly gaps: readonly string[];
}

export interface PackageRetirementProofEvidenceInput extends PackageRetirementProofEvidence {
  readonly package: string;
}

export interface WorkspaceDecommissionOptions {
  /** Packages that are architectural roots and should never be offered as
   *  ordinary retirement candidates, even if they carry legacy-looking prose. */
  readonly corePackages?: readonly string[];
  /** Include active packages that carry no explicit legacy/deprecated markers
   *  but are dependency/source islands. Off by default to avoid nagging leaf
   *  apps and sites; useful for broad ecosystem sweeps. */
  readonly includeUnmarkedIslands?: boolean;
  /** Extra marker terms to search in names, tags, descriptions, scripts, and
   *  bins. Compared case-insensitively by substring. */
  readonly markerTerms?: readonly string[];
  /** Source-code marker evidence gathered by a filesystem reader. */
  readonly sourceMarkers?: readonly PackageSourceMarker[];
  /** Limit the report to these package names after evidence has been read. */
  readonly focus?: readonly string[];
  /** Filesystem location evidence gathered by the workspace reader. */
  readonly packageLocations?: readonly PackageDecommissionLocation[];
  /** Cheap repo-local retirement proof observations gathered by a filesystem reader. */
  readonly proofEvidence?: readonly PackageRetirementProofEvidenceInput[];
}

export const DECOMMISSION_MARKER_TERMS = Object.freeze([
  "abandoned",
  "backcompat",
  "decommission",
  "decommissioned",
  "deprecated",
  "experimental",
  "legacy",
  "retire",
  "shim",
  "superseded",
] as const);

const STRONG_SOURCE_MARKERS = new Set([
  "source:backcompat",
  "source:decommission",
  "source:decommissioned",
  "source:deprecated",
  "source:retire",
  "source:shim",
  "source:superseded",
]);

const RETIREMENT_EVIDENCE = Object.freeze([
  "scan live package.json files and active source/config for remaining references",
  "check pnpm-workspace.yaml and pnpm-lock.yaml importers before removing the package",
  "check .gitmodules and package-local .git metadata before moving or deleting a path",
  "run focused downstream package checks after retargeting live references",
] as const);

const SOURCE_DEMAND_UNKNOWN = "source consumption index was not provided";

export function workspaceDecommissionReadiness(
  workspace: JSNodeWorkspace,
  graph: WorkspaceDependencyGraph,
  consumption?: ConsumptionIndex,
  options: WorkspaceDecommissionOptions = {},
): WorkspaceDecommissionReadiness {
  const lifecycle = workspaceLifecycle(graph);
  const core = new Set(options.corePackages ?? []);
  const focus = new Set(options.focus ?? []);
  const markerTerms = [...(options.markerTerms ?? DECOMMISSION_MARKER_TERMS)].map((term) => term.toLowerCase());
  const pkgByName = new Map(workspace.packages.map((pkg) => [pkg.name, pkg]));
  const lifecycleOf = new Map(workspace.packages.map((pkg) => [pkg.name, pkg.lifecycle]));
  const dependents = dependentsByPackage(graph);
  const declaredDependents = declaredDependentsByPackage(workspace);
  const source = sourceConsumersByProvider(consumption);
  const sourceMarkers = sourceMarkersByPackage(options.sourceMarkers ?? []);
  const packageLocations = packageLocationsByName(options.packageLocations ?? []);
  const proofEvidence = proofEvidenceByPackage(options.proofEvidence ?? []);

  const candidates: PackageDecommissionCandidate[] = [];
  for (const pkg of workspace.packages) {
    if (focus.size > 0 && !focus.has(pkg.name)) continue;
    const runtimeDependents = sorted(dependents.get(pkg.name) ?? []);
    const activeRuntimeDependents = runtimeDependents.filter((name) => lifecycleOf.get(name) === "active");
    const allDeclaredDependents = sortedDeclaredDependents(declaredDependents.get(pkg.name) ?? []);
    const activeDeclaredDependents = allDeclaredDependents.filter((edge) => lifecycleOf.get(edge.package) === "active");
    const sourceRead = source.get(pkg.name);
    const sourceConsumers = sorted(sourceRead?.all ?? []);
    const sourceImports = Object.freeze([...(sourceRead?.imports ?? [])]);
    const sourceImportFiles = sourceImportFilesFor(sourceImports);
    const coarseSourceConsumers = sorted(sourceRead?.coarse ?? []);
    const activeSourceConsumers = sourceConsumers.filter((name) => lifecycleOf.get(name) === "active");
    const packageSourceMarkers = Object.freeze([...(sourceMarkers.get(pkg.name) ?? [])]);
    const location = packageLocations.get(pkg.name);
    const markers = markerHits(pkg, markerTerms, packageSourceMarkers);
    const reasons = candidateReasons(pkg, markers, runtimeDependents, sourceConsumers, consumption !== undefined);
    const investigation = investigatePackageKind(pkg, markers);
    const unmarkedIsland = isIsland(
      pkg,
      runtimeDependents,
      allDeclaredDependents,
      sourceConsumers,
      consumption !== undefined,
    );
    const packageLevelSignal = hasPackageLevelSignal(pkg, markers);
    const strongSourceSignal = markers.some((marker) => STRONG_SOURCE_MARKERS.has(marker));
    const worthReporting = packageLevelSignal || strongSourceSignal || (options.includeUnmarkedIslands === true && unmarkedIsland);
    if (!worthReporting) continue;

    const blockers = candidateBlockers(
      pkg,
      core,
      activeRuntimeDependents,
      activeDeclaredDependents,
      activeSourceConsumers,
      coarseSourceConsumers,
      consumption,
    );
    const readiness = classifyReadiness(
      pkg,
      core,
      blockers,
      activeRuntimeDependents,
      activeDeclaredDependents,
      activeSourceConsumers,
      markers,
    );
    const candidateInvestigation = readiness === "blocked"
      ? blockedLiveUseInvestigation(blockers)
      : investigation;
    const proofObligations = packageRetirementProofObligations(pkg, location);
    const candidateProofEvidence = packageRetirementProofEvidence(
      pkg,
      location,
      proofObligations,
      activeRuntimeDependents,
      activeDeclaredDependents,
      activeSourceConsumers,
      consumption !== undefined,
      proofEvidence.get(pkg.name) ?? [],
    );
    const nextEvidence = nextEvidenceFor(readiness, consumption !== undefined, pkgByName.has(pkg.name));

    candidates.push(Object.freeze({
      package: pkg.name,
      packageDir: location?.packageDir ?? null,
      manifestPath: location?.manifestPath ?? null,
      layer: pkg.layer,
      lifecycle: pkg.lifecycle,
      maturity: pkg.maturity,
      readiness,
      investigationKind: candidateInvestigation.kind,
      investigationSignals: candidateInvestigation.signals,
      reasons: Object.freeze(reasons),
      blockers: Object.freeze(blockers),
      markers: Object.freeze(markers),
      runtimeDependents: Object.freeze(runtimeDependents),
      activeRuntimeDependents: Object.freeze(activeRuntimeDependents),
      declaredDependents: allDeclaredDependents,
      activeDeclaredDependents: Object.freeze(activeDeclaredDependents),
      sourceConsumers: Object.freeze(sourceConsumers),
      sourceImports,
      sourceImportFiles,
      activeSourceConsumers: Object.freeze(activeSourceConsumers),
      coarseSourceConsumers: Object.freeze(coarseSourceConsumers),
      sourceMarkers: packageSourceMarkers,
      exports: pkg.exports.length,
      runtimeDependencies: Object.freeze([...pkg.dependencies]),
      declaredDependencies: Object.freeze([...pkg.deps]),
      bins: Object.freeze([...pkg.manifest.bins]),
      scripts: Object.freeze([...pkg.manifest.scripts]),
      proofObligations,
      proofEvidence: candidateProofEvidence,
      nextEvidence,
    }));
  }

  candidates.sort(compareCandidate);

  return Object.freeze({
    kind: "jsnode.decommission-readiness" as const,
    packageCount: workspace.packages.length,
    candidateCount: candidates.length,
    readyToProve: candidates.filter((c) => c.readiness === "ready-to-prove").length,
    blocked: candidates.filter((c) => c.readiness === "blocked").length,
    held: candidates.filter((c) => c.readiness === "held").length,
    investigate: candidates.filter((c) => c.readiness === "investigate").length,
    migrationDebt: lifecycle.migrationDebt,
    candidates: Object.freeze(candidates),
  });
}

function dependentsByPackage(graph: WorkspaceDependencyGraph): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const node of graph.nodes) out.set(node.name, []);
  for (const edge of graph.edges) out.get(edge.to)?.push(edge.from);
  return out;
}

function declaredDependentsByPackage(workspace: JSNodeWorkspace): Map<string, PackageDeclaredDependent[]> {
  const out = new Map<string, PackageDeclaredDependent[]>();
  const packageNames = new Set(workspace.packages.map((pkg) => pkg.name));
  for (const pkg of workspace.packages) {
    for (const dep of pkg.deps) {
      if (!packageNames.has(dep.name)) continue;
      (out.get(dep.name) ?? out.set(dep.name, []).get(dep.name)!).push({
        package: pkg.name,
        kind: dep.kind,
        range: dep.range,
      });
    }
  }
  return out;
}

function sourceConsumersByProvider(consumption: ConsumptionIndex | undefined): Map<string, { all: Set<string>; coarse: Set<string>; imports: PackageSourceImport[] }> {
  const out = new Map<string, { all: Set<string>; coarse: Set<string>; imports: PackageSourceImport[] }>();
  if (consumption === undefined) return out;
  for (const edge of consumption.edges) {
    const read = out.get(edge.provider) ?? { all: new Set<string>(), coarse: new Set<string>(), imports: [] };
    read.all.add(edge.consumer);
    if (edge.name === undefined) read.coarse.add(edge.consumer);
    read.imports.push(Object.freeze({
      consumer: edge.consumer,
      file: edge.file,
      specifier: edge.specifier,
      mode: edge.mode,
      typeOnly: edge.typeOnly,
      ...(edge.name === undefined ? {} : { name: edge.name }),
    }));
    out.set(edge.provider, read);
  }
  for (const read of out.values()) {
    read.imports.sort((a, b) =>
      a.consumer.localeCompare(b.consumer) ||
      a.file.localeCompare(b.file) ||
      a.specifier.localeCompare(b.specifier) ||
      a.mode.localeCompare(b.mode) ||
      (a.name ?? "").localeCompare(b.name ?? "")
    );
  }
  return out;
}

function sourceImportFilesFor(imports: readonly PackageSourceImport[]): readonly PackageSourceImportFile[] {
  const byFile = new Map<string, {
    consumer: string;
    file: string;
    imports: number;
    typeOnlyImports: number;
    specifiers: Set<string>;
    symbols: Set<string>;
  }>();

  for (const edge of imports) {
    const key = `${edge.consumer}\0${edge.file}`;
    const bucket = byFile.get(key) ?? {
      consumer: edge.consumer,
      file: edge.file,
      imports: 0,
      typeOnlyImports: 0,
      specifiers: new Set<string>(),
      symbols: new Set<string>(),
    };
    bucket.imports += 1;
    if (edge.typeOnly) bucket.typeOnlyImports += 1;
    bucket.specifiers.add(edge.specifier);
    bucket.symbols.add(edge.name === undefined ? edge.mode : `${edge.mode}:${edge.name}`);
    byFile.set(key, bucket);
  }

  const out = [...byFile.values()].map((bucket) => Object.freeze({
    consumer: bucket.consumer,
    file: bucket.file,
    imports: bucket.imports,
    typeOnlyImports: bucket.typeOnlyImports,
    specifiers: Object.freeze([...bucket.specifiers].sort((a, b) => a.localeCompare(b))),
    symbols: Object.freeze([...bucket.symbols].sort((a, b) => a.localeCompare(b))),
  }));
  out.sort((a, b) =>
    a.consumer.localeCompare(b.consumer) ||
    a.file.localeCompare(b.file)
  );
  return Object.freeze(out);
}

function sourceMarkersByPackage(markers: readonly PackageSourceMarker[]): Map<string, readonly PackageSourceMarker[]> {
  const grouped = new Map<string, PackageSourceMarker[]>();
  for (const marker of markers) {
    (grouped.get(marker.package) ?? grouped.set(marker.package, []).get(marker.package)!).push(marker);
  }
  const out = new Map<string, readonly PackageSourceMarker[]>();
  for (const [name, hits] of grouped) {
    hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.term.localeCompare(b.term));
    out.set(name, Object.freeze(hits));
  }
  return out;
}

function packageLocationsByName(locations: readonly PackageDecommissionLocation[]): Map<string, PackageDecommissionLocation> {
  const out = new Map<string, PackageDecommissionLocation>();
  for (const location of locations) out.set(location.package, location);
  return out;
}

function proofEvidenceByPackage(evidence: readonly PackageRetirementProofEvidenceInput[]): Map<string, readonly PackageRetirementProofEvidenceInput[]> {
  const grouped = new Map<string, PackageRetirementProofEvidenceInput[]>();
  for (const item of evidence) {
    (grouped.get(item.package) ?? grouped.set(item.package, []).get(item.package)!).push(item);
  }
  const out = new Map<string, readonly PackageRetirementProofEvidenceInput[]>();
  for (const [name, hits] of grouped) {
    hits.sort((a, b) => a.kind.localeCompare(b.kind) || a.surface.localeCompare(b.surface));
    out.set(name, Object.freeze(hits));
  }
  return out;
}

export function decommissionSourceMarkerPattern(terms: readonly string[] = DECOMMISSION_MARKER_TERMS): RegExp {
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "iu");
}

export function isActionableDecommissionSourceMarker(term: string, excerpt: string, relativeFile: string): boolean {
  const text = excerpt.toLowerCase();
  if (isDecommissionVocabularyDefinition(relativeFile, text)) return false;

  if (term === "legacy") {
    return /\blegacy\s+(api|block|compat|format|import|key|keys|module|package|path|protocol|reference|references|shim|surface)\b/u.test(text);
  }
  if (term === "superseded") {
    return /\bsuperseded\s+by\b/u.test(text) && !/\b(assertion|claim|correction|functional|history|predicate|stamp|value)\b/u.test(text);
  }
  if (term === "decommissioned") {
    return /\bdecommissioned\b/u.test(text);
  }
  if (term === "deprecated") {
    if (/\bnot\s+the\s+deprecated\b/u.test(text)) return false;
    if (/\bfrom\s+the\s+deprecated\s+`?@/u.test(text)) return false;
    return /\bdeprecated\s+(api|dependency|engine|import|module|package|surface)\b/u.test(text);
  }
  if (term === "abandoned") {
    return /\babandoned\s+(api|directory|module|package|surface|workspace)\b/u.test(text);
  }
  if (term === "backcompat" || term === "decommission" || term === "retire" || term === "shim") return true;
  return false;
}

function isDecommissionVocabularyDefinition(relativeFile: string, text: string): boolean {
  if (relativeFile.includes("/analysis/decommission.") || relativeFile.includes("/analysis/lifecycle.")) return true;
  if (relativeFile.includes("/analysis/consistency.") && text.includes("deprecated")) return true;
  if (relativeFile.includes("/workspaces/consumption.") && text.includes("deprecated engine")) return true;
  if (relativeFile.includes("/packages/carrier.") && /\b(active|maintenance|deprecated|decommissioned|abandoned|experimental|maturity|lifecycle)\b/u.test(text)) return true;
  if (relativeFile.includes("/workspaces/workspace.") && text.includes("deprecated")) return true;
  if (relativeFile.includes("/scripts/workspace.") && text.includes("jsnode-workspace decommission")) return true;
  return false;
}

function markerHits(
  pkg: JSNodePackage,
  markerTerms: readonly string[],
  sourceMarkers: readonly PackageSourceMarker[],
): string[] {
  const fields = [
    ["name", pkg.name],
    ["description", pkg.description],
    ...pkg.tags.map((tag) => ["tag", tag] as const),
    ...pkg.manifest.scripts.map((script) => ["script", script] as const),
    ...pkg.manifest.bins.map((bin) => ["bin", bin] as const),
  ] as const;
  const hits = new Set<string>();
  for (const [field, value] of fields) {
    const text = value.toLowerCase();
    for (const term of markerTerms) {
      if (text.includes(term)) hits.add(`${field}:${term}`);
    }
  }
  for (const marker of sourceMarkers) hits.add(`source:${marker.term}`);
  return sorted(hits);
}

function candidateReasons(
  pkg: JSNodePackage,
  markers: readonly string[],
  runtimeDependents: readonly string[],
  sourceConsumers: readonly string[],
  hasSourceRead: boolean,
): string[] {
  const reasons: string[] = [];
  if (pkg.lifecycle !== "active") reasons.push(`lifecycle:${pkg.lifecycle}`);
  for (const marker of markers) reasons.push(`marker:${marker}`);
  if (runtimeDependents.length === 0) reasons.push("no-runtime-dependents");
  if (hasSourceRead && sourceConsumers.length === 0) reasons.push("no-source-consumers");
  return sorted(reasons);
}

function hasPackageLevelSignal(pkg: JSNodePackage, markers: readonly string[]): boolean {
  return pkg.lifecycle !== "active" || markers.some((marker) => !marker.startsWith("source:"));
}

function investigatePackageKind(pkg: JSNodePackage, markers: readonly string[]): {
  readonly kind: DecommissionInvestigationKind;
  readonly signals: readonly string[];
} {
  const local = pkg.name.includes("/") ? pkg.name.slice(pkg.name.indexOf("/") + 1) : pkg.name;
  const text = `${local} ${pkg.description}`.toLowerCase();
  const dependencies = new Set(pkg.dependencies);
  const signals: string[] = [];

  if (hasPackageLevelSignal(pkg, markers)) {
    signals.push("package lifecycle or package-level marker asks for retirement proof");
    return { kind: "explicit-retirement-signal", signals: Object.freeze(signals) };
  }
  if (text.includes("vs code") && text.includes("specialization")) {
    signals.push("description names a VS Code cockpit specialization");
    return { kind: "cockpit-specialization", signals: Object.freeze(signals) };
  }
  if (
    local.startsWith("organizing-with-") &&
    (dependencies.has("@red-cup-engineering/organizing-with-agents") || dependencies.has("@red-cup-engineering/organizing-with-llm-agents"))
  ) {
    signals.push("organizing-with provider package depends on agent or LLM agent substrate");
    return { kind: "provider-adapter", signals: Object.freeze(signals) };
  }
  if (text.includes("archive") || text.includes("restored")) {
    signals.push("description names restored/archive experiment kernels");
    return { kind: "archive-restoration", signals: Object.freeze(signals) };
  }
  if (text.includes("fiber") || local.startsWith("organizing-as-")) {
    signals.push("description or package name presents a domain fiber");
    return { kind: "domain-fiber", signals: Object.freeze(signals) };
  }

  signals.push("no classifier matched; inspect package intent manually");
  return { kind: "unclassified-code-island", signals: Object.freeze(signals) };
}

function blockedLiveUseInvestigation(blockers: readonly string[]): {
  readonly kind: DecommissionInvestigationKind;
  readonly signals: readonly string[];
} {
  const signals = blockers.length === 0
    ? ["retirement is blocked by live use evidence"]
    : blockers.slice(0, 5).map((blocker) => `blocked by ${blocker}`);
  return { kind: "blocked-live-use", signals: Object.freeze(signals) };
}

function packageRetirementProofObligations(
  pkg: JSNodePackage,
  location: PackageDecommissionLocation | undefined,
): readonly PackageRetirementProofObligation[] {
  const packageDir = location?.packageDir ?? pkg.name;
  return Object.freeze([
    proofObligation(
      "role-proof",
      location?.manifestPath ?? `${packageDir}/package.json`,
      "prove the package's current role, lifecycle, public surface, and dependents before editing",
    ),
    proofObligation(
      "workspace-membership",
      "pnpm-workspace.yaml",
      "confirm whether the package is still admitted to the active workspace before removal",
    ),
    proofObligation(
      "lockfile-importer",
      "pnpm-lock.yaml",
      "confirm the package importer and workspace dependency edges are removed or intentionally retained",
    ),
    proofObligation(
      "submodule-state",
      ".gitmodules and package-local .git metadata",
      "if the package is a submodule, prove .gitmodules, package-local .git, and .git/modules metadata agree before moving or deleting",
    ),
    proofObligation(
      "live-reference-scan",
      "package manifests, active source, and active config",
      "retarget live references before deletion; treat archive/history mentions as non-blocking unless explicitly in scope",
    ),
    proofObligation(
      "focused-verification",
      "touched package family",
      "run focused downstream checks, builds, or smoke tests that cover the retargeted references",
    ),
    proofObligation(
      "filesystem-cleanup",
      packageDir,
      "after retirement, confirm the old path is gone and no ignored build artifacts left a directory shell behind",
    ),
  ]);
}

function packageRetirementProofEvidence(
  pkg: JSNodePackage,
  location: PackageDecommissionLocation | undefined,
  obligations: readonly PackageRetirementProofObligation[],
  activeRuntimeDependents: readonly string[],
  activeDeclaredDependents: readonly PackageDeclaredDependent[],
  activeSourceConsumers: readonly string[],
  hasSourceRead: boolean,
  externalEvidence: readonly PackageRetirementProofEvidenceInput[],
): readonly PackageRetirementProofEvidence[] {
  const external = new Map<PackageRetirementProofKind, PackageRetirementProofEvidenceInput>();
  for (const item of externalEvidence) external.set(item.kind, item);

  return Object.freeze(obligations.map((obligation) => {
    const observed = external.get(obligation.kind);
    if (observed !== undefined) {
      return proofEvidence(observed.kind, observed.surface, observed.state, observed.evidence, observed.gaps);
    }
    return inferredProofEvidence(
      pkg,
      location,
      obligation,
      activeRuntimeDependents,
      activeDeclaredDependents,
      activeSourceConsumers,
      hasSourceRead,
    );
  }));
}

function inferredProofEvidence(
  pkg: JSNodePackage,
  location: PackageDecommissionLocation | undefined,
  obligation: PackageRetirementProofObligation,
  activeRuntimeDependents: readonly string[],
  activeDeclaredDependents: readonly PackageDeclaredDependent[],
  activeSourceConsumers: readonly string[],
  hasSourceRead: boolean,
): PackageRetirementProofEvidence {
  if (obligation.kind === "role-proof") {
    return proofEvidence(obligation.kind, obligation.surface, "observed", [
      `workspace carrier loaded ${pkg.name} as ${pkg.layer} ${pkg.lifecycle}/${pkg.maturity}`,
      `public export count: ${pkg.exports.length}`,
    ], []);
  }
  if (obligation.kind === "workspace-membership") {
    return proofEvidence(obligation.kind, obligation.surface, "observed", [
      `${pkg.name} is present in the discovered workspace`,
      `package path: ${location?.packageDir ?? pkg.name}`,
    ], ["remove or update workspace membership during an actual retirement"]);
  }
  if (obligation.kind === "live-reference-scan") {
    const evidence = [
      activeRuntimeDependents.length === 0
        ? "no active runtime dependents in the workspace dependency graph"
        : `active runtime dependents: ${activeRuntimeDependents.join(", ")}`,
      activeDeclaredDependents.length === 0
        ? "no active declared dependents in package manifests"
        : `active declared dependents: ${activeDeclaredDependents.map((edge) => `${edge.package}:${edge.kind}`).join(", ")}`,
      activeSourceConsumers.length === 0
        ? "no active source consumers in the source consumption index"
        : `active source consumers: ${activeSourceConsumers.join(", ")}`,
    ];
    const gaps = hasSourceRead ? [] : ["source consumption index was not provided"];
    return proofEvidence(obligation.kind, obligation.surface, hasSourceRead ? "observed" : "requires-check", evidence, gaps);
  }
  return proofEvidence(obligation.kind, obligation.surface, "requires-check", [], [obligation.requirement]);
}

function proofObligation(
  kind: PackageRetirementProofKind,
  surface: string,
  requirement: string,
): PackageRetirementProofObligation {
  return Object.freeze({ kind, surface, requirement });
}

function proofEvidence(
  kind: PackageRetirementProofKind,
  surface: string,
  state: PackageRetirementProofEvidenceState,
  evidence: readonly string[],
  gaps: readonly string[],
): PackageRetirementProofEvidence {
  return Object.freeze({
    kind,
    surface,
    state,
    evidence: Object.freeze([...evidence]),
    gaps: Object.freeze([...gaps]),
  });
}

function isIsland(
  pkg: JSNodePackage,
  runtimeDependents: readonly string[],
  declaredDependents: readonly PackageDeclaredDependent[],
  sourceConsumers: readonly string[],
  hasSourceRead: boolean,
): boolean {
  return pkg.lifecycle === "active" &&
    pkg.layer === "lib" &&
    hasPackageCodeSurface(pkg) &&
    pkg.manifest.bins.length === 0 &&
    runtimeDependents.length === 0 &&
    declaredDependents.length === 0 &&
    (!hasSourceRead || sourceConsumers.length === 0);
}

function hasPackageCodeSurface(pkg: JSNodePackage): boolean {
  return pkg.exports.length > 0 ||
    pkg.dependencies.length > 0 ||
    pkg.manifest.scripts.length > 0 ||
    pkg.manifest.bins.length > 0;
}

function candidateBlockers(
  pkg: JSNodePackage,
  core: ReadonlySet<string>,
  activeRuntimeDependents: readonly string[],
  activeDeclaredDependents: readonly PackageDeclaredDependent[],
  activeSourceConsumers: readonly string[],
  coarseSourceConsumers: readonly string[],
  consumption: ConsumptionIndex | undefined,
): string[] {
  const blockers: string[] = [];
  if (core.has(pkg.name)) blockers.push("core-package");
  for (const name of activeRuntimeDependents) blockers.push(`active-runtime-dependent:${name}`);
  for (const edge of activeDeclaredDependents) {
    blockers.push(`active-declared-dependent:${edge.package}:${edge.kind}`);
  }
  for (const name of activeSourceConsumers) blockers.push(`active-source-consumer:${name}`);
  for (const name of coarseSourceConsumers) blockers.push(`coarse-source-consumer:${name}`);
  if (consumption === undefined) blockers.push(SOURCE_DEMAND_UNKNOWN);
  return sorted(blockers);
}

function classifyReadiness(
  pkg: JSNodePackage,
  core: ReadonlySet<string>,
  blockers: readonly string[],
  activeRuntimeDependents: readonly string[],
  activeDeclaredDependents: readonly PackageDeclaredDependent[],
  activeSourceConsumers: readonly string[],
  markers: readonly string[],
): DecommissionReadiness {
  if (core.has(pkg.name)) return "held";
  if (
    activeRuntimeDependents.length > 0 ||
    activeDeclaredDependents.length > 0 ||
    activeSourceConsumers.length > 0 ||
    blockers.includes(SOURCE_DEMAND_UNKNOWN)
  ) {
    return "blocked";
  }
  if (hasPackageLevelSignal(pkg, markers)) return "ready-to-prove";
  return "investigate";
}

function nextEvidenceFor(
  readiness: DecommissionReadiness,
  hasSourceRead: boolean,
  hasPackage: boolean,
): readonly string[] {
  const next = new Set<string>();
  if (!hasSourceRead) next.add("rerun with source consumption enabled before claiming non-use");
  if (!hasPackage) next.add("confirm the package is still present in the active workspace");
  if (readiness === "held") {
    next.add("treat as upstream architecture work, not ordinary retirement");
  } else {
    for (const evidence of RETIREMENT_EVIDENCE) next.add(evidence);
  }
  return Object.freeze([...next]);
}

function compareCandidate(a: PackageDecommissionCandidate, b: PackageDecommissionCandidate): number {
  const readinessRank: Readonly<Record<DecommissionReadiness, number>> = {
    "ready-to-prove": 0,
    blocked: 1,
    investigate: 2,
    held: 3,
  };
  return readinessRank[a.readiness] - readinessRank[b.readiness] ||
    a.activeRuntimeDependents.length - b.activeRuntimeDependents.length ||
    a.activeSourceConsumers.length - b.activeSourceConsumers.length ||
    a.package.localeCompare(b.package);
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function sortedDeclaredDependents(values: Iterable<PackageDeclaredDependent>): readonly PackageDeclaredDependent[] {
  return Object.freeze([...values].sort((a, b) =>
    a.package.localeCompare(b.package) ||
    a.kind.localeCompare(b.kind) ||
    a.range.localeCompare(b.range)
  ));
}
