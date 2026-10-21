# JavaScript services section

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

This is the authoritative repository section for material whose subject is the
JavaScript ecosystem: JavaScript and TypeScript source structure, Node.js and
Deno runtimes, npm packages and registries, pnpm workspaces, and the local
JSNode model.

## Topology

- `services/` contains live services: `deno-services-section/` (Deno runtime
  work), `javascript-code-analysis-services-section/` (tooling that reads
  JavaScript/TypeScript source into category-theoretic carriers, without
  generating or fabricating code), `javascript-file-services-section/`,
  `javascript-node-services-section/` (Node.js work — npm and pnpm package
  and registry services live nested beneath it, at
  `javascript-node-services-section/services/jsnode-packaging-services-section/services/`),
  and `javascript-normalization-services-section/`.
- `javascript-node-services-section/` also holds
  `node-runtime-authority-services-section/` (Node/npm package-authority and
  runtime-release tooling) and `jsnode-workspace-analysis-services-section/`
  (tooling that reads an existing JS/Node workspace into relational carriers
  — package facts, dependency topology, serialization — without generating
  or fabricating code), alongside its original children.
- `content/text/documents/articles/notes/` contains current notes and research,
  organized by publication date.
- `lib/legacy/` contains historical implementations. They are evidence and
  training material, not workspace authority.

The former live sections at
`computer-code-development-services-section/services/javascript-engineering-services-section`
and `computer-code-development-services-section/services/jsnode-services-section`
were merged here on 2026-08-10. They must not be recreated as competing
authorities.

## Section-level transformations

The section directly owns three transformations that apply across its child
services: the `src`/`scripts`/`apps` import lattice, an executable-catalog
readiness assessment, and a bounded projection of executable scripts and local
imports into an operations graph. Their reusable modules live in `src/`, their
command faces in `scripts/`, and their behavioral assays in `test/`.

These transformations were relocated here from the 561 Group organizational
services tree. They do not wrap or rename JSNode workspace, package, symbol,
topology, search, review, description, or move operations; those remain with
their specific engineering providers.

The 2026-08-10 consolidation's collation record and reading map — it would
have lived at
`content/text/documents/references/2026/08/10/javascript-knowledge-and-code-index.md`
— was lost during that consolidation and will not be recreated by this
effort.

`jsnode-package-services-section` (staging, admitting, and receipting the
creation of a new JSNode operation package) relocated on 2026-08-20 to the
fabrication lineage, at
`engineering-services-section/services/computer-engineering-services-section/services/computer-code-engineering-services-section/services/javascript-engineering-services-section/services/javascript-code-fabrication-services-section/services/javascript-node-code-fabrication-services-section/services/jsnode-package-services-section`.
Its former location, beneath this section's
`services/javascript-node-services-section/services/jsnode-packaging-services-section/services/`,
no longer holds it; that location now only handles the registry lifecycle
(versioning, building, and publishing) of packages already created.
