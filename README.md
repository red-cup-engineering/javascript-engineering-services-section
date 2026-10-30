# JavaScript Engineering Services Section

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

This is Red Cup Engineering's source owner for reusable work **about the JavaScript ecosystem**: JavaScript and TypeScript source, Node.js and Deno, package and workspace structure, and JSNode. A program merely *written in JavaScript* remains with the engineering section that owns its actual subject.

This section provides cross-cutting source readers and composes separately owned services. It does not own every runtime, compiler, registry, publisher, or application that uses JavaScript.

## Maintained source

The [package manifest](package.json) defines the current exported interfaces and Node.js requirement (24 or later). The section's directly maintained logic is in `src/`, its command entry points in `scripts/`, and its bounded behavioral checks in `test/`.

- `./import-lattice` checks local JavaScript imports against the source → scripts → application composition order. Package-import authority belongs to the package dependency graph, not this local-file check.
- `./package-import-lattice` reads package import relationships under their own declared constraints.
- `./executable-readiness` assesses an existing executable catalog; it does not fabricate an executable.
- `./project-capability-graph` projects package scripts and local source imports into an operations graph. It is a source observation, not a runtime-capability grant.
- `./review-package` reviews an existing JavaScript package through the maintained reader.

The corresponding command-line entries are in [`scripts/`](scripts/) and the tests in [`test/`](test/). `npm test` runs the package's declared Node tests when its workspace dependencies are available. A package test is not a native Code Work, Proof, host installation, release or beneficiary acceptance.

## Subsection and supplier custody

The [`.gitmodules`](.gitmodules) and selected Git tree, not an earlier README's copied commit hashes, identify the child sources this section currently composes. The principal subsection mounts are:

- [JavaScript Code Analysis](https://github.com/red-cup-engineering/javascript-code-analysis-engineering-services-section) for source analysis rather than code fabrication;
- [JavaScript Code Fabrication](https://github.com/red-cup-engineering/javascript-code-fabrication-engineering-services-section) for its separately qualified maker and Code receiving;
- [JavaScript File](https://github.com/red-cup-engineering/javascript-file-engineering-services-section), [JavaScript Node](https://github.com/red-cup-engineering/javascript-node-engineering-services-section) and [JavaScript Normalization](https://github.com/red-cup-engineering/javascript-normalization-engineering-services-section) for their corresponding reusable capabilities;
- [Deno Engineering](https://github.com/red-cup-engineering/deno-engineering-services-section) for Deno-specific work.

Other directly mounted services, including the source-read and editing suppliers, retain their identities in the same Git tree. The JavaScript Node section's package-management descendants govern the lifecycle of existing packages; Code Fabrication's original source owns creating a new JSNode Code package. The distinction prevents a second maker or registry being built in this parent.

A submodule records **selected source**, not installed host state or downstream use. The directory `lib/legacy/` holds historical material, never an alternative live package.

## Native Code fabrication evidence

The existing [native Code receiving workflow](.github/workflows/native-code-fabrication-receiving.yml) validates the exact `services/javascript-code-fabrication-services-section` Gitlink, its declared GitHub origin, and one independently completed successful `child-code-receiving` check-run for that selected source SHA. It **reuses** the child's native clean-installed Code-consumer evidence instead of rebuilding the same producer here.

This is a source-receiving check only. It neither fabricates the Code, proves that every requirement is met, runs an isolated production Work, publishes a package, grants a principal authority, nor settles a customer's outcome. The continuing [Computer Code Engineering obligation #74](https://github.com/red-cup-engineering/computer-code-engineering-services-section/issues/74) retains the downstream Stage Proof, execution, installation, source-release and beneficiary-receiving questions. A passing child check cannot substitute for a missing parent or host result.

Historical evidence for earlier child cuts remains at [Code Fabrication PR #3](https://github.com/red-cup-engineering/javascript-code-fabrication-engineering-services-section/pull/3), [PR #5](https://github.com/red-cup-engineering/javascript-code-fabrication-engineering-services-section/pull/5) and the [native consumer run](https://github.com/red-cup-engineering/javascript-code-fabrication-engineering-services-section/actions/runs/40738032272). These are dated receipts; they do not establish the current condition of another revision.

## Earlier consolidation and research

The August 10 JavaScript/JSNode source collation removed competing live homes under the old computer-code-development tree. The [original August knowledge-and-code index](lib/legacy/2026-08-11-bd3f7f2/services/computer-services-section/services/computer-coding-services-section/services/javascript-services-section/content/documents/references/2026/08/10/javascript-knowledge-and-code-index.md) **is present** in a retained legacy snapshot. It is a historical reading map, not the current repository topology or an instruction to recreate any old subsection.

The earlier README said that this index was lost; the source tree now supplies its exact archived file. It also referred to a current `content/text/documents/articles/notes/` directory that is **not present in this repository**. Read historical notes through their actual surviving sources rather than interpreting those legacy paths as live documentation.

Earlier relocations and dated Code-receiving hashes remain recoverable in Git history and their owning PRs. Current architecture and package status must be read from the current repository and selected subsection sources, not a growing copy of previous change logs.
