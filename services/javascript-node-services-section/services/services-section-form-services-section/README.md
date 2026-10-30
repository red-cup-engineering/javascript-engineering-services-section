# Agentic Organization Services Section Engineering Services Section

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

`@red-cup-engineering/agentic-organization-services-section-engineering-services-section`
fabricates and aligns 561 Group services sections. It observes a section
through lenses, measures it against the Group's section law, derives where
it belongs, founds new sections, and plans and applies the moves that bring
a section into form. Its one command is
**`agentic-organization-services-section-engine`**.

The design this section is moving to is
[a services section as a Thing](content/text/documents/articles/specifications/2026-10-28-services-section-as-a-thing.md):
terms declared in Science as SignCell types and composed by specialization,
existing readers as lenses, evidence in FOUR, the section as a Cell, and the
existing MAPE-K actuators as the loop. The measuring script below is a stopgap
that this design retires.

## Layers

- `src/service-section.mjs` is pure. It reads a source-qualified Service
  Section (offers, Hoare programs, Huidu kernels) through SignCraft's
  KnowledgeBase and Cell. This is the only module downstream consumers that
  must stay pure (`organizing`, `x402`) should import.
- `scripts/` has one operation per file. Each exports its
  `operationDefinition` and runs alone as an NDJSON command.
- `apps/agentic-organization-services-section-engine/` composes the scripts
  into one command. It originates no logic.

## Engine

```sh
agentic-organization-services-section-engine <verb> < requests.ndjson
agentic-organization-services-section-engine <verb> --help
```

Each verb reads one JSON request per line and writes one JSON value per line.

| Verb | Does |
| --- | --- |
| `read-service-section` | Reads a Service Section document `{kind, subject, source, cells}`. |
| `read-services-section-tree` | `{root}`: every section's directory form, README, manifests and Service Section. |
| `fold-directory-entries-into-services-section-form` | `{path, entries, packageJson?}` to a `ServicesSectionForm`. |
| `check-services-section-form-conformance` | A `ServicesSectionForm` to `{conformant, obstructions}`. |
| `measure-services-section-fitness` | `{root}`: every section's misfits against the law. |
| `derive-services-section-path` | `{name, sections}` to the derived path, or `{sections}` to the placement check. |
| `found-services-section` | Founds one section's README and package under derived custody and package name. |
| `plan-services-section-normalization` | `{root, section}`: where each tracked file belongs. |
| `apply-services-section-normalization` | `{root, plan}`: `git mv` each derived move and register what stays owed. |

The law is read from the forest the engine runs in:
`services/internal-services-section/data/records/schemas/`.

## Observing a section

A section is a directory on an unbroken `services/<name>/services/<name>`
chain from the repository root. A `services/` directory inside `data/`,
`lib/` or `apps/` is content, not a section. Form paths are
repository-relative wherever a read starts.

The directory lens folds what it finds into a `ServicesSectionForm`:

- **custody** comes from the custody root the path stands under
  (`science`, `engineering`, `operations`, `internal`, `public`). A path
  outside those derives none, and the law reports that.
- **apps** are the first-level entries under `apps/`. The law expects
  `<topic>-engine`, `<topic>-server` or `<topic>-platform` directories.
- **data** is read to `data/<tier>/<kind>/`. A record's interior is never
  more form.

## Measuring fitness

`measure-services-section-fitness` reports, for every section under a root,
each law location its form violates, with the violating entry and the
law's message. A section with no misfit fits as far as the directory lens
sees. The lens sees names, placement and manifests, not semantics.

This is the misfit reading of
[fitness to form](https://github.com/lenticule-science/science-services-section/blob/main/services/information-science-services-section/services/math-services-section/services/obsmetrological-services-section/content/text/glossary/terms/fitness-to-form.md).
Its Obsmetrologia reading, the Burgers vector around each angle of each
face of the section's cell, is not computed yet. The section's faces and
edge displacements are still to be derived.

## Aligning a section

`plan-services-section-normalization` derives each tracked file's
destination from the content taxonomy and the EAVT data law, or none for
its owner to decide. `apply-services-section-normalization` performs the
derived moves with `git mv` and writes a misfiled-resources register.
`derive-services-section-path` places a section by its name. A placement
the names cannot derive is a defect of the name.

## Founding a section

`found-services-section` writes a new section's `README.md` and
`package.json` and never overwrites them. It refuses a name that breaks the
naming law and a custody or package name that differs from the derived
one. A supplied Service Section document is persisted at
`data/records/service-section.json`. A new area is founded through this
verb, not with `mkdir`.

## Service Section

The [Service Section v1 specification](content/text/documents/articles/specifications/service-section-v1.md)
defines the semantic profile. This package's own
[source record](data/records/service-section.json) describes its reader in
that profile. Directory observation does not establish source revision,
installation or execution, and reading a section never runs its code.

## Source-indexed declaration paths

The native `./service-section` reader additionally exposes `identityServiceDeclarationPath`, `offerServiceDeclarationPath` and `composeServiceDeclarationPaths`. They assemble **syntactic-only** typed paths from the original source-witnessed offer/program links, preserving opposing testimony, source snapshot, and explicitly supplied interface Marks. Composition requires exact intermediate interface identity, including any declared remaining resource budget, version, rights and receiver. A mismatched budget or source-boundary Mark refuses rather than licensing an execution.

The existing [Service Section v1 specification, §6.5](content/text/documents/articles/specifications/service-section-v1.md) distinguishes these executable source **declaration** functions from independently proved Hoare preservation, authorized effects, actual users and economic settlement. The original Science and native service owner must qualify those stronger properties; passing a path check does not establish a sale or mathematical sheaf.
