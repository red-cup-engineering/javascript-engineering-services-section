/**
 * Node.js packages as relational fact carriers.
 *
 * A Node.js package occupies a position in a layered workspace (lib, apps,
 * services, sites, ops). Its coordinates are: the layer it inhabits, the
 * subpath exports it publishes, and the packages it depends on. Each
 * coordinate is a relational utterance on the meme floor. Domain apps such as
 * @emsenn/jsnode-ick settle those utterances into topology projections.
 *
 * This library models knowledge ABOUT Node packages. A JSNodePackage's
 * coordinates admit onto the meme floor as utterances. Filesystem reading lives
 * in the workspace package reader; this module keeps the pure package and
 * workspace carriers.
 */
import {
  mark,
  utterance,
  type UtteranceCarrier,
} from "@emsenn/relating";
import { jsNodeFact, jsNodeObservation, type Observation } from "../facts.mts";
import { typeCatalog, type JsType, type JsFn, type TypeCatalog } from "../typing/algebra/index.mts";

export type { UtteranceCarrier, Observation };
export { jsNodeFact, jsNodeObservation };
// The type category is defined once, in @emsenn/javascript-algebra. jsnode
// consumes it and projects names onto the meme floor; it does not redefine it.
export type { JsType, JsFn, TypeCatalog };

// ---------- layer vocabulary ----------

export type JSNodeLayer = "lib" | "apps" | "services" | "sites" | "ops";

export const JSNODE_LAYERS: readonly JSNodeLayer[] =
  Object.freeze(["lib", "apps", "services", "sites", "ops"] as const);

// ---------- term constructors ----------

export function packageTerm(name: string): string {
  return `jsnode.package.${name}`;
}

export function layerTerm(layer: JSNodeLayer): string {
  return `jsnode.layer.${layer}`;
}

export function exportTerm(pkg: string, subpath: string): string {
  return `jsnode.export.${pkg}:${subpath}`;
}

export function tagTerm(tag: string): string {
  return `jsnode.tag.${tag}`;
}

/** A type's canonical identity is its defining package and name. A type used
 *  as a function's domain/codomain but defined outside the workspace (a Node
 *  builtin, an external dependency, a structural type) has no defining package;
 *  it is addressed under the reserved `extern` package so the morphism cells
 *  still settle against a stable term. */
export function typeTerm(pkg: string, name: string): string {
  return `jsnode.type.${pkg}:${name}`;
}

export function typeKindTerm(kind: JsType["kind"]): string {
  return `jsnode.type-kind.${kind}`;
}

export function externTypeTerm(name: string): string {
  return typeTerm("extern", name);
}

export function functionTerm(pkg: string, name: string): string {
  return `jsnode.function.${pkg}:${name}`;
}

// ---------- predicate constructors ----------

export function inLayerPredicate(): string { return "jsnode.in-layer"; }
export function hasExportPredicate(): string { return "jsnode.has-export"; }
export function dependsOnPredicate(): string { return "jsnode.depends-on"; }
export function hasTagPredicate(): string { return "jsnode.has-tag"; }
export function hasVersionPredicate(): string { return "jsnode.has-version"; }
export function hasDescriptionPredicate(): string { return "jsnode.has-description"; }
export function hasLifecyclePredicate(): string { return "jsnode.has-lifecycle"; }
export function hasMaturityPredicate(): string { return "jsnode.has-maturity"; }
export function hasLicensePredicate(): string { return "jsnode.has-license"; }
export function hasPrivatePredicate(): string { return "jsnode.has-private"; }
export function hasModuleTypePredicate(): string { return "jsnode.has-module-type"; }
export function hasEnginePredicate(): string { return "jsnode.has-engine"; }
export function hasScriptPredicate(): string { return "jsnode.has-script"; }
export function hasBinPredicate(): string { return "jsnode.has-bin"; }
export function hasRepositoryPredicate(): string { return "jsnode.has-repository"; }
export function hasHomepagePredicate(): string { return "jsnode.has-homepage"; }
export function hasDependencyRangePredicate(): string { return "jsnode.has-dependency-range"; }
export function hasDependencyKindPredicate(): string { return "jsnode.has-dependency-kind"; }
export function hasTypePredicate(): string { return "jsnode.has-type"; }
export function hasTypeKindPredicate(): string { return "jsnode.has-type-kind"; }
export function hasFunctionPredicate(): string { return "jsnode.has-function"; }
/** A function morphism's domain: `function --has-domain--> type`. A function of
 *  several parameters utters one domain cell per parameter type. */
export function hasDomainPredicate(): string { return "jsnode.has-domain"; }
/** A function morphism's codomain: `function --has-codomain--> type`. */
export function hasCodomainPredicate(): string { return "jsnode.has-codomain"; }
/** A specialization morphism in the type lattice: `subtype --specializes--> supertype`. */
export function specializesPredicate(): string { return "jsnode.specializes"; }

// ---------- type-flow (composition) predicates ----------
//
// The one-hop composition consequences of `has-domain`/`has-codomain`, read
// across packages. Where `has-domain`/`has-codomain` relate a *function* to its
// argument and result *types*, these relate two *types* directly: type A
// transforms-to type B when some function carries A in its domain and B as its
// codomain — the edge of the workspace's type-flow category. Composition only
// type-checks when codomain meets domain (identity-mismatch-is-the-type-error),
// so these edges are exactly the valid one-step compositions. Factual: a direct
// consequence of declared signatures, no contrary.

/** A composition edge between two types: `A --transforms-to--> B` when some
 *  function takes A (in its domain) and produces B (its codomain). */
export function transformsToPredicate(): string { return "jsnode.transforms-to"; }
/** A type names a function that produces it: `type --produced-by--> function`
 *  (the function's codomain is this type). The arrows-in half of the type's
 *  hom-functor presentation. */
export function producedByPredicate(): string { return "jsnode.produced-by"; }
/** A type names a function that consumes it: `type --consumed-by--> function`
 *  (the type appears in the function's domain). The arrows-out half. */
export function consumedByPredicate(): string { return "jsnode.consumed-by"; }

// ---------- consumption (demand) predicates ----------
//
// The dual of `has-function`/`has-type`. Where a provider package *has* a
// function, a consumer package *uses* it. Crucially, a consumption edge settles
// against the very same `functionTerm`/`typeTerm` the provider's export side
// mints — so on the meme floor supply and demand meet at one term, and "does
// anything use `jsnode.function.X:foo`?" is read directly off its in-edges.

/** A consumer names a specific provider function: `consumer --uses-function--> function`. */
export function usesFunctionPredicate(): string { return "jsnode.uses-function"; }
/** A consumer names a specific provider type/class: `consumer --uses-type--> type`. */
export function usesTypePredicate(): string { return "jsnode.uses-type"; }
/** A consumer reaches a provider package without naming a symbol (namespace
 *  import, star re-export, dynamic import): `consumer --uses-package--> package`.
 *  This is the coarse mode: it proves the package is reached but leaves which of
 *  its symbols are used *indeterminate*, so it can never witness non-use. */
export function usesPackagePredicate(): string { return "jsnode.uses-package"; }

// ---------- type-category projection ----------

/** Project a `JsType`/`JsFn` type *name* onto its meme-floor term. A name
 *  declared in this package's own catalog mints a package-scoped `typeTerm`; a
 *  name used but not declared here (a Node builtin, an external dependency, a
 *  primitive or structural type) is addressed under the reserved `extern`
 *  package so its morphism cells still settle against a stable term. This is
 *  the one place names cross onto the floor; the codec reuses it so there is a
 *  single name→term resolution in the workspace. */
export function resolveTypeTerm(pkgName: string, catalog: TypeCatalog, typeName: string): string {
  return catalog.types.some((t) => t.name === typeName)
    ? typeTerm(pkgName, typeName)
    : externTypeTerm(typeName);
}

// ---------- JSNodePackage carrier ----------

/** A package's lifecycle — the team's *intent*, read from its keywords. This is
 *  about disposition, not release maturity (that is {@link PackageMaturity}):
 *   - `active`      — the default: a live part of the ecosystem.
 *   - `maintenance` — kept working but not developed (keyword `maintenance` or
 *                     `legacy`): bug-fixes only, no new surface expected.
 *   - `deprecated`  — discouraged, but not yet fully marked out of the live
 *                     package membrane.
 *   - `decommissioned` — on the way out ("we're trying to get rid of this"). Held
 *                     out of the default/active picture and surfaced as its own
 *                     set; anything still depending on it is migration debt.
 *   - `abandoned`   — intentionally frozen ("should stay stable regardless of
 *                     what else changes"). Not junk — a stable contract, exempt
 *                     from the consistency/drift pressure applied to active
 *                     packages.
 *  Precedence when several keywords are present: decommissioned > deprecated > abandoned >
 *  maintenance — a package being removed is no longer a contract to depend on. */
export type PackageLifecycle = "active" | "maintenance" | "deprecated" | "decommissioned" | "abandoned";

/** The lifecycle keywords recognized, by the status they imply. */
const LIFECYCLE_KEYWORDS: ReadonlyArray<readonly [PackageLifecycle, readonly string[]]> = [
  ["decommissioned", ["decommissioned"]],
  ["deprecated", ["deprecated"]],
  ["abandoned", ["abandoned"]],
  ["maintenance", ["maintenance", "legacy"]],
];

/** Derive a package's lifecycle from its keywords (case-insensitive). Pure. */
export function packageLifecycle(tags: readonly string[]): PackageLifecycle {
  const set = new Set(tags.map((t) => t.toLowerCase()));
  for (const [status, keywords] of LIFECYCLE_KEYWORDS) {
    if (keywords.some((k) => set.has(k))) return status;
  }
  return "active";
}

/** A package's maturity — its *release stage*, inferred from the SemVer version
 *  (a keyword override wins, for the rare package that disagrees with its number):
 *   - `experimental` — `0.0.0`: nothing released, a placeholder/prototype.
 *   - `alpha`        — `0.0.x` (x>0): early development, surface churns freely.
 *   - `beta`         — `0.x.y` (x>0): pre-1.0, API may still break (SemVer §4).
 *   - `stable`       — `>=1.0.0`: a released, SemVer-governed surface.
 *  A prerelease tag (`-alpha`/`-beta`/`-rc`) or an explicit keyword
 *  (`experimental`/`alpha`/`beta`/`stable`) overrides the numeric inference. */
export type PackageMaturity = "experimental" | "alpha" | "beta" | "stable";

const MATURITY_KEYWORDS: readonly PackageMaturity[] = ["experimental", "alpha", "beta", "stable"];

/** Derive a package's maturity from its version (and any overriding keyword). Pure. */
export function packageMaturity(version: string, tags: readonly string[] = []): PackageMaturity {
  const set = new Set(tags.map((t) => t.toLowerCase()));
  for (const m of MATURITY_KEYWORDS) if (set.has(m)) return m;
  const [core, pre] = version.split("-", 2);
  if (pre !== undefined) {
    if (/^alpha/i.test(pre)) return "alpha";
    if (/^(beta|rc)/i.test(pre)) return "beta";
  }
  const [maj = 0, min = 0, pat = 0] = (core ?? "").split(".").map((n) => Number.parseInt(n, 10) || 0);
  if (maj >= 1) return "stable";
  if (min > 0) return "beta";
  if (pat > 0) return "alpha";
  return "experimental";
}

/** RDF term for a lifecycle status (`jsnode.lifecycle.<status>`). */
export function lifecycleTerm(lifecycle: PackageLifecycle): string {
  return `jsnode.lifecycle.${lifecycle}`;
}

/** RDF term for a maturity stage (`jsnode.maturity.<stage>`). */
export function maturityTerm(maturity: PackageMaturity): string {
  return `jsnode.maturity.${maturity}`;
}

export function privateTerm(value: boolean): string {
  return `jsnode.private.${value ? "true" : "false"}`;
}

export function moduleTypeTerm(value: PackageManifestFacts["moduleType"]): string {
  return value === null ? "jsnode.module-type.unstated" : `jsnode.module-type.${value}`;
}

export function licenseTerm(value: string | null): string {
  return value === null ? "jsnode.license.unstated" : `jsnode.license.${value}`;
}

export function dependencyKindTerm(kind: DependencyKind): string {
  return `jsnode.dependency-kind.${kind}`;
}

/** Which package.json field a dependency was declared in. The graph reads only
 *  `runtime`; the normie tools (drift, consistency) read every kind. */
export type DependencyKind = "runtime" | "dev" | "peer" | "optional";

/** One dependency exactly as declared: its name, the SemVer range string, and
 *  which dependency field it came from. The version range is the fact the bare
 *  `dependencies` name-list throws away — and the fact drift analysis needs. */
export interface PackageDependency {
  readonly name: string;
  readonly range: string;
  readonly kind: DependencyKind;
}

/** The manifest facts every Node package carries beyond its workspace
 *  coordinates. Each field is projected onto Mark/Utterance carriers by
 *  `manifestFactUtterances`; the object exists as a convenient read surface
 *  over the same utterance log, not as an independent data model. */
export interface PackageManifestFacts {
  /** SPDX license id, or null when the manifest declares none. */
  readonly license: string | null;
  /** The `private` flag (publishability). */
  readonly private: boolean;
  /** The `type` field: ES modules vs CommonJS, or null when unstated. */
  readonly moduleType: "module" | "commonjs" | null;
  /** The `engines` map (notably `node`), empty when unstated. */
  readonly engines: Readonly<Record<string, string>>;
  /** The names of the `scripts` a package defines, sorted. */
  readonly scripts: readonly string[];
  /** The package.json `bin` commands a package exposes, sorted. */
  readonly bins: readonly string[];
  /** A repository URL (normalized to a string), or null. */
  readonly repository: string | null;
  /** A homepage URL, or null. */
  readonly homepage: string | null;
}

export interface JSNodePackage {
  readonly kind: "jsnode.package";
  readonly term: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly layer: JSNodeLayer;
  /** The package's `keywords` (the meme-floor tags). `keywords` is the plain
   *  alias readers expect; the two are the same list. */
  readonly tags: readonly string[];
  /** The lifecycle status read from the keywords — the team's intent. */
  readonly lifecycle: PackageLifecycle;
  /** The release maturity inferred from the version (keyword-overridable). */
  readonly maturity: PackageMaturity;
  readonly exports: readonly string[];
  /** Runtime dependency *names* — the internal dependency graph reads this. */
  readonly dependencies: readonly string[];
  /** Every declared dependency across all kinds, with its version range — the
   *  superset of `dependencies` the drift/consistency tools read. */
  readonly deps: readonly PackageDependency[];
  /** The plain manifest facts (license, engines, scripts, …). */
  readonly manifest: PackageManifestFacts;
  readonly api?: TypeCatalog;
  readonly serve?: Readonly<Record<string, unknown>>;
  readonly utterances: readonly UtteranceCarrier[];
  readonly observation: Observation;
}

/** Admission shape for a package before it becomes a carrier. `jsNodePackage`
 *  normalizes these domain values into the returned package's utterance log:
 *  package coordinates, manifest facts, dependency range/kind facts, and API
 *  surface all descend to Marks in Utterances before settlement. */
export interface JSNodePackageInput {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly layer: JSNodeLayer;
  readonly exports: readonly string[];
  readonly dependencies: readonly string[];
  readonly tags?: readonly string[];
  /** Every declared dependency with its range and kind. When omitted, `deps` is
   *  synthesized from `dependencies` as runtime deps with an unknown ("*")
   *  range, so older callers still get a coherent (if range-less) list. */
  readonly deps?: readonly PackageDependency[];
  readonly license?: string | null;
  readonly private?: boolean;
  readonly moduleType?: "module" | "commonjs" | null;
  readonly engines?: Readonly<Record<string, string>>;
  readonly scripts?: readonly string[];
  readonly bins?: readonly string[];
  readonly repository?: string | null;
  readonly homepage?: string | null;
  readonly api?: TypeCatalog;
  readonly serve?: Readonly<Record<string, unknown>>;
}

function apiUtterances(pkgName: string, pkgTerm: string, api: TypeCatalog): UtteranceCarrier[] {
  const out: UtteranceCarrier[] = [];
  for (const type of api.types) {
    const term = typeTerm(pkgName, type.name);
    out.push(utterance(
      mark({ subject: pkgTerm, object: term }),
      mark(hasTypePredicate()),
    ));
    out.push(utterance(
      mark({ subject: term, object: typeKindTerm(type.kind) }),
      mark(hasTypeKindPredicate()),
    ));
  }
  for (const fn of api.functions) {
    const fnTerm = functionTerm(pkgName, fn.name);
    out.push(utterance(
      mark({ subject: pkgTerm, object: fnTerm }),
      mark(hasFunctionPredicate()),
    ));
    // domain/codomain are type *names*; resolve each onto the floor here.
    for (const domain of fn.domain) {
      out.push(utterance(
        mark({ subject: fnTerm, object: resolveTypeTerm(pkgName, api, domain) }),
        mark(hasDomainPredicate()),
      ));
    }
    if (fn.codomain !== undefined) {
      out.push(utterance(
        mark({ subject: fnTerm, object: resolveTypeTerm(pkgName, api, fn.codomain) }),
        mark(hasCodomainPredicate()),
      ));
    }
  }
  // the type lattice: each declared subtype edge is a specialization morphism.
  for (const [sub, sup] of api.subtypes) {
    out.push(utterance(
      mark({
        subject: resolveTypeTerm(pkgName, api, sub),
        object: resolveTypeTerm(pkgName, api, sup),
      }),
      mark(specializesPredicate()),
    ));
  }
  return out;
}

export function jsNodePackage(input: JSNodePackageInput): JSNodePackage {
  const term = packageTerm(input.name);
  const tags = input.tags ?? [];
  const deps: readonly PackageDependency[] = input.deps
    ? input.deps.map((d) => Object.freeze({ name: d.name, range: d.range, kind: d.kind }))
    : input.dependencies.map((name) => Object.freeze({ name, range: "*", kind: "runtime" as const }));
  const manifest: PackageManifestFacts = Object.freeze({
    license: input.license ?? null,
    private: input.private ?? false,
    moduleType: input.moduleType ?? null,
    engines: Object.freeze({ ...(input.engines ?? {}) }),
    scripts: Object.freeze([...(input.scripts ?? [])].sort()),
    bins: Object.freeze([...(input.bins ?? [])].sort()),
    repository: input.repository ?? null,
    homepage: input.homepage ?? null,
  });
  const lifecycle = packageLifecycle(tags);
  const maturity = packageMaturity(input.version, tags);
  const utterances: UtteranceCarrier[] = [
    utterance(
      mark({ subject: term, object: layerTerm(input.layer) }),
      mark(inLayerPredicate()),
    ),
    ...tags.map((tag) =>
      utterance(
        mark({ subject: term, object: tagTerm(tag) }),
        mark(hasTagPredicate()),
      )
    ),
    ...input.exports.map((sub) =>
      utterance(
        mark({ subject: term, object: exportTerm(input.name, sub) }),
        mark(hasExportPredicate()),
      )
    ),
    ...input.dependencies.map((dep) =>
      utterance(
        mark({ subject: term, object: packageTerm(dep) }),
        mark(dependsOnPredicate()),
      )
    ),
    ...manifestFactUtterances(term, input.version, input.description, lifecycle, maturity, manifest, deps),
    ...(input.api !== undefined ? apiUtterances(input.name, term, input.api) : []),
  ];
  const frozenUtterances = Object.freeze(utterances);
  return Object.freeze({
    kind: "jsnode.package" as const,
    term,
    name: input.name,
    version: input.version,
    description: input.description,
    layer: input.layer,
    tags: Object.freeze([...tags]),
    lifecycle,
    maturity,
    exports: Object.freeze([...input.exports]),
    dependencies: Object.freeze([...input.dependencies]),
    deps: Object.freeze(deps),
    manifest,
    ...(input.api !== undefined ? { api: typeCatalog(input.api) } : {}),
    ...(input.serve !== undefined ? { serve: Object.freeze({ ...input.serve }) } : {}),
    utterances: frozenUtterances,
    observation: jsNodeObservation(frozenUtterances),
  });
}

function manifestFactUtterances(
  pkgTerm: string,
  version: string,
  description: string,
  lifecycle: PackageLifecycle,
  maturity: PackageMaturity,
  manifest: PackageManifestFacts,
  deps: readonly PackageDependency[],
): UtteranceCarrier[] {
  const out: UtteranceCarrier[] = [
    jsNodeFact(pkgTerm, hasVersionPredicate(), version),
    jsNodeFact(pkgTerm, hasDescriptionPredicate(), description),
    jsNodeFact(pkgTerm, hasLifecyclePredicate(), lifecycleTerm(lifecycle)),
    jsNodeFact(pkgTerm, hasMaturityPredicate(), maturityTerm(maturity)),
    jsNodeFact(pkgTerm, hasLicensePredicate(), licenseTerm(manifest.license)),
    jsNodeFact(pkgTerm, hasPrivatePredicate(), privateTerm(manifest.private)),
    jsNodeFact(pkgTerm, hasModuleTypePredicate(), moduleTypeTerm(manifest.moduleType)),
    jsNodeFact(pkgTerm, hasRepositoryPredicate(), manifest.repository),
    jsNodeFact(pkgTerm, hasHomepagePredicate(), manifest.homepage),
  ];
  for (const [name, range] of Object.entries(manifest.engines)) {
    out.push(jsNodeFact(pkgTerm, hasEnginePredicate(), { name, range }));
  }
  for (const script of manifest.scripts) {
    out.push(jsNodeFact(pkgTerm, hasScriptPredicate(), script));
  }
  for (const bin of manifest.bins) {
    out.push(jsNodeFact(pkgTerm, hasBinPredicate(), bin));
  }
  for (const dep of deps) {
    const dependencyDeclaration = { package: pkgTerm, dependency: packageTerm(dep.name) };
    out.push(jsNodeFact(dependencyDeclaration, hasDependencyRangePredicate(), dep.range));
    out.push(jsNodeFact(dependencyDeclaration, hasDependencyKindPredicate(), dependencyKindTerm(dep.kind)));
  }
  return out;
}

// ---------- JSNodeWorkspace carrier ----------

export interface JSNodeWorkspace {
  readonly kind: "jsnode.workspace";
  readonly root: string;
  readonly packages: readonly JSNodePackage[];
  readonly utterances: readonly UtteranceCarrier[];
  readonly observation: Observation;
}

export function jsNodeWorkspace(
  root: string,
  packages: readonly JSNodePackage[],
): JSNodeWorkspace {
  const utterances: UtteranceCarrier[] = packages.flatMap((p) => [...p.utterances]);
  const frozenUtterances = Object.freeze(utterances);
  return Object.freeze({
    kind: "jsnode.workspace" as const,
    root,
    packages: Object.freeze([...packages]),
    utterances: frozenUtterances,
    observation: jsNodeObservation(frozenUtterances),
  });
}

// ---------- consumption edges ----------

/** A resolved consumption: `consumer` uses something the workspace provides.
 *  `kind` selects the term the edge settles against — a named provider function
 *  (`function`) or type/class (`type`), or the provider package itself
 *  (`package`) for a coarse reach that names no symbol. */
export interface ConsumptionEdge {
  readonly consumer: string;
  readonly provider: string;
  readonly kind: "function" | "type" | "package";
  /** The provider symbol name; required for `function`/`type`, unused for `package`. */
  readonly name?: string;
}

/** Mint the meme-floor utterance for one consumption edge. The object term is
 *  the same `functionTerm`/`typeTerm`/`packageTerm` the provider already utters,
 *  so demand and supply settle onto a shared term — this is the one place the
 *  consumer side resolves a name onto the floor. */
export function consumptionUtterance(edge: ConsumptionEdge): UtteranceCarrier {
  const subject = packageTerm(edge.consumer);
  if (edge.kind === "function") {
    return utterance(
      mark({ subject, object: functionTerm(edge.provider, edge.name ?? "") }),
      mark(usesFunctionPredicate()),
    );
  }
  if (edge.kind === "type") {
    return utterance(
      mark({ subject, object: typeTerm(edge.provider, edge.name ?? "") }),
      mark(usesTypePredicate()),
    );
  }
  return utterance(
    mark({ subject, object: packageTerm(edge.provider) }),
    mark(usesPackagePredicate()),
  );
}

export function consumptionUtterances(
  edges: readonly ConsumptionEdge[],
): readonly UtteranceCarrier[] {
  return edges.map(consumptionUtterance);
}

export interface JSNodeUtteranceFact {
  readonly subject: unknown;
  readonly predicate: unknown;
  readonly object: unknown;
  readonly utterance: UtteranceCarrier;
}

export function jsNodeUtteranceFact(uttered: UtteranceCarrier): JSNodeUtteranceFact | undefined {
  const tokenValue = uttered.token.mark.value;
  const predicate = uttered.claim.mark.value;
  if (
    tokenValue !== null &&
    typeof tokenValue === "object" &&
    "subject" in tokenValue &&
    "object" in tokenValue
  ) {
    const cell = tokenValue as { readonly subject: unknown; readonly object: unknown };
    return Object.freeze({ subject: cell.subject, predicate, object: cell.object, utterance: uttered });
  }
  return undefined;
}

export function packageNameOfTerm(term: unknown): string | undefined {
  if (typeof term !== "string") return undefined;
  const prefix = "jsnode.package.";
  return term.startsWith(prefix) ? term.slice(prefix.length) : undefined;
}

export function jsNodeUtteranceObjects(
  utterances: readonly UtteranceCarrier[],
  subject: unknown,
  predicate: string,
): readonly unknown[] {
  const out: unknown[] = [];
  for (const uttered of utterances) {
    const fact = jsNodeUtteranceFact(uttered);
    if (fact !== undefined && fact.subject === subject && fact.predicate === predicate) out.push(fact.object);
  }
  return Object.freeze(out);
}

export function packageDependencyNamesFromUtterances(
  packageName: string,
  utterances: readonly UtteranceCarrier[],
): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const object of jsNodeUtteranceObjects(utterances, packageTerm(packageName), dependsOnPredicate())) {
    const dependency = packageNameOfTerm(object);
    if (dependency === undefined || seen.has(dependency)) continue;
    seen.add(dependency);
    out.push(dependency);
  }
  return Object.freeze(out);
}
