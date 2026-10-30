# CapCell PDK — source-bound capability fabrication

A CapCell is one independently market-addressable actor offering **one effectful capability**. Its kernel, law, schemas, actor identity, offers, provider bindings and receipts are facets of that one cell—not a monolithic process that quietly owns its dependencies. Effectful A2A, ActivityPub++, OCapN, CapTP, x402, hosting, deployment and witnessing are separately bound provider cells. Inert in-process materials have no independent effect authority.

The existing PDK `services/capcell-manifest-fabrication-service/src/fabricate-local-capcell.mjs` is the one fabrication implementation. It normalizes typed specifications through the existing SEN/NI content identity substrate, rejects extra operations and invalid/effectful material, and issues a content-addressed **candidate**, not a deployed or customer-received service. `assertCapCellComplete` refuses an unrealized candidate; `fabricateLocalCapCell` can return that candidate and its missing evidence without pretending it was realized.

## Specification lineage (opt-in profile v2)

The semantic and scientific requirements belong in Lenticule Science's [L-Space SAS](https://github.com/lenticule-science/linguistics-services-section/blob/main/specifications/l-space-semantic-architecture.md). Engineering placement is [LS-HLD-001](specifications/l-space-hld.md); the tested contract is [LS-LLD-001](specifications/l-space-lld.md). These three records cite the upstream Hoare/ribosome/protein-fold/EDA research and scoped Obsmetrologia proofs, distinguishing models, metaphors and verified statements.

`org.red-cup-engineering.capcell.v1` remains supported unchanged. New `org.red-cup-engineering.capcell.v2` opts into `lineage: {sas, hld, lld}`. Each source pin contains `uri` (canonical HTTPS source), `revision` (explicit immutable source-native revision) and `sha256` (digest of **exact source bytes**, not a Git blob SHA). The source files stay in their owning repositories—**no copied research corpus, registry JSON or new “specification engine”**.

**Fail-closed:** the pure `fabricateLocalCapCell(v2, evidence)` always reports `lineage:sas:unverified`, `lineage:hld:unverified` and `lineage:lld:unverified`, even if every downstream provider is advertised. This prevents reference strings or an LLM's assurances from being counted as source readback.

An authorized source adapter may invoke:

```js
import {
  fabricateVerifiedCapCell,
  assertCapCellComplete,
} from "@red-cup-engineering/capability-cell-fabrication-services-section";

const candidate = await fabricateVerifiedCapCell(specification, evidence, async ({kind, uri, revision}) => {
  // Bind an authorized source provider; return exact Uint8Array bytes
  // of the requested immutable source revision, or refuse.
  return sourceProvider.readExactRevision({kind, uri, revision});
});
const manifest = assertCapCellComplete(candidate);
```

The `assertCapCellComplete` guard re-derives the SEN/NI identity of the **actual** supplied specification and manifest and verifies that they correspond. For v2, source qualification belongs to the exact in-process verified-reader return: a copied JSON manifest, matching self-reported IDs, or an HTTP `digest-verified` field is **not** a replayable source-read credential. Call the authorized reader again, or use the independently authenticated provider-native receipt of a separate receiving boundary. The single [CapCell schema](content/schemas/capcell-spec.schema.json) now encodes v1 (no lineage) and opt-in v2 (three required distinct source pins), with the executable normalizer enforcing the full shape.

This checks SHA-256 source **integrity**, not paper validity, permission, production installation, actual payment or original consumer acceptance. Caller-supplied readback is still only as authentic as the bound provider. `writeLocalCapCellBundle(spec, outputDir, evidence, {readLineage})` uses the same check and writes the existing `capcell.spec.cbor`, `capcell.manifest.cbor` and `capcell.manifest.json` projections. A digest mismatch or failed provider read refuses explicitly; no fallback to an unpinned branch.

## Package-backed source and settlement receiving

The original `package-backed-settlement-assay-service` now gives an exact, bounded **declaration-cover admission**, not a false claim of installed or operational closure. It requires the package manifest's *direct* runtime `dependencies` names to match the specification's inert `materials` package names in both directions. Missing required material, foreign dependency, malformed declaration, duplicate/effectful material or non-data dependency field produces a typed defect and `settled: false`. Unexamined optional/peer/bundled dependency families and npm install/packing lifecycle hooks are explicit refusals rather than invisible alternative paths for runtime code. An empty declared cover is acceptable only when the specification declares no materials. The receipt's `scope: "declared-direct-runtime-dependencies"` means **neither installed bytes, semantic identity, permissions, transitive closure nor customer receiving are certified**. The existing source-contract test enumerates all 64 three-material declaration pairs, checks negative boundaries, and invokes the actual Worker. Any richer npm dependency form requires its actual owner to supply a qualified assay instead of weakening this admission.

The existing [package-backed fabricator](services/package-backed-capcell-fabrication-service/src/fabricate-package-backed-capcell.mjs) composes a fabrication provider and a distinct package-settlement assayer. For opt-in v2 it **fails closed** unless both provider-native attestations are independently verified: `verifyFabricationReceipt({specification,expectedLineage,manifest,fabrication})` and `verifyPackageSettlementReceipt({specification,packageManifest,fabrication,packageSettlement})`. A return value of literal `true` is required from each qualified callback. The provider responses must also show no missing facets or package-assay defects, match the source pins, and bind the same exact package name/version. A raw HTTP JSON body saying `settled:true` cannot authorize itself.

The generic Worker does not presently supply either authenticated verifier, so it cannot settle a v2 package from provider-only assertions. This is a **receiving obligation**, not an excuse to add another signature registry or pretend the market path is live. V1 package behavior is retained. Even a genuinely attested package settlement is not a customer receipt, deployment readback or scientific theorem.

## CLI (candidate fabrication)

```bash
capcell fabricate ./capcell-spec.json --output ./build/capcell
capcell fabricate ./capcell-spec.json --evidence ./capcell-evidence.json --output ./build/capcell
```

The CLI performs **no remote source fetch or implicit authority admission**. Therefore a v2 candidate from the CLI alone remains `unrealized` (exit 2 with typed missing lineage), unless a future separately admitted source-provider adapter is wired into the CLI. For v2 verified byte admission today, use the SDK callback. Source-provider identity and receipts are independently qualified by the consuming workflow.

`--package-manifest` has historically appeared in example commands but the current CLI does **not** interpret it. Do not infer that passing this flag performs a package-backed settlement assay; bind the existing `package-backed-settlement-assay-service` separately as an independent provider when that effect is required.

Run `npm run verify` where the actual private workspace dependencies are installed. The existing regressions are `test/capcell-manifest-fabrication.test.mjs`; v2 integrity/refusal checks live in `test/specification-lineage.test.mjs`. A source commit or passing local test is not independent operational receiving.

## Atom admission boundary

Candidate bundle fabrication does not decide semiotic atomhood. Such admission belongs to the separately owned SXC-M4 semiotic voxel arena (the previous relative module reference has no verified standalone GitHub repository; do not invent a GitHub link) under its own (2,3) pebble-game and causal scope. Package fabrication, normalization, membrane admission and settlement remain distinct receipts of the subsequently admitted effect, not competing atom factories.
