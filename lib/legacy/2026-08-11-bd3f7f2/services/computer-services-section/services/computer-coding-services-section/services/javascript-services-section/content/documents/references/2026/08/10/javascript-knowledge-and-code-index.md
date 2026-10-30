---
title: "JavaScript Knowledge and Code Index"
description: "Authoritative reading map and provenance record for the JavaScript, Node.js, npm, and pnpm collation."
date-created: 2026-08-10
status: reference-map
subjects:
  - JavaScript
  - TypeScript
  - Node.js
  - Deno
  - npm
  - pnpm
  - JSNode
---

# JavaScript Knowledge and Code Index

## Authority

This section is the single repository authority for code and knowledge whose
subject is the JavaScript ecosystem. A service implemented in JavaScript but
about another domain remains with that domain. Services that inspect,
transform, package, install, publish, execute, or model JavaScript and Node.js
material belong here.

## Live code collected in this pass

The prior `software-development-services-section` JavaScript and JSNode
sections were merged without leaving duplicate live trees. This brought in:

- JavaScript and JSNode observation, editing, function-movement, sandbox,
  synthesis, and mission-execution services;
- the pnpm workspace fabrication service;
- npm dependency-closure installation;
- JavaScript-script-to-skill and JSON-Schema-to-TypeScript transformations;
- the Deno JSNode function-movement provider;
- recovered JSNode algebra, topology, codecs, computer, content-computer, and
  server packages under `lib/vendored/`;
- historical Node/TypeScript implementations under `lib/legacy/`.

The former JavaScript and JSNode section manifests are retained in
`lib/legacy/` as package-identity provenance; neither manifest is live.

The existing `services/npm-services-section/` remains the internal authority
for package manifests, packing, installation assays, release projection,
registry construction, registry reads, graphing, snapshots, cache recovery,
and Verdaccio configuration.

## Current reading path

Read `content/documents/articles/notes/` chronologically. The core local theory
is:

1. `2026/06/14/2026-06-14-jsnode-content-computer.md`
2. `2026/06/14/2026-06-14-jsnode-content-computer-build.md`
3. `2026/06/16/2026-06-16-jsnode-as-workspace-topology.md`
4. `2026/06/22/2026-06-22-survey-of-561-group-jsnode-ecosystem.md`
5. `2026/06/22/2026-06-22-survey-of-relating-through-organizing-jsnode-packages.md`
6. `2026/06/26/2026-06-26-research-on-the-relational-structuration-of-a-jsnode-workspace.md`
7. `2026/06/26/2026-06-26-research-on-git-and-node-as-two-coordination-tiers.md`
8. `2026/06/26/2026-06-26-survey-of-package-capability-rehoming.md`
9. `2026/06/27/2026-06-27-research-on-jsnode-development-masks.md`
10. `2026/06/27/2026-06-27-research-on-jsnode-packages-workspaces-and-sites.md`
11. `2026/06/28/2026-06-28-research-on-npm-packages-git-repos-and-branches-as-coordination-structures.md`
12. `2026/07/05/2026-07-05-research-on-a-categorical-semantics-for-node-package-layout.md`
13. `2026/07/11/2026-07-11-guide-to-the-jsnode-sgadp-metroplat-development-loop.md`
14. `2026/08/09/2026-08-09-note-on-normal-node-package-operations.md`

The two 2026-06-22 Node.js-versus-Rust reports provide comparative runtime and
memory-management context rather than local architectural authority.

## Historical knowledge

`content/documents/legacy/notes/` holds unique recovered working notes.
`content/documents/legacy/research/` holds earlier npm coordination research.
`content/documents/legacy/references/javascript-library/` is the most complete
surviving historical JavaScript reference library. An exact nine-file subset
formerly nested in the Emacs archive and exact duplicate Node.js feedback and
Koios notes were removed during collation.

Historical package READMEs and licenses are retained as provenance, not as
current operational guidance.

## Repository-root coordination surfaces

`/.npmrc`, `/package.json`, `/pnpm-workspace.yaml`, and
the root lockfiles remain at repository root. Their location is operational:
npm and pnpm discover configuration and workspace authority by walking parent
directories. They are indexed here but must not be copied into this section or
moved merely for topical colocation.

## Classification boundary

This pass did not move every repository application written in `.mjs` or
`.mts`. Language of implementation alone does not make an application
JavaScript-domain knowledge. The remaining strong filename search result
outside this section is a `corporate-online--nodejs.txt` parser fixture inside
a preserved historical corpus; it remains with the fixture that consumes it.

Generated `node_modules/` trees and ignored Verdaccio package storage were
removed from the section. They are reproducible machine state rather than
authored source or suitable training material.
