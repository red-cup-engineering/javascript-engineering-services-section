/**
 * build-order — in what order do the workspace's packages build?
 *
 * The plainest question a monorepo raises and the one the role/spectral views
 * never answer: a package can be built only once everything it depends on is
 * built. That is a topological sort of the internal dependency graph, grouped
 * into tiers — tier 0 (no internal dependencies) builds first, each later tier
 * depends only on earlier ones, so every tier could build in parallel. When the
 * graph has a cycle the packages in it cannot be linearly ordered; they are
 * reported as `unordered` rather than silently dropped.
 *
 * Pure over the dependency graph; no I/O. Edge convention: `from` depends on
 * `to` (dependent → dependency).
 */
import type { WorkspaceDependencyGraph } from "../graph.mts";
import { jsNodeFact, jsNodeObservation, type Observation, type UtteranceCarrier } from "../../facts.mts";

/** The build order of the workspace: dependency-respecting tiers. */
export interface BuildOrder {
  readonly kind: "jsnode.build-order";
  readonly term: string;
  /** Tiers, earliest first. Every package in tier *k* depends only on packages
   *  in tiers `< k`; a tier's members have no dependency on one another, so they
   *  could build in parallel. Each tier is sorted by name. */
  readonly tiers: readonly (readonly string[])[];
  /** The flat order (tier-major, name-sorted within a tier) — a valid serial
   *  build sequence. */
  readonly order: readonly string[];
  readonly tierCount: number;
  /** The widest tier's size — the build's maximum parallelism. */
  readonly maxWidth: number;
  /** True when every package was placed — i.e. the graph is acyclic. */
  readonly acyclic: boolean;
  /** Packages that could not be ordered because they sit in (or below) a cycle.
   *  Empty iff `acyclic`. */
  readonly unordered: readonly string[];
  readonly utterances: readonly UtteranceCarrier[];
  readonly observation: Observation;
}

/** Topologically tier the internal dependency graph (Kahn's algorithm by
 *  layers). A package enters a tier once all its dependencies have entered an
 *  earlier one. */
export function buildOrder(graph: WorkspaceDependencyGraph): BuildOrder {
  const names = graph.nodes.map((n) => n.name);
  // outstanding[X] = number of X's dependencies not yet placed.
  const outstanding = new Map<string, number>();
  // dependents[Y] = packages that depend on Y (to decrement when Y is placed).
  const dependents = new Map<string, string[]>();
  for (const name of names) {
    outstanding.set(name, 0);
    dependents.set(name, []);
  }
  for (const e of graph.edges) {
    // Only count edges between known nodes (graph.edges are already internal).
    if (!outstanding.has(e.from) || !outstanding.has(e.to)) continue;
    outstanding.set(e.from, (outstanding.get(e.from) ?? 0) + 1);
    dependents.get(e.to)!.push(e.from);
  }

  const tiers: string[][] = [];
  let frontier = names.filter((n) => (outstanding.get(n) ?? 0) === 0).sort();
  let placed = 0;
  while (frontier.length > 0) {
    tiers.push(frontier);
    placed += frontier.length;
    const next: string[] = [];
    for (const y of frontier) {
      for (const x of dependents.get(y) ?? []) {
        const rem = (outstanding.get(x) ?? 0) - 1;
        outstanding.set(x, rem);
        if (rem === 0) next.push(x);
      }
    }
    frontier = next.sort();
  }

  const unordered = names.filter((n) => (outstanding.get(n) ?? 0) > 0).sort();
  const order = tiers.flat();
  const term = `jsnode.build-order.${graph.term}`;
  const frozenTiers = Object.freeze(tiers.map((t) => Object.freeze(t)));
  const frozenOrder = Object.freeze(order);
  const frozenUnordered = Object.freeze(unordered);
  const utterances = Object.freeze([
    jsNodeFact(term, "jsnode.build-order.for-graph", graph.term),
    jsNodeFact(term, "jsnode.build-order.acyclic", placed === names.length),
    jsNodeFact(term, "jsnode.build-order.tier-count", tiers.length),
    ...frozenOrder.map((name, index) => jsNodeFact(term, "jsnode.build-order.package", { name, index })),
    ...frozenTiers.flatMap((tier, tierIndex) =>
      tier.map((name) => jsNodeFact(term, "jsnode.build-order.tier-member", { tier: tierIndex, package: name }))
    ),
    ...frozenUnordered.map((name) => jsNodeFact(term, "jsnode.build-order.unordered", name)),
  ]);
  return {
    kind: "jsnode.build-order",
    term,
    tiers: frozenTiers,
    order: frozenOrder,
    tierCount: tiers.length,
    maxWidth: tiers.reduce((m, t) => Math.max(m, t.length), 0),
    acyclic: placed === names.length,
    unordered: frozenUnordered,
    utterances,
    observation: jsNodeObservation(utterances),
  };
}
