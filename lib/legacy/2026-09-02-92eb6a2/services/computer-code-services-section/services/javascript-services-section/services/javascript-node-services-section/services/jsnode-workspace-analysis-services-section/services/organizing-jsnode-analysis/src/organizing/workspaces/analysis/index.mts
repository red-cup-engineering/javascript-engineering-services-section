/**
 * @red-cup-engineering/organizing-with-jsnode/analysis — pure analytical invariants of the workspace
 * dependency graph.
 *
 * Combinatorial geometry and analysis of the package dependency DAG
 * (components, cycles, distance, centrality, strata, the role × domain
 * fibration grid, and the role quotient), the build order, the dependency
 * atlas, the domain atlas and quotient, the role catalogue, the lifecycle and
 * migration-debt view, the workspace consistency bands, and the exact and
 * numeric graph spectrum. Every export is a pure function of the
 * `WorkspaceDependencyGraph` (or `JSNodeWorkspace`) it is given — no
 * filesystem, process, network, or typescript dependency.
 */
export * from "./analysis.mts";
export * from "./build-order.mts";
export * from "./consistency.mts";
export * from "./dependencies.mts";
export * from "./decommission.mts";
export * from "./domain.mts";
export * from "./lifecycle.mts";
export * from "./role-catalog.mts";
export * from "./spectrum.mts";
export * from "./type-flow.mts";
export * from "./symbol-graph.mts";
