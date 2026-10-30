# Organizing JSNode analysis material boundary

This directory preserves existing source material relocated from the retired
`@emsenn/organizing-with-jsnode` package.  It deliberately has no
`package.json`: the only manifest at the source location describes the retired
aggregate package and cannot truthfully be moved with this bounded material.
Accordingly, this material makes no semiotic-voxel or inert-material identity
claim.

The relocated executable analysis closure is rooted at
`src/organizing/workspaces/analysis/index.mts`.  Its runtime-local closure is
the analysis modules, `workspaces/graph.mts`, `packages/carrier.mts`,
`packages/coordinate.mts`, `facts.mts`, and `typing/algebra/`.  Those modules
derive reports from caller-provided workspace, graph, package, and type-index
carriers; they do not discover a workspace or invoke a provider.

`decommission.mts`, `decommissioned-imports.mts`, and `type-flow.mts` retain
type-only references to the legacy workspace scanners (`consumption.mts` and
`type-index.mts`).  Those scanner implementations read the filesystem and are
intentionally not relocated.  The type-only references erase from emitted
JavaScript; a future packaged consumer must supply the corresponding type
contract before attempting an isolated TypeScript build.

`modules/syntax.mts` is a syntax carrier.  Its parsing operation is pure when
the caller supplies source text.  Its optional default argument reads the
named file, so a consumer that requires an inert execution must always pass
that text explicitly.

The material retains external pure algebra seams to `@emsenn/relating` and
`@emsenn/computing`; these are not copied into the material.  No existing
tests cover the relocated syntax or workspace-analysis exports.
