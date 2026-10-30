# Source-bearing fabrication receipt Cells

## Required receiving

The existing JSNode receipt emitter shall preserve the complete admitted fabrication source and expose its requirements, exact candidate, materializations and reported assays as native SignCells in the ordinary EAVT trace. A later reader shall recover those Cells from serialized rows and replay their projection against the original admitted receipt. Existing package-world facts remain available.

This applies to `foldFabricationReceiptIntoWorldRows` and its existing `emit-fabrication-receipts-to-eavt` caller. It does not create a new ledger, fabrication controller, assay executor or acceptance authority.

## Sources and boundaries

The domain admission owner is `admitMarkdownJsnodeOperationPackageFabricationReceipt`. It retains the existing specification/order/creation/realization identity checks and version-3 prior-clause-assay reconstruction. SignCell owns Cell admission, content identity, immutable carriers, evidence joins and the JSON Schema of a native Cell. EAVT owns the ordinal row carrier and its persistence. The dependency points from this JSNode consumer to SignCell; EAVT does not import Cells.

The scientific boundary is the performed-source distinction in Obsmetrologia `Language/Spine.lean` and `Language/Predicating/Cell.lean` at `a8515044eb632f4fc3b639e3b3d8d106e64b90ff`: a projection cannot generally reconstruct a source it discarded. A valid shape, a posited value, observed execution, and independent receiving are separate claims. This implementation is a source-retaining computational projection, not a new theorem or source-authentication procedure.

## Interface and representation

`projectFabricationReceiptCells({receipt, source?})` admits the complete original receipt and returns `JsnodeFabricationCellProjection@1`. An optional `source` is a closed record containing a nonempty `locator` and/or nonempty `occurrence`; it records caller-supplied source presentation, never authenticated origin. Omission means content-only identity. A supplied receipt path remains part of the retained receipt and witness context. Numeric trace ordinals are never interpreted as original event identity or an absolute clock.

Public requests and received row carriers are snapshotted by native `retainedCarrier` before reading any field. Getter-bearing data records and values outside its inert data domain refuse before getter execution. Literal locator, occurrence and receipt-path strings are retained as supplied. Positive witnesses also bind each literal through the shared `utf8-json-string-hex` observation encoding (`bytesToHex` of UTF-8 `JSON.stringify` bytes), so native semantic Unicode normalization cannot collapse distinct supplied identifiers. This is an observation basis inside ordinary native identity, not a replacement identity algorithm or an expansion of the native text domain.

This receipt projection crosses the existing ordinary EAVT JSON wire, whose value domain is narrower than SignCell's native carrier. After native getter admission, and before using its snapshot or invoking receipt domain admission, the existing JSON provider's `canonicalJson` admits the ORIGINAL complete request, including unknown receipt fields. The original matters: native retention can omit an undefined object property, so checking only its returned snapshot would miss that loss. BigInt, byte arrays, undefined and nonfinite values refuse with `INVALID_FABRICATION_RECEIPT_WIRE`. Negative zero also refuses: the native carrier retains its sign, but the actual EAVT encoder writes positive zero. No value is coerced or dropped. The same JSON-preserving profile applies to received projection/row carriers, and negative zero is not an admitted trace ordinal. SignCell's native value domain is unchanged.

The qualified ingress is ordinary JSON carriers and ordinary accessor refusal. The production emitter parses JSON files. The native providers can invoke traps on arbitrary JavaScript Proxy objects; this qualification does not assert general Proxy inertness. No separate proxy walker or substitute JSON codec is introduced here.

The result binds:

- `receiptId`, the native semantic identity of the complete admitted carrier;
- `candidateId`, the native semantic identity of the typed package name/version/files-digest/specification-digest tuple;
- the supplied presentation or null;
- an evidence-bearing canonical Cell set;
- the ordered Cell addresses from which legacy facts are projected.

One Cell retains the complete admitted receipt. Queryable Cells retain the original source, specification, work order, each requirement/prohibition/constraint/projection/acceptance obligation, every materialization and complete assay, traceability, derivation attempts/proofing and publication report. Unknown receipt fields remain in the complete source Cell. Every positive projection witness cites the receipt/candidate identities and exact JSON pointer(s) in that receipt. Receipt-derived statements explicitly mean reported/admitted content. `independently-received`, `customer-accepted` and `deployed` coordinates have no manufactured witness.

The original `constituted` attributes and legacy fact values come from this same field mapping. Both derivation versions 2 and 3 retain the work-order specification digest. Historical version-1 or authored receipts do not acquire a fabricated order digest.

`admitFabricationReceiptCellProjection(projection, request)` reexecutes the complete native projection from the original receipt/presentation and compares native semantic identity. A changed candidate, requirement, witness, omitted record, invented acceptance or different source presentation refuses. The canonical replayed result is returned on success.

`foldFabricationReceiptIntoWorldRows({receipt, t, source?})` keeps the original `WorldRowsFold@1` fields and first constituted row, derives old facts from the projection's ordered native Cells, and appends every native Cell under `jsnode-fabrication:cell`, keyed by its original SignCell address. It also returns the same `cellProjection` for an in-process consumer. The existing emitter already persists every returned row, so source Cells reach its ordinary storage path. Safe-integer ordinal validation and whole-output overflow admission occur before output is returned.

`readFabricationReceiptCellRows(rows)` reads only that explicit domain attribute, admits each native Cell, checks its row entity against the Cell address and returns their canonical evidence-preserving join. This is ordinal EAVT storage, not SignCell's absolute-time SEAVT wire format. Readmission against a particular receipt/presentation remains the separate replay operation.

## Laws and refusals

1. Complete receipt admission precedes projection and persistence. Partial, refused or independently mixed histories produce no world rows.
2. Cell addresses name the triple; two source presentations can provide distinct witnesses to the same claim. Exact replay of one presentation contributes no new witness after canonical join.
3. Candidate claims include exact file/specification identities. Same package name/version does not collapse different candidates.
4. The full admitted receipt is retained without rewriting its values or inventing absent provenance. JSON round-trip followed by admission preserves it.
5. All old facts and their detailed source Cells are derived from one authoritative mapping. Old row order/address behavior remains, apart from the deliberate version-3 digest repair and appended source Cells.
6. Receipt-reported assay/acceptance records never create independent execution, customer acceptance, deployment or authority evidence. Contradicting source evidence survives the native join.
7. The wire schema is JSON Schema 2020-12 and reuses SignCell's exact native Cell schema. Shape validation is separate from source replay.
8. Invalid presentation fields, active request/row carriers, non-JSON or JSON-lossy receipt extensions, forged Cell addresses, non-Cell payloads, non-safe ordinals and output ordinal overflow refuse explicitly. A nonfinite ordinal is outside the native data domain and refuses there before domain interpretation. No public fold is returned for a refused receipt, so its consumer cannot append an earlier prefix of legacy rows before discovering the wire defect.

## Verification obligations

Use the actual Markdown/Data admission and original creation-receipt schema to construct controlled complete receipts without registry publication or inference. Native tests shall cover rich source retention, requirement/file/assay queryability, version-3 order digest, candidate distinction, same-presentation idempotence, distinct occurrences, opposing evidence, complete wire round-trip, wrong-source replay refusal, malformed wire/source/ordinal refusals, legacy compatibility and unknown external receiving. Getter-bearing wrappers/rows must refuse without getter execution; distinct NFC/NFD literal identifiers must remain distinct witnesses and refuse cross-presentation replay. Exercise the existing emitter against a real temporary receipt directory and JSONL EAVT trace, then read back native Cells. A controlled receipt fixture is not evidence that its reported package was actually built; the tests establish projection, admission and persistence behavior only.

The original public-wire probe admitted a BigInt extension and returned 55 rows; the real EAVT writer appended 19 before refusing the first non-JSON value. Preserve that counterexample. Regression receiving must refuse BigInt, bytes, undefined, nonfinite and negative-zero extensions before the first append, while complete JSON extensions survive real EAVT readback exactly.

Run the focused pure tests through Node, the existing affected receipt suite, and the package's test plan as capacity and exact declared providers permit. Report registry-dependent, missing-provider or other unexecuted cases separately from passes. Package publication, installed host receiving and the original market requirement remain distinct obligations.
