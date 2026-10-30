---
title: "L-Space to CapCell — High-Level Design"
document-id: LS-HLD-001
version: 0.1.0
status: design-candidate
date: 2026-10-13
governed-by: LS-SAS-001
---
# LS-HLD-001 — Typed L-Space specification lineage into existing CapCell fabrication

**Governing SAS:** [LS-SAS-001](https://github.com/lenticule-science/linguistics-services-section/blob/main/specifications/l-space-semantic-architecture.md). **Detailed contracts:** [LS-LLD-001](./l-space-lld.md). **Provider:** the existing [CapCell PDK](../README.md), especially [`fabricate-local-capcell.mjs`](../services/capcell-manifest-fabrication-service/src/fabricate-local-capcell.mjs), [`capcell.mjs`](../scripts/capcell.mjs) and [its regressions](../test/capcell-manifest-fabrication.test.mjs).

**Scope of the historical HLD identifier:** `LS-HLD-001` names this existing source document and its architecture views and high-level engineering decisions; **HLD does not mean Architecture** and an architectural decision is not automatically admitted merely because it appears in an HLD. The Group's separate five admissions are Requirements (beneficiary), Specification (required behavior), Architecture (42010 viewpoints/relations; [arc42](https://arc42.org/overview/) may organize the description), Design (high-level **and** detailed contracts), and Fabrication (realized artifacts). `LS-SAS-001` is a historically named semantic **specification** despite its legacy *System Architecture Specification* label. `LS-LLD-001` is a detailed **design** contract. The v2 CapCell fields `lineage.sas`, `lineage.hld`, `lineage.lld` are **three byte-verification inputs only**; their shape proves neither five independently admitted stages nor ISO 42010 conformance. Retain the current wire format and distinct source identities until a source-qualified versioned migration includes all consuming integrations; do not retrofit the old keys by silently interpreting HLD as an Architecture certificate. See the [authoritative Group method](https://github.com/561-group/561-group-services-section/blob/main/content/text/glossary/concepts/method-for-work-in-the-561-group.md).

**Status:** design candidate with an **implemented v2 source-lineage integrity gate** in the existing CapCell PDK, subject to its own executable tests and independently observed provider execution. The existence of that gate does not establish live L-Space semantic admission, production installation, science acceptance, or customer receiving. Science owns language/claim semantics. This Engineering specification owns the conversion from admitted meaning and requirements into a candidate CapCell manifest. Coesite and the consuming office independently receive actual deployments and outcomes. Architecture is a *thin extension of existing fabrication*, not a separate compiler, knowledge engine, schema registry or source file directory.

## 1. Seven boundaries of responsibility

| Boundary | Input → output | Owner and authority | Refusal |
| --- | --- | --- | --- |
| B1 Research and theorem | Research paper, source-revision, Lean declaration/conditions → warranted proposition | Lenticule Science / external research issuer; evidence is **scoped** | Citation without exact claim, witness or stated hypothesis cannot become a proof claim |
| B2 LS-SAS-001 (legacy-named semantic specification) | Scientific term/claim/concept/topic and source-held original requirements → behavioral and semantic specification obligations | [LS-SAS-001](https://github.com/lenticule-science/linguistics-services-section/blob/main/specifications/l-space-semantic-architecture.md), with qualified consumer authority | Concept/term ambiguity, conflicting claims or unproved premises are retained or block unqualified requirements |
| B3 Architecture description in LS-HLD-001 (placement) | Admitted requirements/specification → subsystem/actor/interface/quality-decision allocations and viewpoints | This document, Engineering | No orphan requirement; no duplicate implementation owner |
| B4 Detailed design in LS-LLD-001 (materialization contract) | Accepted architecture → versioned typed input/refusal/output and tests | [LS-LLD-001](./l-space-lld.md), Engineering | Missing/invalid effects, type, identity, source digest or precondition |
| B5 Fabricator | Accepted work order + existing CapCell PDK → SEN/NI-addressed candidate bundle | Existing `normalizeCapCellSpecification` and `fabricateLocalCapCell` | Unbound provider cell, extra operation, illegitimate material, missing specification lineage |
| B6 Independent operations | Version-pinned candidate + permissions and provider bindings → installed effect and readback | Existing provider CapCells, Coesite; not the fabricator's own claim | Uninstalled, failed, missing, unauthorized or inconsistent public witness |
| B7 Consumer receiving | Observed outcome → accepted/refused against original requirement | Office that issued the work | A green test/build/commit alone does not discharge original demand |

**The CapCell v2 source-pin chain `sas → hld → lld` is not the five-stage process.** The engineering obligation is **original requirements → behavioral specification → architecture description → realizable design → qualified fabrication → integrated/deployed effect → independent consumer**, with distinct admissions and evidence of each stage. The three existing named documents are versioned *inputs to that process*, not substitute receipts for missing requirements or source-owner acceptance. An LLM may propose a translation or candidate, but may not grant source authority, assert a theorem, relax a precondition or sign its own downstream acceptance. A Huidu hull is a bounded, fail-closed adapter around untrusted expressions and repair; not a rival office.

## 2. Reuse map — no competing semiosis

- **Marks, utterances and predication:** upstream Obsmetrologia and the Lenticule linguistics engine. Engineering does not create another truth lattice for `term`, `concept` or `topic`.
- **FCA and claim fibers:** [formal Galois/closure](https://github.com/lenticule-science/obsmetrologia/blob/2ae077eed16dd1c9f2345d0a3360563fbb3cc47e/Obsmetrologia/Calculus/Order/FormalConceptAnalysis.lean), [situated topic](https://github.com/lenticule-science/obsmetrologia/blob/2ae077eed16dd1c9f2345d0a3360563fbb3cc47e/Obsmetrologia/Site/Topic.lean) and existing L-Space archive/query operations when their authorized corpus is mounted. A missing corpus is a missing source, not an invitation to generate a local shadow index.
- **Four-valued evidence:** use existing charge and provenance materials, distinguish a contradictory claim from a verified dispute and from absence of evidence. Never coerce positive+negative to `true`.
- **Addressing:** use the existing [SEN content identification](../services/capcell-manifest-fabrication-service/src/fabricate-local-capcell.mjs) and RFC 6920 NI identities for exact semantic values, plus source-native immutable revision/digest identifiers. Do not introduce another standalone `sources.json`/`machines.json` authority.
- **Fabrication:** the existing [one-capability-one-cell PDK](../README.md), which already rejects extraneous capability operations, effectful in-process material and missing market provider bindings. Its output is *a local candidate*, not proof of production installation.
- **Testing and operations:** existing Node conformance tests, provider-specific CI and Coesite readback. Scientific validity, deployment state, market settlement and customer receiving use distinct evidence chains.


### The 1D / 3D / 4D decomposition uses existing providers

The [upstream Science analysis](https://github.com/lenticule-science/science-services-section/blob/3a4c338acff1b39ae1bb4cbb641195273da3beb2/services/information-science-services-section/services/language-science-services-section/content/text/documents/articles/notes/2026/10/10/2026-10-10-note-about-l-space.md#sca-sen-and-seavt-one-dimensional-three-coordinate-and-four-coordinate-readings-2026-10-13) defines the coordinate-arity convention. This HLD assigns it to the existing engineering owners without a new geometric, registry or event-store engine:

| Projection / admission | Current reusable implementation boundary | Boundary condition / consumer |
| --- | --- | --- |
| **1D SCA**: one canonical `ni:` address of exact content | [computer-content-address-engineering: semiotic-content-address](https://github.com/red-cup-engineering/computer-content-address-engineering-services-section/blob/main/src/semiotic-content-address.mjs) and the existing NI/CBOR/cryptographic providers | Normalization and digest are deterministic; claims of semantic synonymy, rights or theoremhood are external to the address |
| **3D SEN**: typed `(s,p,o)` predication reading | [computer-data-engineering: SEN statics/json-codec](https://github.com/red-cup-engineering/computer-data-engineering-services-section/blob/main/src/semiotic-expression-notation/json-codec.mjs) and [computer-code-engineering: SEN runtime](https://github.com/red-cup-engineering/computer-code-engineering-services-section/blob/main/src/semiotic-expression-notation/runtime.mjs) | Each coordinate is a closed typed term; the subject/predicate/object selection is an admitted projection of SEN, not all of SEN. FOUR status/provenance remain typed adjunct data |
| **4D SEAVT**: `(e,a,v,t)` admitted typed event row | [Existing Data Engineering SEAVT package](https://github.com/red-cup-engineering/computer-data-engineering-services-section/tree/main/services/computer-content-engineering-services-section/services/computer-serialized-content-engineering-services-section/services/json-services-section/services/jsonl-services-section/services/eavt-services-section/services/semiotic-eavt-services-section): actual export `@red-cup-engineering/semiotic-eavt-services-section/admit-seavt-row`; [SignCell round-trip tests](https://github.com/red-cup-engineering/computer-data-engineering-services-section/blob/main/services/computer-content-engineering-services-section/services/computer-serialized-content-engineering-services-section/services/json-services-section/services/jsonl-services-section/services/eavt-services-section/services/semiotic-eavt-services-section/test/signcell-seavt.test.mjs) and [clock tests](https://github.com/red-cup-engineering/computer-data-engineering-services-section/blob/main/services/computer-content-engineering-services-section/services/computer-serialized-content-engineering-services-section/services/json-services-section/services/jsonl-services-section/services/eavt-services-section/services/semiotic-eavt-services-section/test/clock.test.mjs) | Source implementation and tested cases exist. Admission of closed SEN coordinates is not an authenticated source timestamp; chronological order is not causality. Verify the **actual installed** package, source-clock authority, journal write and independent receiver before calling the 4D representation operational. Do not duplicate an SEAVT implementation or use timestamp syntax as a proof of rights |

The allowed movement is `canonical address → admitted SEN mark/typed expression → scoped predication → witnessed SEAVT row`, each crossing through its **own qualified provider**. The current SignCell projection supplies an implemented admissible **special case** through the existing Data Engineering SEAVT package, not a proof that arbitrary claims or their times are independently witnessed. A row's 4→3 time-forgetting operation is lossy; it must neither rewrite history nor claim that a temporally distinct assertion is a duplicate. SCA names *carrier bytes*, SEN names/evaluates *expressions*, SEAVT records *witnessed events*. None of these means alone supplies a Minkowski metric. A typed Chu pairing, FOUR witness, left/right residual, and causal relation are separately scoped mathematical and evidentiary interpretations, with open Science receiving.

An actual consuming system shall bind a source-pinned research requirement to a versioned SAS identifier, an HLD owner, a specific LLD interface and its conformance test. The v2 CapCell gate verifies **source-byte integrity**; the selected provider's own semantic and effect contract must decide whether its actual behavior satisfies that requirement. In particular, no action can promote a scientific theorem by passing `sha256` and no local candidate can assert that Coesite installed it.

### Semiotic Lineage Control placement — receive LS-SAS-037/038

**Selected architecture:** retain Git as source-object storage and hosted transport, and improve the *existing* [Red Cup Git Services](https://github.com/red-cup-engineering/git-services-section) with a finite, source-qualified SLC reading. Its `source-path-proof` checks native Git **tree/path object identity** under independently authenticated commit roots; **Git commit ancestry** is a different fact, obtained through the existing authenticated `source-observation` provider and GitHub compare response. `semiotic-lineage-control` composes content-addressed proposed event identities, situated `(token,claim,context)` utterance witnesses, preserved differing source objects, provider-verified ordered/forked revisions, and explicit resource-consumption disputes. The package `inspect-semiotic-lineage` has an offline pure replay mode and an authenticated `--observe` source/commit mode using the existing Git Services `gh` transport on any authorized cloud/workbench without the Cold Red Gate host or Bare Cedar Fog laptop. It neither creates a competing Git object database nor installs an unauthorized Semioverse renderer.

**Responsibility and consumer view:**

| Stage | Actual source owner / consumer | Acceptance boundary |
| --- | --- | --- |
| Mathematical source | Obsmetrologia FOUR/Chu, CHL, causal/ordinal closure plus the Lenticule Language Science SLC glossary | Proved small-carrier laws and distinct, explicit open transfinite obligations |
| Source material | Existing Git/GitHub repository, native commits, paths, immutable tree proofs | Independently authenticated repository ID and exact commit/root; no truncated/unread Gitlink proof |
| Semantic identity and witnesses | Existing SCA/NI, SEN, SEAVT and authorized source reading; SLC finite Git Services projection | Same source event is one NI; no conflation of same string with same claim or positive-only with conflicting testimony |
| Proposal/fabrication | Existing Code/CapCell source-bound fabrication and package verification | Type/lineage identities and separately executed conformance at selected supplier SHA; a work-order cannot mint authority |
| Work and governance | FeltOS Work Arena; Coesite reusable contracts; Group/customer instance | Claimed debit or office act receives independent permission, lawful move and actual receiver; no `owner:` frontmatter promotion |
| Distribution/recovery | GitHub forge as one source port; local/offline CLI and future Guix/LAGOON/registry consumers | Other authorized hosts can reproduce the same bounded reading; Cold Red Gate outage does not prevent source inspection |

**Architectural tradeoff:** a new all-in-one SLC version-control store would duplicate Git's immutable histories and Red Cup's already-owned FOUR/NI interpreters, while placing incomplete mathematical axioms in a production actuator. The retained architecture is an *in-place semantic control layer* over genuine Git source evidence, with explicit future migration if a proved change algebra requires different storage. It uses Darcs/Pijul patch theory as comparative evidence, never as a proof that this candidate already has associative semantic merges. As in protein folding/EDA, candidate construction, testing, constraints and receiving are distinct *stages*, not a quantitative claim that software is protein or chips.

**Migration and tests:** early-alpha SLC provides one new canonical operation without a `sen1` alias, legacy shim, separate manifest service or hidden daemon. Preserve all existing unique branches and archived source bytes until a full provider/consumer family comparison and migration has succeeded. Git Services PR #60 was integrated on 2026-10-14; the living source now includes a provider-bound observer and tests for source identity, forks, ancestry and unavailable Git evidence. Targeted SLC and source-path suites passed locally, and a representative reading of two independently fetched real GitHub package versions reconstructed both Git tree hashes and distinguished ordered revisions from a fork. GitHub Actions still failed before obtaining a runner; **this is not a full-package CI or installed consumer receipt**. Test a divergent source file, contested governance utterance, missing ancestor, unavailable provider and independent receiver before permitting any automated integration effect.

## 3. Dependency views and placement decisions

```text
Lenticule Science (claims, independent proofs, research citations)
                |
                v
           LS-SAS-001
                |
                v
           LS-HLD-001  [this responsibility/dependency placement]
                |
                v
           LS-LLD-001  [runtime interface/refusal requirements]
                |
                v
       CapCell PDK existing normalization  ----> existing market providers
                |                                       |
                v                                       v
       SEN/NI candidate bundle  ----> bound assay ----> deployment/readback
                                                       |
                                                       v
                                         original consumer receives/refuses
```

**AD-LS-01 — versioned opt-in:** retain `org.red-cup-engineering.capcell.v1` semantics for already-installed consumers; introduce a new explicitly opted-in specification lineage version rather than making old tests silently fail. New lineage-aware fabrication shall never be marked complete on citation strings alone. Any v1 transition policy is a separate, traced change.

**AD-LS-02 — source evidence:** SAS, HLD and LLD should be referenced at their *own* Git revisions/content identities; do not copy full papers or every claim into CapCell JSON. The verifier must verify **source bytes from a trusted provider** and a pinned identity, not assume a human-readable path exists or that `main` still points at the reviewed version. An unavailable provider or absent verified bytes is a typed unverified state.

**AD-LS-03 — admission and authority:** source digest match proves *identity/integrity*, not the theorem, mandate, publication license, implementation conformance or market settlement. Qualification and customer acceptance retain their owning office/assayer. A document styled “SAS” cannot mint its own authority.

**AD-LS-04 — bounded inference:** any probabilistic translation from prose to typed requirements must preserve original occurrence spans, competing interpretations, uncertainty and the accepted requirement ID. Hoare composition is allowed only where `R_A` actually implies `P_B` under admitted typing; identical Markdown headings are not a proof.

**AD-LS-05 — physical EDA/protein analogy:** synthesis/planning, observations, tests and iterative corrections may share a control pattern; no biochemical hypothesis implies a deployed device is safe or a code generator is correct. The [direct RSI/DSA research blueprint](https://drive.google.com/file/d/1Y4E_jfQHq-ehnYbwnxJXjlnGIfOuyW_U/view) remains *scientific/physical* research, not CapCell manufacturing instructions.

### Source-qualified FOUR/Chu and relational receiving

The [Science-owned residual/FCA bridge](https://github.com/lenticule-science/obsmetrologia/blob/2ae077eed16dd1c9f2345d0a3360563fbb3cc47e/Obsmetrologia/Language/Predicating/Residuation.lean)
already proves left and right binary-relation residual adjunctions
and the Boolean FCA closure factorization, while
[`ChuComparison.lean`](https://github.com/lenticule-science/obsmetrologia/blob/2ae077eed16dd1c9f2345d0a3360563fbb3cc47e/Obsmetrologia/Calculus/Logic/ChuComparison.lean)
defines FOUR-valued defect-zero as the exact `ChuMap` adjointness
criterion. The existing
[FOUR algebra provider](https://github.com/red-cup-engineering/computer-data-engineering-services-section/blob/main/src/four.mjs)
now contains the reusable
`symmetricEvidenceDifferenceReading` comparison; its own exhaustive
[test suite](https://github.com/red-cup-engineering/computer-data-engineering-services-section/blob/main/test/four.test.mjs)
checks a small Chu pairing/defect fixture.

The same Data Engineering source also owns the
[FOUR-valued Chu space](https://github.com/red-cup-engineering/computer-data-engineering-services-section/blob/main/lib/metrologic/src/chu.mjs).
Its `extension` is the positive FCA incidence **including** a point
with both positive and negative testimony. The [compiled
ChuSpace theorem](https://github.com/lenticule-science/obsmetrologia/blob/6ec9e246ab41053af73e8c73edf6aa5d7696db82/Obsmetrologia/Calculus/Logic/LinearLogicChu.lean)
now supplies the precise interpretation: `ofEvidence_reconstruct`
recovers the FOUR matrix from positive and negative Boolean incidence,
`adjoint_iff_both_evidences` requires both to commute under a
candidate Chu translation, and `positive_evidence_not_faithful`
exhibits the positive-only loss. [Data Engineering's
own regression](https://github.com/red-cup-engineering/computer-data-engineering-services-section/blob/main/lib/metrologic/test/chu.test.mjs)
checks all four charges, all sixteen candidate singleton translations,
a two-incidence reconstruction, accumulation of conflicting reports,
and refusal of a candidate Chu map that changes only the negative
incidence. These software cases are **committed but must still be run**
in an installed Data Engineering workspace; passing Lean CI does not
run or validate that JS module. This is the accountable
`LS-SAS-004/020` → `LSL-025/026` mathematics-to-code connection, not a new sign calculus. A **finite Chu map checker exists**;
automatically interpreting arbitrary admitted SEN expressions
as that map, preserving source context and authority, remains a
separate unreceived interface.

**Owner boundaries:** Science owns what is proved in the mathematical
relations and their hypotheses. Data Engineering owns the FOUR
point algebra and symmetric-evidence comparison. Language/SEN
Engineering owns admissible term and incidence mappings; a full
**SEN-to-Chu transport** is **not** claimed installed by
having an abstract finite Chu map checker or a FOUR defect operation. CapCell fabrication may take a
lawfully typed translation/conformance receipt only from those
owners under LS-SAS-019/020; it must not copy a new algebraic
implementation into the packaging code or equate the
*commutative* twist-product fusion with the potentially
*noncommutative* binary-relation composition. Operations must
independently verify the corresponding source/test revision and
consumer effects.

### Speech acts, nuclear recurrence and inference authority (SAS-022–026)

**Science authority.** The
[source-reconciled locution/illocution/perlocution analysis](https://github.com/lenticule-science/science-services-section/blob/main/services/information-science-services-section/services/language-science-services-section/research/marks-utterances-and-contextual-semantics.md)
owns the distinction between (1) contextual claim-cell selection,
(2) attributed, authorized FOUR evidence positing, (3) rule closure,
and (4) independent external receiver effect. The source-located
[Lean positing laws](https://github.com/lenticule-science/obsmetrologia/blob/main/Obsmetrologia/Language/Positing/Morphism.lean)
prove local knowledge-join behavior, **not** legal authority. The
[recurrence atlas](https://github.com/lenticule-science/science-services-section/blob/main/services/information-science-services-section/services/language-science-services-section/content/text/documents/articles/notes/2026/10/10/2026-10-10-note-about-l-space.md)
separates the proved nuclear quartet commuting pair, historical
triads/five-movements sketches, and the J26 and KCBS physical/topological
carriers. No object is translated into another by a word or picture.

**Engineering ownership and one existing Work Arena.** The
[FeltOS Work Arena journal](https://github.com/red-cup-engineering/feltos/blob/main/src/work/work-board.mjs)
owns **speech-act admission and replayed legality**; its move kind
records the operative force (\`request\`, \`ask\`, \`report\`,
\`declare\`, \`promise\`, \`deliver\`, \`accept\`, etc.).
It is **not** a token-based sentiment classifier, and a request or
promise may be recorded even when no independently received result
exists. The [MetroPlat World tellings
face](https://github.com/red-cup-engineering/metroplat/blob/main/src/world-tellings.mjs)
owns only the *presentation of the utterance and its attribution*:
it reads original move records even when replay deems a move invalid.
It must describe a purported completion as a **report of delivery**,
a purported acceptance as a **recorded acceptance claim**. It does
not set or mirror a legally operative board standing. The original
[FeltOS replayed board position](https://github.com/red-cup-engineering/feltos/blob/main/src/work/work-board.mjs)
and a distinct consuming office receive that effect. The
[existing world-tellings regressions](https://github.com/red-cup-engineering/metroplat/blob/main/test/world-every-opening-told.test.mjs)
are the first operational falsifier for this illocution/perlocution split,
not a substitute for live replay and consumer verification.

**No competing mathematical engine.** SCA names sources; typed SEN
represents the chosen claim/operation; FOUR's actual provider maintains
independent evidence polarities; Obsmetrologia's own abstract
Heyting/nuclear/Chu/relational laws remain the math authority.
A rule engine may read their current lawful representation only with
a versioned, explicit interpretive map and proof/test receipts. No new
\`speech-act-registry.json\`, generic "five-dimensional" type or
parallel J26 tiling solver is warranted. A gyrobifastigial material
experiment belongs in its own physical-matter engineering service;
the geometric [J26 proof carrier](https://github.com/lenticule-science/obsmetrologia/blob/main/Obsmetrologia/AperiodicOrder/Tiling/J26.lean)
is neither a customer transaction nor a proof of universal 3+1
spacetime. The independent KCBS disclination uses a 30-step boundary
and requires its own typed correspondence before transfer.

**Operations receiving.** A valid report of \`deliver\` can be
observable in one node's telling with no accepted delivery in its
home Work Arena or service effects at the consumer. That *discord*
is a real failure mode: **tell receipt \(\ne\) legal move
\(\ne\) executor output \(\ne\) installed deployment
\(\ne\) consumer acceptance**. The downstream Coesite/Group
requirements trace must retain that separation while reconciling
exact source, realm/peer decision, installed provider identity,
resource cost and independent receiving. A submitted cross-node
move that is only \`forwarded\` is still unreceived. This rule is
not a demand to append another Work Board note: it is a constraint
on the existing federation, Work Arena, and receiving services.

### HLD-B8 — RDF, SPARQL and OWL/SHACL interoperability (LS-SAS-027–029)

**Source of meaning:** [Lenticule LS-SAS-001](https://github.com/lenticule-science/linguistics-services-section/blob/main/specifications/l-space-semantic-architecture.md), now requiring RDF/SPARQL/OWL/SHACL interoperability. The identity of a word, evidence and semantic claim remains upstream in Science/SignCell/SEN/SEAVT. This HLD **does not introduce a new ontology, RDF database or proprietary query engine**. **Selected institutional graph authority:** [Science's existing source-custody OWL/SHACL](https://github.com/lenticule-science/science-services-section/blob/main/services/philosophy-services-section/services/relationality-services-section/services/agency-services-section/data/records/service-section-custody.ttl) supplies the four artifact kinds, five custodians and parameterization assertions. The existing [Red Cup Data RDF serialization/SPARQL/Graph Store family](https://github.com/red-cup-engineering/computer-data-engineering-services-section/blob/main/services/computer-content-engineering-services-section/services/computer-serialized-content-engineering-services-section/services/computer-triplet-serialized-content-engineering-services-section/README.md) supplies interoperable readers/transport. A L-Space reader may query these **only** through a qualified, populated and access-controlled named graph from the actual source owners; an empty ontology-only graph is not evidence of package conformance. No Science- or L-Space-local scanner, validator, triplestore, proprietary SPARQL parser or cross-owner authority engine is admitted.

| Interface | Existing qualified Engineering owner | Source status and receiving obligation |
| --- | --- | --- |
| RDF terms, N-Quads, Turtle, JSON-LD | [Computer Data Engineering triplet-serialized-content](https://github.com/red-cup-engineering/computer-data-engineering-services-section/tree/main/services/computer-content-engineering-services-section/services/computer-serialized-content-engineering-services-section/services/computer-triplet-serialized-content-engineering-services-section) | Existing serializers and term constructors; client must qualify graph identity, RDF term vs value identity and allowed custodial source |
| FOUR-valued EAVT/Sign testimony → RDF | Red Cup's existing `scripts/reading-rdf.mjs` and `putReadingRdfGraph` | One documentary reading: `ws:AffirmedClaim`, `ws:OpposedClaim`, `ws:ContestedClaim` retain witness provenance without asserting an unqualified positive triple or OWL negative property fact. The old fact default and `claimOnly` switch are retired. Separately qualified state/authority providers own domain-fact promotion. A named-graph PUT is source delivery, not a receipt of its accuracy. |
| W3C SPARQL 1.1 Query/Update, Graph Store HTTP | Same owner: `scripts/sparql-http-client.mjs` exposed as `./sparql-http-client` | An HTTP **client** for W3C services exists. The in-process `sparql-text` is deliberately only a BGP subset; neither is a full query server or installed endpoint |
| OWL 2 / SHACL | Same owner: `services/json-schema-to-owl-shacl-service` | Derives ontology/shapes from existing JSON Schema. Whether arbitrary OWL inferences hold and shapes validate depends on qualified third-party profiles/engines and source discipline |
| **L-Space public/agent consumer** | [L-Space MetroPlat companion](https://github.com/lenticule-science/science-services-section/blob/main/sites/l-space.561.group/src/metroplat.mjs) under the installed FeltOS/MetroPlat host | Presently CAIRN document search, read and vocabulary projection only. No verified SPARQL query endpoint, authenticated graph-store API, or live graph materialization is established. An authorized graph provider and instance binding must be installed through Coesite/host source, **not inferred from a package dependency** |

**Receiving path:** A source-owned semantic claim with graph and provenance → admitted RDF projection → authorized RDF provider write → provider readback with RDF/SPARQL standard clients → outside Science/Group receiver compares the original claim and time/evidence standing. For updates, only the graph's rightful controller can write. An HTTP 2xx response from an arbitrary endpoint is not independent authorization or consumer acceptance. Access policies must respect private/public and client provenance at every read and query; SPARQL selection must be scoped to those admitted named graphs.

**Negative cases:** a literal resembling an IRI must not be treated as an IRI; a repeated witness event does not create duplicate RDF triples; an event timestamp is not itself a timeless triple identity; source contradictions must not collapse into an `owl:sameAs` equivalence or unqualified positive assertion; unsupported SPARQL operators must not silently return empty sets; a raw Markdown search result is not an OWL class; authenticated private graphs must not become publicly discoverable through SPARQL federation.

**Source-validated, but not yet received:** 7 transport test cases for SPARQL/Graph Store and 3 Native-Reading-to-Graph-Store tests were executed in an isolated simulation of the committed code and protocol interfaces. This is not native Node CI, installed Jena/Fuseki/Oxigraph, an authorized graph-store instance, or a received external query. Actual source package packaging, installed dependency pin, server integration and outside graph-read remain separate requirements.

### HLD-B9 — source-typed institutional utterances and proof-path receiving (LS-SAS-030–036)

**Architectural object:** an admitted source-scoped utterance, not a newly created work/agency ontology. Interpret its `(source revision, token occurrence, locution, typed claim, evidential stance, actor/office authority, event witness, receiver)` under the existing Science-owned [March 28 synthesis](https://github.com/lenticule-science/science-services-section/blob/main/services/information-science-services-section/services/language-science-services-section/content/text/documents/articles/notes/2026/10/10/2026-10-10-note-about-l-space.md) and the Group's present Operational Method. Its output can be navigated in L-Space without pretending that a parsed statement holds in corporate reality. The candidate epistemic staging **Absurd → Possible → Necessary → Determined** belongs to the **world-qualified March 28 inquiry senses** in the original Science-owned [Relationality SKOS vocabulary](https://github.com/lenticule-science/science-services-section/blob/main/services/philosophy-services-section/services/relationality-services-section/data/records/ontology.ttl), queried through the existing [SPARQL term reading](https://github.com/lenticule-science/science-services-section/blob/main/services/philosophy-services-section/services/relationality-services-section/data/records/queries/march28-world-qualified-glossary.rq). The spellings are **not** FOUR evidence corners, modal `□/◇`, the later derivation operators `Possibilizing`/`Necessitating`, task obligations, or a new lightcone metric. A lexical ambiguity in two worlds is not automatically two *secondary intensions* in a two-dimensional semantic model. The owner-held [Frontmatter Presentation](https://github.com/lenticule-science/science-services-section/blob/main/services/information-science-services-section/services/language-science-services-section/content/text/glossary/terms/frontmatter-presentation.md) and [World-indexed Term Sense](https://github.com/lenticule-science/science-services-section/blob/main/services/information-science-services-section/services/language-science-services-section/content/text/glossary/terms/world-indexed-term-sense.md) define distinct admission roles. This is a required HLD source/consumer distinction, **not** permission for CapCell to create a second lexicon, term engine, or user-controlled equivalence table.

**Reuse/consumer assignment.** Red Cup's canonical RMN `proof-path-structuration-service` is the sole code and schema owner of earned structural coordinates. The old generic file-path package export, shim and duplicate test have been deleted; its valuable occurrence/revision assays now live in the canonical service's test. Its generator witnesses are supplied input and are not authenticated theorem proofs or office permissions. SignCell/SEN/SEAVT retain separate claim/event authority. Red Cup Data's `reading-rdf.mjs` projects one documentary, source-addressed graph for affirmative, opposed and contested testimony (`ws:AffirmedClaim`, `ws:OpposedClaim`, `ws:ContestedClaim`), never promoting an authored sentence to an asserted RDF domain fact. W3C Graph Store writes require a graph owner and named-graph authorization; independently received facts remain the competent authority's separate act. The JSON-Schema→OWL/SHACL operator now refuses unsupported constraint families (including duty-schema `anyOf` and `additionalProperties:false`) rather than shipping a partly checked shape as a complete validator. This is current source capability, not live L-Space installation.

**Institutional and receiving boundary.** Coesite's reusable skills/duties and Group-owned incumbencies remain source-owned operational instances; L-Space documents them as source-attributed *readings*. A frontmatter `incumbent: X` in a personal or untrusted file must be browsable as a **claim** but must not be indexed as an authorized office fact. A contract recital, promise, governance vote, ledger transfer, job dispatch, execution and received effect are different predicates with separate actors, source versions and current authority. The actual Work Arena, corporate office and receiver provide qualified state. OWL open-world entailment cannot invent denied/missing facts, and SHACL validation is not a signature, appointment or independent receiving.

**Public/market interoperability.** Consumer capability must use the current Recommendation baselines (W3C OWL 2, SPARQL 1.1 Query/Protocol/Update, Graph Store HTTP and SHACL 2017) where actually implemented and tested; [SPARQL 1.2 (11 October 2026 working draft)](https://www.w3.org/standards/history/sparql12-query/) and [SHACL 1.2 Core (13 October 2026 working draft)](https://www.w3.org/TR/shacl12-core/) are independent optional compatibility tracks, **not** promises of already shipped 1.2 conformance. Measure practical differentiation by externally repeatable provenance navigation, authorized named-graph queries, explainable contradictions and source-to-receiver traceability, not by adding an unreviewed proprietary ontology. The installed L-Space MetroPlat entrance presently serves archive documents and vocabulary; it must not advertise a W3C SPARQL endpoint until an existing qualified provider is configured, access-tested and independently read through the actual host.

**Refusal probes:** same word/different revision yields different occurrence identity; unsupported `sen1` and the deleted generic proof-path export cannot be used; synthetic structural witness paths do not prove CHL results or confer authority. A source's assertion `incumbent: X` does not imply a corporate appointment; its reported denial does not entail an OWL negative property assertion; contrary testimonies coexist. A promised task, invoice or ledger transfer is not receiver settlement. An attempted OWL/SHACL translation that would discard `anyOf`, closed-record or nested-object constraints must refuse, not publish a misleading validator. Unproved causal morphisms and unseen provider receipts remain genuine obstructions.

### HLD-B10 — canonical institutional language engine and multi-owner corpus (LS-SAS-030–038)

**Decision and receiver.** Reuse Red Cup's **existing SignStuff semantic engine** and source-owned Group/Coesite Work operations. L-Space is a qualified human/agent *view* over those sources and is not the engine, triplestore, or authority. This HLD is a candidate integration design, **not** a deployed service. The existing **Red Cup Digital Garden Systems** `l-space-metroplat` application imports CAIRN document reading and vocabulary as upstream services; the native SignCraft institutional/typed-claim knowledge reader remains an explicitly **unreceived cross-owner integration**, not an installed feature implied by the interface. A local Science `sites/l-space.561.group` executable is **retired**, not another reader to update.

| Architecture leg | Current source-owned interface | Admissible effect / necessary refusal |
| --- | --- | --- |
| Immutable source | Git Services exports semiotic-lineage-control, source-path-proof, source-observation | Bind repository identity, commit, tree/blob, occurrence span, claimant, jurisdiction and time; neither filename nor commit grants meaning or authority |
| **Documentary concept admission** | Existing Red Cup Markdown `@red-cup-engineering/markdown-engineering-services-section/project-markdown-semiotic-concept-universe` → native SignCell `@red-cup-engineering/signcell/semiotic-concept-universe` (create, select, differentiate); source tests `project-markdown-semiotic-concept-universe.test.mjs` and `semiotic-concept-universe.test.mjs` | Hash exact source text and preserve declared identity, references, diagnostics and opt-in publication *eligibility*, never infer corporate authority, rights or received action. Authored `same_as` yields **unverified-identity**, not a quotient/equality relation; absent/dangling `ann` references remain diagnostic. The v2 carrier requires unique concept IDs: two independently authorized sources both declaring `id: duty` cannot be combined into one unscoped universe. Keep per-owner source identity/context intact and refuse an unqualified collision until its owning source-qualified mapping is admitted; never silently merge, rename or publish one author through another. Public selection still requires explicit source visibility and separate receiver authorization. |
| Typed language and claims | Lenticule Linguistics shared language-engine/index; Red Cup Data SignCell semantic-claim/cell, SEN/SEAVT | A contextual parse is a *candidate* reading; separate FOUR for/against evidence and actual source witnesses from grammar and raw frontmatter |
| Rules and contexts | Red Cup SignChain rules, SignGraph site/fiber/valuation | Keep typed rules, versioned FCA incidence, restriction/specialization morphisms and reversible proof obligations; never confuse source analogy with a legal permission |
| **Operational knowledge kernel** | Red Cup SignCraft exports knowledge-base: KnowledgeBase.tell/tellAgainst/withRules/withSpecializations/settle/readingAt/claimsFor/subjectsFor | Consume source-qualified evidence and signed typed rules, preserving opposed readings; the convenience articulate(token,claim) uses the token as its own witness and must **not** certify institutional attribution |
| **Occurrence and causal graph** | SignCraft history: historyRawOccurrences, historyDerivation, mergeHistories; inference/trace: contextFromTrace | Retain exact revision+cell-index even for repeated bytes, archival uncertainty, time-scoped EAVT witnesses and explicit positive/negative FCA incidences; timestamp sort is not causality |
| **Kinematic proof motion** | SignCraft inference/kinematic: motionOfDerivation/scheduleOfDerivation; proof-motion-carrier | Validated finite dependence graph, open assumptions and wavefront; CHL proof type, causal A6/A8 relation and chromatic-Lorentzian metrics require *separate* warranted maps |
| **Institutional authority and effects** | Group corporate agency/Work Arena, MetroPlat world-tellings, Coesite reusable operation data | Duty, mission, endeavor, plan, task, actor, character, office, obligation, contract, ledger, message and receiver retain native types and owners; an utterance reporting completion is not a received effect |
| **Machine ontology / standard Web** | Data Engineering reading-rdf, existing JSON-Schema-to-OWL/SHACL and W3C SPARQL client; qualified external RDF provider | Read authoritative named graph under its ACL; disputed source claims remain reified, not bare office appointments; in-process restricted BGP is not a SPARQL 1.1 provider |

**Deployment and access topology.** The actual L-Space source is [Red Cup Digital Garden Systems `apps/l-space-metroplat.mjs`](https://github.com/red-cup-engineering/computer-engineering-services-section/blob/main/services/computer-systems-engineering-services-section/services/computer-knowledge-systems-services-section/services/digital-garden-systems-services-section/apps/l-space-metroplat.mjs), selected by original Cold Red Gate and Bare Cedar Fog **Group-owned MetroPlat profile instance data** as `@red-cup-engineering/digital-garden-systems-services-section/l-space-metroplat`. Its `root`/`sciencePrefix` parameter selects a restricted CAIRN **Science-document source**, not a Group authority graph. The Science-local app and manifest were deleted after exact Engineering receiving and must not be resurrected by following old notes. The authentic Academy professional-repertoire source mount was still absent from the visible BCF Operations forest when investigated, so the optional private professional-form reading is **not proven installed**. Do not fix missing operational language by clearing the prefix, copying private Group records into a Science corpus, or trusting self-declared public visibility. Host deployment must select separately authenticated and versioned Group, Coesite and Science sources through the existing repository/Git/SignStuff and Work infrastructure, keep each owner's access rights and publishing grants intact, then expose a *joined authorized reading* at the actual L-Space consumer. The archive remains one source-document projection, not a parallel ledger. Guix/LAGOON and the selected registry/host release must independently receive the final package imports.

**Constitutive recipient queries and negative controls.** One qualified user should traverse (1) an exact 'duty' token occurrence → source revision → typed duty → qualified office/incumbent/claimant; (2) endeavor/campaign/project/plan/task/work-item and the *goal's independent evaluation*; (3) a contract obligation → actual journal/ledger posting → settlement → customer acceptance as *distinct* acts; (4) a contested governance utterance with simultaneous witness-for and witness-against, without Boolean explosion; (5) a source-qualified SignChain derivation through SignGraph fiber and SignCraft motion, including unproved premises and context-dependent FCA closure; and (6) the graph's authorized RDF SELECT, ASK and CONSTRUCT results via a standard SPARQL 1.1 endpoint. Two same-spelled word occurrences from different source spans or revisions retain distinct occurrence IDs even if they resolve to the same term.

**Tested supplier versus pending composition.** The actual pure SignCraft inference/kinematic.mjs blob c4c889051f80f8cc4389205157e0f7280ccd127b was exercised in an isolated V8 source evaluation: a four-event diamond/parallel wavefront, missing-given refusal, cycle refusal, missing antecedent, invalid available input, and a 24,000-event chain passed. This is not a native workspace test, Lean result, installed consumer or live L-Space acceptance. **Source integration re-qualification (2026-10-14).** Red Cup Computer Engineering [PR #403](https://github.com/red-cup-engineering/computer-engineering-services-section/pull/403) has merged its SignCraft `KnowledgeBase.document`/`documentOfSettlement` source; Data [PR #175](https://github.com/red-cup-engineering/computer-data-engineering-services-section/pull/175), [#177](https://github.com/red-cup-engineering/computer-data-engineering-services-section/pull/177) and [#178](https://github.com/red-cup-engineering/computer-data-engineering-services-section/pull/178) have merged their underlying valued-cell, document-spine and HTML carriers. Data [PR #179](https://github.com/red-cup-engineering/computer-data-engineering-services-section/pull/179) was closed **without merging** after its entire six-file changed set was compared with current Data `main`: all six blob IDs match. The actual `@red-cup-engineering/signcell/document-spine` package export exists on Data main. Source availability has advanced, but cross-owner native package execution, dependency selection in the current CE/host workspace, Guix/LAGOON installation and L-Space recipient use have **not** thereby been received. The main SignCraft kinematic workflow [run #38649211832](https://github.com/red-cup-engineering/computer-engineering-services-section/actions/runs/38649211832) failed in both original and retried attempts without retrievable steps/logs; classify its native test result as **unverified**, not as a proved code regression or a pass. MetroPlat [PR #34](https://github.com/red-cup-engineering/metroplat/pull/34) and [PR #50](https://github.com/red-cup-engineering/metroplat/pull/50) remain open conflicting drafts. **Observed common-forest ancestry.** The open [Computer Engineering PR #400](https://github.com/red-cup-engineering/computer-engineering-services-section/pull/400) at head `1544600ffc4e0b082f206a35f475897c8691c9e7` selects gitlinks Data `90c65706414d25595ba92213ef72e5a3a76f37bd` (the closed composite) and Code `65d7ae712d4fdb0e250d598697a09aceefcd65b1`. Against the observed upstream tips Data `63d37e0b96fe86fbb4006afe478865e111e7ed74` and Code `62d0920636af820bf9ae72545a3deacb88b82b55`, GitHub's commit comparison reports **Data diverged (main 25 ahead, 1 behind)** and **Code main eight ahead, zero behind**. The CE mainline itself still selects Data `fb6f8197347a180b14a97efb35f6d8f6b08fb00d` (57 behind upstream) and Code `3847ef20090afe6981502f6b5b992d03bcc5971e` (31 behind upstream). These are source-edge measurements, not a claim that source is installed, nor permission to discard the composite branch's unique other files. The closed Data head is not an admissible fast-forward to current Data main; choose and qualify the mainline supplier with source/consumer tests through the existing Code continuous-delivery operation, preserving PR #400's distinct work.

**Next admission:** select exact *merged* Data/SignCraft source revisions in the existing CE/common and host dependencies, run native interface and negative authority/FOUR tests, then independently receive installed L-Space queries. Do not resurrect the closed composite draft or create L-Space-local graph processors. New downstream L-Space-local graph processors, rewritten FOUR lattices, source stores, authority shims and reduced SPARQL servers are explicitly rejected alternatives.

## 4. Information and interface views

A lineage-aware candidate needs **no separate registry artifact**. The **existing v2** typed specification already carries the exact legacy `lineage.sas`, `lineage.hld`, `lineage.lld` source pins, whose files remain with their owners. Their source-integrity check is useful and must be preserved, but this *three-pin schema* is not a complete five-stage lifecycle or a universal representation of a requirement. Any richer staged-evidence input must be specified, fabricated and received as a deliberate profile evolution through the actual upstream provider. Its materialized manifest must distinguish:
- **declared lineage** (caller claims references),
- **verified source integrity** (actual bytes match pinned digest under a trusted/observable fetch),
- **qualified scientific/design assertions** (owning Science/Engineering receiver),
- **independent provider operation and consumer acceptance** (not in this fabricator's control).

Work order `W` shall name consumer, intended effect, versioned spec source chain, precondition `P`, promised postcondition `R`, refusal, and objective acceptance test. This is an *engineering interface requirement*, not a claim the v1 `CapCellSpecification` already stores `W`.

### Requirements-graph receiving is contractual, not inferred from a note

A source repair is a genuine, independently testable effect for
some demands; a public offer, deployment or sale requires a later
effect. The existing Group
[requirement-to-receiving graph](https://github.com/561-group/561-group-services-section/blob/main/services/561-group-operations-services-section/lib/requirements-trace.mjs)
now accepts an opt-in `receivingStages` list on the **original
requirement**. `['engineering','operations','service']` obliges
each verified stage on that requirement's own causal path and
requires an external authenticated verifier for the service
receipt; omission keeps code-only contracts backward compatible.
The gate does not staff the work, trust caller-asserted source
authority, or infer a consumer effect from green CI. No duplicate
work queue, universal waterfall or second ledger is authorized
by this additional receiving predicate.

## 5. Verification and receiving

Existing tests in `test/capcell-manifest-fabrication.test.mjs` are the regression baseline; any enhancement must retain v1 input/output identity and explicit one-operation/capability behavior. [LS-LLD-001](./l-space-lld.md) specifies positive and negative v2 cases and the falsification tests. Verification order: (i) source bytes/admission; (ii) normalized specification and Hoare precondition; (iii) semantic NI identity; (iv) provider-cell binding; (v) independent assay; (vi) actual deployment readback; (vii) consumer acceptance. A skip cannot be explained away by “LLM synthesis,” mathematical analogy or a CI green check.

**Current implementation finding (2026-10-14):** the opt-in v2 source-lineage gate **already exists** in the owning [CapCell fabricator](../services/capcell-manifest-fabrication-service/src/fabricate-local-capcell.mjs). It exports `fabricateVerifiedCapCell`, validates exact SAS/HLD/LLD source pins, hashes source bytes through the authorized reader, and keeps bare v2 fabrication unrealized; [the dedicated source-lineage tests](../test/specification-lineage.test.mjs) include tamper, refusal, wrong-profile, read-failure and source-qualified identity cases. The [package-backed fabricator](../services/package-backed-capcell-fabrication-service/src/fabricate-package-backed-capcell.mjs) separately refuses caller-asserted settlement without an authenticated source- and package-provider checker. This establishes source **presence and specified tests**, not that CI was executed in this review or a production installation succeeded.

**Current exclusions and next receiving duty:** no independently received L-Space corpus, deployed customer CapCell, universally proved Lorentzian semantics, scientific acceptance by digest, credentialled outside provider or source-retirement completion is established. The next work is to run the existing PDK suite in the installed workspace, exercise the qualified provider-read seam with real immutable source revisions, verify a Coesite installation and receive one original consumer result. Do not reimplement the existing v2 gate or create another service to satisfy this already-owned requirement.
