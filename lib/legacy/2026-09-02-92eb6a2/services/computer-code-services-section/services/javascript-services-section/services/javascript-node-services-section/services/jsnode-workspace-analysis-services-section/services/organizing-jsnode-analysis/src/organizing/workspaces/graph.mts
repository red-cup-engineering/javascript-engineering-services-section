/**
 * graph — the workspace as a dependency DAG.
 *
 * `discoverWorkspace` reads every package and each one's declared runtime
 * `dependencies` (manifest deps, not dev). Those dependency lists name *all*
 * runtime deps, internal siblings and external npm packages alike. A package
 * DAG wants only the internal edges — an edge to `zod` is not part of our
 * shape and would hang an external leaf off the graph. So this projects the
 * workspace onto its own package-name set: nodes are the discovered packages,
 * edges are the dependency relations whose target is itself a discovered
 * package. Everything else (versions out of scope, npm leaves) is dropped.
 *
 * The result is the plain `{ nodes, edges }` a layout/renderer wants — pure
 * over a `JSNodeWorkspace`, no filesystem, no rendering. Edge direction is
 * dependent → dependency (`from` depends on `to`).
 */
import {
  packageDependencyNamesFromUtterances,
  packageTerm,
  type JSNodeLayer,
  type JSNodeWorkspace,
  type PackageLifecycle,
  type PackageMaturity,
  type UtteranceCarrier,
} from "../packages/carrier.mts";
import { jsNodeFact, jsNodeObservation, type Observation } from "../facts.mts";

/** One package as a graph node: its coordinates plus the internal-only subset
 *  of its dependencies (the same edges, denormalized onto the node for callers
 *  that walk node-first). */
export interface DependencyGraphNode {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly layer: JSNodeLayer;
  readonly tags: readonly string[];
  /** The team's lifecycle intent (active/maintenance/deprecated/decommissioned/abandoned). */
  readonly lifecycle: PackageLifecycle;
  /** The release maturity inferred from the version. */
  readonly maturity: PackageMaturity;
  /** Dependencies that are themselves workspace packages — external npm deps
   *  dropped. Same set as the `from === name` edges. */
  readonly dependencies: readonly string[];
}

/** A dependency edge, dependent → dependency: `from` declares `to` in its
 *  runtime `dependencies`, and both are workspace packages. */
export interface DependencyGraphEdge {
  readonly from: string;
  readonly to: string;
}

export interface WorkspaceDependencyGraph {
  readonly term: string;
  readonly nodes: readonly DependencyGraphNode[];
  readonly edges: readonly DependencyGraphEdge[];
  readonly utterances: readonly UtteranceCarrier[];
  readonly observation: Observation;
}

/** Projection controls for reading a neighbourhood from a settled workspace
 *  carrier. The graph nodes and edges are derived from `JSNodeWorkspace`
 *  utterances; these options only bound that read. */
export interface EgoGraphOptions {
  /** How many dependency hops below the focus to include. Default 1. */
  readonly downDepth?: number;
  /** How many dependent hops above the focus to include. Default 1. */
  readonly upDepth?: number;
}

/** The neighbourhood of one package as its own dependency graph: the focus
 *  package, the packages it depends on (down to `downDepth` hops), and the
 *  packages that depend on it (up to `upDepth` hops). Edges are kept only when
 *  both endpoints are in the neighbourhood, so the subgraph is closed and can be
 *  laid out and rendered by the same machinery as the whole-workspace DAG.
 *
 *  Returns an empty graph if `name` is not a node in `graph`. The focus package
 *  is always included even with both depths 0. */
export function egoGraph(
  graph: WorkspaceDependencyGraph,
  name: string,
  opts: EgoGraphOptions = {},
): WorkspaceDependencyGraph {
  const downDepth = opts.downDepth ?? 1;
  const upDepth = opts.upDepth ?? 1;
  const byName = new Map(graph.nodes.map((n) => [n.name, n]));
  if (!byName.has(name)) return workspaceDependencyGraphCarrier(`${graph.term}.ego.${name}`, [], []);

  // Forward adjacency (a package -> its dependencies) and reverse (-> its
  // dependents), both restricted to internal nodes.
  const deps = new Map<string, string[]>();
  const dependents = new Map<string, string[]>();
  for (const n of graph.nodes) {
    deps.set(n.name, []);
    dependents.set(n.name, []);
  }
  for (const e of graph.edges) {
    deps.get(e.from)?.push(e.to);
    dependents.get(e.to)?.push(e.from);
  }

  // Breadth-first expansion out to the given depth along one adjacency.
  const reach = (adj: Map<string, string[]>, depth: number): Set<string> => {
    const seen = new Set<string>();
    let frontier = [name];
    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const cur of frontier) {
        for (const nb of adj.get(cur) ?? []) {
          if (!seen.has(nb)) {
            seen.add(nb);
            next.push(nb);
          }
        }
      }
      frontier = next;
    }
    return seen;
  };

  const keep = new Set<string>([name]);
  for (const n of reach(deps, downDepth)) keep.add(n);
  for (const n of reach(dependents, upDepth)) keep.add(n);

  const nodes: DependencyGraphNode[] = [];
  for (const n of graph.nodes) {
    if (!keep.has(n.name)) continue;
    // Restrict each kept node's denormalised dependency list to kept nodes, so
    // it stays consistent with the filtered edge set.
    nodes.push({ ...n, dependencies: n.dependencies.filter((d) => keep.has(d)) });
  }
  const edges = graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  return workspaceDependencyGraphCarrier(`${graph.term}.ego.${name}`, nodes, edges);
}

/** Project a discovered workspace onto its internal package dependency DAG.
 *  Keeps only edges whose target is itself a discovered package, so the graph
 *  is closed over the workspace and carries no external-npm leaves. */
export function workspaceDependencyGraph(workspace: JSNodeWorkspace): WorkspaceDependencyGraph {
  const internal = new Set(workspace.packages.map((p) => p.name));
  const nodes: DependencyGraphNode[] = [];
  const edges: DependencyGraphEdge[] = [];
  for (const pkg of workspace.packages) {
    const deps = packageDependencyNamesFromUtterances(pkg.name, workspace.utterances)
      .filter((d) => internal.has(d) && d !== pkg.name);
    nodes.push({
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      layer: pkg.layer,
      tags: pkg.tags,
      lifecycle: pkg.lifecycle,
      maturity: pkg.maturity,
      dependencies: deps,
    });
    for (const to of deps) edges.push({ from: pkg.name, to });
  }
  return workspaceDependencyGraphCarrier(workspaceDependencyGraphTerm(workspace), nodes, edges);
}

export function workspaceDependencyGraphTerm(workspace: JSNodeWorkspace): string {
  return `jsnode.workspace-graph.${workspace.root}`;
}

export function workspaceDependencyGraphUtterances(graph: Pick<WorkspaceDependencyGraph, "term" | "nodes" | "edges">): readonly UtteranceCarrier[] {
  return graphUtterances(graph.term, graph.nodes, graph.edges);
}

function workspaceDependencyGraphCarrier(
  term: string,
  nodes: readonly DependencyGraphNode[],
  edges: readonly DependencyGraphEdge[],
): WorkspaceDependencyGraph {
  const frozenNodes = Object.freeze(nodes.map((node) => Object.freeze({
    ...node,
    tags: Object.freeze([...node.tags]),
    dependencies: Object.freeze([...node.dependencies]),
  })));
  const frozenEdges = Object.freeze(edges.map((edge) => Object.freeze({ ...edge })));
  const utterances = Object.freeze(graphUtterances(term, frozenNodes, frozenEdges));
  return Object.freeze({
    term,
    nodes: frozenNodes,
    edges: frozenEdges,
    utterances,
    observation: jsNodeObservation(utterances),
  });
}

function graphUtterances(
  term: string,
  nodes: readonly DependencyGraphNode[],
  edges: readonly DependencyGraphEdge[],
): readonly UtteranceCarrier[] {
  const out: UtteranceCarrier[] = [];
  for (const node of nodes) {
    const nodeTerm = packageTerm(node.name);
    out.push(jsNodeFact(term, "jsnode.graph.has-node", nodeTerm));
    out.push(jsNodeFact(nodeTerm, "jsnode.graph.node.layer", node.layer));
    out.push(jsNodeFact(nodeTerm, "jsnode.graph.node.lifecycle", node.lifecycle));
    out.push(jsNodeFact(nodeTerm, "jsnode.graph.node.maturity", node.maturity));
  }
  for (const edge of edges) {
    const edgeTerm = `jsnode.workspace-graph-edge.${edge.from}->${edge.to}`;
    out.push(jsNodeFact(term, "jsnode.graph.has-edge", edgeTerm));
    out.push(jsNodeFact(edgeTerm, "jsnode.graph.edge-from", packageTerm(edge.from)));
    out.push(jsNodeFact(edgeTerm, "jsnode.graph.edge-to", packageTerm(edge.to)));
  }
  return Object.freeze(out);
}
