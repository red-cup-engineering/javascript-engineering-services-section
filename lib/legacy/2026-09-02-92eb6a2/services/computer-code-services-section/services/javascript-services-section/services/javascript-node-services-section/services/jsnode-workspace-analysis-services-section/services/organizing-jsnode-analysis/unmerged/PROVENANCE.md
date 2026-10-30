# Unmerged material provenance

The files under this directory are the full remaining contents of the retired
`@emsenn/organizing-with-jsnode` package (as it stood at
`javascript-services-section/lib/legacy/organizing-with-jsnode`, the more
current of that package's two other forks — see the reorganization commit
history) minus the three exclusions `DEPENDENCY-BOUNDARY.md` documents as
intentional: `package.json` (cannot truthfully describe this bounded
material), `src/organizing/workspaces/consumption.mts`, and
`src/organizing/workspaces/type-index.mts` (the legacy filesystem-reading
workspace scanners, deliberately not relocated).

`DEPENDENCY-BOUNDARY.md` names the analysis closure this package keeps
outside `unmerged/` and explains those three exclusions, but it does not
account for the rest of `organizing-with-jsnode`'s surface — package
fabrication/manifest tooling (`bin.mts`, `footprint.mts`, `kind.mts`,
`manifest-edit.mts`, `reduction.mts`, `run.mts`, `conformance/`), workspace
management (`atlas.mts`, `api-surface.mts`, `boundary.mts`, `capability.mts`,
`edge-relation.mts`, `organization.mts`, `search.mts`, `workspace.mts`),
content/documentation tooling (`modules/content/`, `documentation.mts`,
`documentation-edit.mts`, `imports.mts`, `introspect.mts`,
`package-surface.mts`, `references.mts`, `source.mts`), the `acting`/
`actions`/`codecs`/`holography` surfaces, package-level scaffolding
(`README.md`, `.gitignore`, `tsconfig*.json`, `scripts/`), and this
package's own dev docs. None of that is a documented exclusion, so per this
reorganization's working instructions it is parked here rather than
discarded. It is retired, unbuilt, and not part of
`organizing-jsnode-analysis`'s own no-manifest analysis closure — a future
pass should decide, file by file, whether any of it has a real home
elsewhere (`jsnode-computer`/`jsnode-codecs`/`jsnode-server`, sitting
alongside this package, already cover the codec and computing surface for
the still-live JSNode ecosystem) or should be dropped for good.
