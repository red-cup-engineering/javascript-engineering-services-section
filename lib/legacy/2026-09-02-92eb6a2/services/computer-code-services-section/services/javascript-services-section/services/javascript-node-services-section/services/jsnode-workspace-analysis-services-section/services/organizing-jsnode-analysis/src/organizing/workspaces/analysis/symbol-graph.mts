/**
 * symbol-graph — one package's API surface as a categorical / systems diagram.
 *
 * A package's API carrier utters exported types, functions, function domain and
 * codomain cells, and subtype cells. This reads that package's own utterance
 * evidence into a graph in the "objects and morphisms" / Petri-net reading:
 *
 *   - **objects** — the package's exported *types*: classes, interfaces, type
 *     aliases. Each is a node.
 *   - **morphisms** — the package's exported *functions*. Each is a node too (a
 *     transition), so a multi-argument function `f: A × B → C` is honest: arcs
 *     run *into* it from each domain type that is itself a package type, and one
 *     arc runs *out* to the codomain type. (A function over only foreign types —
 *     `string`, `Promise`, `Error` — is a node with no internal arcs.)
 *   - **subtyping** — `class extends`/`interface extends` becomes an `extends`
 *     edge between two type objects.
 *
 * Edges are internal-only, matching graph.mts's drop-external precedent: a
 * function returning `Error`, or extending a foreign base, simply draws no edge.
 * The result is the plain `{ nodes, edges }` a layout/renderer wants — a
 * projection of `JSNodePackage.utterances`, no filesystem, no rendering.
 */
import {
  functionTerm,
  hasCodomainPredicate,
  hasDomainPredicate,
  hasFunctionPredicate,
  hasTypeKindPredicate,
  hasTypePredicate,
  jsNodeUtteranceFact,
  jsNodeUtteranceObjects,
  packageTerm,
  specializesPredicate,
  type JSNodePackage,
} from "../../packages/carrier.mts";

export type SymbolNodeKind = "class" | "interface" | "type-alias" | "function";

export interface SymbolNode {
  /** Stable id within this graph (`type:Name` or `fn:name`). */
  readonly id: string;
  readonly name: string;
  readonly kind: SymbolNodeKind;
  /** For functions: a human signature `name(domain…) → codomain`. */
  readonly signature?: string;
}

/** param: a type flows *into* a function (it appears in the domain). returns: a
 *  function flows *out* to a type (its codomain). extends: a subtype relation
 *  between two type objects (`from` extends `to`). */
export type SymbolEdgeKind = "param" | "returns" | "extends";

export interface SymbolEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: SymbolEdgeKind;
}

export interface PackageSymbolGraph {
  readonly pkg: string;
  readonly nodes: readonly SymbolNode[];
  readonly edges: readonly SymbolEdge[];
  /** True when the package contributed any symbol at all. A package with no
   *  built `dist` yields an empty graph — callers distinguish "not built" from
   *  "genuinely empty surface" so they can show the right empty state. */
  readonly populated: boolean;
}

const SYMBOL_GRAPH_TYPE_KINDS = new Set<SymbolNodeKind>(["class", "interface", "type-alias"]);
const typeId = (name: string): string => `type:${name}`;
const fnId = (name: string): string => `fn:${name}`;
const TYPE_TERM_PREFIX = "jsnode.type.";
const FUNCTION_TERM_PREFIX = "jsnode.function.";
const TYPE_KIND_PREFIX = "jsnode.type-kind.";

interface TermRef {
  readonly pkg: string;
  readonly name: string;
}

function splitScopedTerm(term: unknown, prefix: string): TermRef | undefined {
  if (typeof term !== "string" || !term.startsWith(prefix)) return undefined;
  const body = term.slice(prefix.length);
  const split = body.lastIndexOf(":");
  if (split === -1) return undefined;
  return { pkg: body.slice(0, split), name: body.slice(split + 1) };
}

function typeKindOf(term: unknown): SymbolNodeKind | undefined {
  if (typeof term !== "string" || !term.startsWith(TYPE_KIND_PREFIX)) return undefined;
  const kind = term.slice(TYPE_KIND_PREFIX.length);
  return SYMBOL_GRAPH_TYPE_KINDS.has(kind as SymbolNodeKind) ? kind as SymbolNodeKind : undefined;
}

function internalTypeName(pkg: string, term: unknown): string | undefined {
  const ref = splitScopedTerm(term, TYPE_TERM_PREFIX);
  return ref?.pkg === pkg ? ref.name : undefined;
}

function internalFunctionName(pkg: string, term: unknown): string | undefined {
  const ref = splitScopedTerm(term, FUNCTION_TERM_PREFIX);
  return ref?.pkg === pkg ? ref.name : undefined;
}

/** Project one package carrier's API utterances onto its internal symbol graph. */
export function packageSymbolGraph(pkg: JSNodePackage): PackageSymbolGraph {
  const pkgTerm = packageTerm(pkg.name);
  const typeKind = new Map<string, SymbolNodeKind>();
  for (const term of jsNodeUtteranceObjects(pkg.utterances, pkgTerm, hasTypePredicate())) {
    const name = internalTypeName(pkg.name, term);
    if (name === undefined || typeKind.has(name)) continue;
    const kind = jsNodeUtteranceObjects(pkg.utterances, term, hasTypeKindPredicate())
      .map(typeKindOf)
      .find((value): value is SymbolNodeKind => value !== undefined);
    typeKind.set(name, kind ?? "type-alias");
  }

  interface FnInfo { readonly domain: readonly string[]; readonly codomain?: string }
  const fnInfo = new Map<string, FnInfo>();
  for (const term of jsNodeUtteranceObjects(pkg.utterances, pkgTerm, hasFunctionPredicate())) {
    const name = internalFunctionName(pkg.name, term);
    if (name === undefined || fnInfo.has(name)) continue;
    const domain = jsNodeUtteranceObjects(pkg.utterances, functionTerm(pkg.name, name), hasDomainPredicate())
      .map((type) => internalTypeName(pkg.name, type))
      .filter((value): value is string => value !== undefined);
    const codomain = jsNodeUtteranceObjects(pkg.utterances, functionTerm(pkg.name, name), hasCodomainPredicate())
      .map((type) => internalTypeName(pkg.name, type))
      .find((value): value is string => value !== undefined);
    fnInfo.set(name, codomain === undefined ? { domain } : { domain, codomain });
  }

  const nodes: SymbolNode[] = [];
  for (const [name, kind] of typeKind) nodes.push({ id: typeId(name), name, kind });
  for (const [name, info] of fnInfo) {
    const dom = info.domain.map((d) => d.replace(/\s+/g, " ").trim()).join(", ");
    const sig = `${name}(${dom})${info.codomain ? ` → ${info.codomain.replace(/\s+/g, " ").trim()}` : ""}`;
    nodes.push({ id: fnId(name), name, kind: "function", signature: sig });
  }

  // Edges, deduplicated by (from, to, kind).
  const seen = new Set<string>();
  const edges: SymbolEdge[] = [];
  const add = (from: string, to: string, kind: SymbolEdgeKind): void => {
    if (from === to) return;
    const key = `${from}|${to}|${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind });
  };

  for (const [name, info] of fnInfo) {
    for (const d of info.domain) if (typeKind.has(d)) add(typeId(d), fnId(name), "param");
    if (info.codomain && typeKind.has(info.codomain)) add(fnId(name), typeId(info.codomain), "returns");
  }
  for (const uttered of pkg.utterances) {
    const fact = jsNodeUtteranceFact(uttered);
    if (fact === undefined || fact.predicate !== specializesPredicate()) continue;
    const sub = internalTypeName(pkg.name, fact.subject);
    const sup = internalTypeName(pkg.name, fact.object);
    if (sub !== undefined && sup !== undefined && typeKind.has(sub) && typeKind.has(sup)) {
      add(typeId(sub), typeId(sup), "extends");
    }
  }

  return { pkg: pkg.name, nodes, edges, populated: nodes.length > 0 };
}
