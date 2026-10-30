# A services section as a Thing: measuring fitness to form and aligning it

Status: design, 2026-10-28. Nothing here is implemented yet unless it says so.

## What this is for

The Leader's request (2026-10-28): fabricate a services section as a complete
Cell. Measure a section against the specification of what it should be, see
how it deviates, and use that to align it automatically. The specification is
composed from the terms the Group uses precisely (engine, service, section,
agent, organization, system). Each term is schema'd in Science, and fitness
to form is measured against their composition.

This document specifies how to do that with code the Group already has. It
replaces nothing by itself. Section 7 lists the thin approximations it retires
and section 8 the repairs it depends on.

The design is a holistic integrated Thing structure: one typed, source-witnessed
SignCell Thing per section, read through every lens at once. A pile of
separate checkers, each with its own idea of "conformant", is not that.

## 1. Terms are Science's type declarations

Each term is a JSON Schema carried at
`data/records/schema/glossary/terms/<term>.schema.json` in the Science section
that owns the term. Code admits it as a SignCell type with `defineType`
(`@red-cup-engineering/signcell/type-system`).

The carrier already works this way. `eavt-services-section/src/profile.mjs`
imports Science's `glossary/terms/eavt.schema.json` as its admission law, and
the math section carries `functor`, `morphism` and their neighbours the same way.

A term's schema states what an observer can find in a resource of that kind,
in the vocabulary the lenses (section 3) produce. A schema that only restates
prose cannot measure anything.

| Term | Owning section | Today |
| --- | --- | --- |
| section | relationality / agency | prose (`terms/section.md`: a section of a fibration); no schema |
| agent | relationality / agency; knowledge | prose concept; `knowledge/terms/agent.md` is empty |
| organization | sociology | prose (`terms/organization.md`: purposive collective, the genus of company); no schema |
| service | Service Section v1 (Rendanheyi hull: provider, user outcome, value; Hoare program) | engineering spec; no Science term |
| engine | computer science | none |
| system | computer science (Data → Code → Networking → Systems) | none |
| fitness to form | obsmetrological | prose + schema, 2026-10-28 |

Writing the missing schemas is Science's work. Engineering waits for those
declarations rather than inventing them.

## 2. The intension is specialization

`specializeType(parents, definition)` declares "a type whose extent is the
intersection of its parent types and local schema". Composing the intension is
therefore one declaration:

    AgenticOrganizationServicesSection = specializeType([Agent, Organization, Service, Section], {…})

Membership is `isSubtypeOf`. The portable form is `typeSystemDocument` /
`admitTypeSystemDocument` (`signcell/type-system/document`), so the composed
intension is content-addressed and travels between hosts unchanged.

`admit(type, value)` returns at the first parent that refuses. To report every
misfit, the measure admits the observed value against each parent term
separately and against the local schema. Each refusal's `issues` are that
term's misfits: Alexander's misfit variables, grouped by the term that states
them.

## 3. Lenses are existing readers producing source-positioned utterances

A lens projects the resource onto the aspects a term constrains. Every lens
below already exists. Each yields an Utterance whose claim is the observed
value, and `deriveThingFromUtterance` (`signcell/type-system/thing`) or SignCraft's
`deriveTypedThing({typeSystem, typeId, source})` (`signcraft/thing`) admits it.

| Lens | Existing reader |
| --- | --- |
| directory form | this package's `foldDirectoryEntriesIntoServicesSectionForm` over `readServicesSectionTree` |
| package manifests | fabrication `monitoring/package-json-directory-provider` (`workspace-package-conformance`) |
| semantic declaration | this package's `readServiceSection` (offers, Hoare programs, Huidu kernels) |
| repository custody | git-engineering `repositoryRecords` (checkout, origin, parent pin, registry, tree, disk) |
| source code | fabrication `readSourceCodeMonitorAggregate` (policy, topology, build order) |

The JSON Schema in `internal-services-section/data/records/schemas/services-section-form.schema.json`
remains the directory lens's local law. It is one input, not the judge of
fitness.

## 4. Composition and evidence

`composeThings({things, relationSources, typeSystem})` (`signcraft/thing`)
puts every lens's Thing and witnessed relation into one SignCell EAVT field.
`readThingEvidence` reads each claim in FOUR:

- supported: fits, as far as that lens sees;
- opposed or absent: a misfit;
- both: two lenses disagree, which is an obstruction;
- neither: unobserved, which names what no lens can see.

Disagreement between lenses on their overlaps is computed the way
git-engineering's `forestObstructionSheet` already computes it: each lens is a
metrologic `patch`, each reading a `localSection`, and `cech1` / `cocycle` find
the overlaps that do not agree. `classify` then sorts each certificate:

- **damage**, with a named repair: `found-services-section`,
  `extract-services-section`, reconcile;
- **border**: kept on purpose.

The section's lenses join the forest's lenses in that sheet. They do not get a
second sheet.

## 5. The Cell and fitness to form

`projectTypedThingCells` (`signcell/type-system/thing`) turns the composed
Things into the SignCell cell set that SignGraph reads as a directed
1-skeleton and, where warranted, a higher cellular complex. That is the
section as a Cell.

Fitness to form, per the obsmetrological term, is the Burgers vector around
each angle of each face of that Cell:

- SignGraph's `burgersOfComplex` computes each face's translational residue.
- `affineHolonomyOfComplex` computes the rotation at each angle.
- A Čech 1-cocycle around a cycle of overlapping lenses is the discrete
  closure failure the Burgers vector refines.
- The misfit count of section 2 is the reading with the faces forgotten.

**Open:** which lenses meet at an angle, and what lattice displacement one
lens's reading makes relative to its neighbour's. Until Science derives this,
the measure reports misfits and obstructions, and computes no Burgers vector.
The Service Section v1 rule stands: a declared protected residue may remain,
because there is no universal "all defects zero" form.

## 6. The loop: monitor, analyze, plan, execute

| Step | Existing code |
| --- | --- |
| Monitor | fabrication `readMonitorAggregate` joins each named subsystem's FOUR census (Computer Data `four.mjs`) into one content-addressed reading. The section's evidence is one subsystem. |
| Analyze | each damage certificate and misfit becomes an obligation, as `sourceCodePolicyObligations` and `buildHealthWorkIntent` already do for source code and checkout health |
| Plan | deterministic placements first: this package's `plan-services-section-normalization` (content taxonomy and EAVT data law) and `derive-services-section-path` |
| Execute | `apply-services-section-normalization`; fabrication `transactDirectoryRelocations` for multi-move transactions; the `normalize-package-form` pattern (re-read, confirm the fix is still needed, act, dry-run by default) |
| Knowledge | each executed change is re-observed and re-admitted as a Thing; the loop closes only on the re-admitted reading |
| Schedule | metroplat `enterprise-loops` (rule `machine-work-runs-as-mape-k-loops-not-clocks`) |

**PACE-S.** organizing's `mediatePaceSTurn` admits testimony from an office
(pause, attune, care, engage) with roles monitor / analyze / plan / execute. It
executes nothing, by design. Officers use it to testify about the loop; it
does not drive the loop.

**The LLM is the ribosome.** A language model only translates an admitted
obligation that has no deterministic actuator into a candidate edit. It does
not decide what is wrong or whether the result fits; re-admission decides that.
Folding a section into form is then a search through admissible moves, scored
by the residue that remains, like an EDA flow or protein folding.

## 7. Thin approximations this retires

| Retired | Replaced by |
| --- | --- |
| `scripts/measure-services-section-fitness.mjs` (2026-10-28) | sections 2–4: per-term admission, `readThingEvidence`, the obstruction sheet |
| JSON Schema conformance as the definition of fitness | one lens's local law (section 3) |
| `fitness-to-form.schema.json` as a free-standing JSON Schema | a SignCell type document admitted with the other terms |
| the engine's `runJavascriptNodeOperation` catalog as its face | verbs served by computer-system-engine's `serve-verbs-over-stdio`, typed by SignCell domain/codomain types with declared effects, as other engines are |
| hand-run harness projection | not part of this loop |

## 8. Repairs this depends on

- **Publication.** `@red-cup-engineering/agentic-organization-services-section-engineering-services-section`
  is not in the registry while `release-on-landing.service` is held. Its ten
  consumers still pin `services-section-form-services-section` at 0.1.2–0.4.1.
  `organizing` and `x402` need only the pure `./service-section` subpath.
- **Fabrication's founding wrapper.** `src/services-section-form/operations.mjs`
  imports the old package at 0.1.2, which is not installed, and declares a
  stale custody enum (`561-group`).
- **Duplicate.** `computer-code-development-engine` is a full copy of
  fabrication under the same package name and version.
- **Publication service.** npm-workspace-publication-service still admits
  house releases by exact version for consumers without a committed workspace
  policy. Every live workspace config now exempts the house scopes.
- **Content taxonomy.** `custodyStems` in `services-section-form-content-taxonomy.json`
  is no longer read. Custody comes from the path, and `internal` is a custody.
- **Missing terms.** Science has no schemas for engine, service, system,
  agent or organization (section 1).
