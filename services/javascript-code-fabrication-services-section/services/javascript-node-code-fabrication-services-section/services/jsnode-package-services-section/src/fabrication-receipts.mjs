import { assayCasesOfDelivery, testsOfClosure } from "./derive-jsnode-package-from-closure.mjs";
import { constitute } from "@red-cup-engineering/eavt-services-section";
import { admitArtifactFabricationRealizationReceipt, admitArtifactFabricationSpecification } from "@red-cup-engineering/computer-data-engineering-services-section/artifact-fabrication";
import { admitJsnodeOperationPackageCreationReceipt } from "./admit-jsnode-operation-package-creation-receipt.mjs";
import { semanticId } from "@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address";
import { canonicalJson } from "@red-cup-engineering/json-services-section/canonical-json";
import { address as cellAddress, admitCell, bytesToHex, cell, cellSchema, cellSet,
  retainedCarrier, semanticId as cellSemanticId } from "@red-cup-engineering/signcell/cell";

function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) immutable(item);
    Object.freeze(value);
  }
  return value;
}

function receiptAdmissionError(code, message, refusalRecord) {
  const error = new TypeError(message);
  error.code = code;
  error.receiptRefusal = refusalRecord;
  return error;
}

/** Reconstruct clause tests from the original order, never from a receipt's claim. */
export function admitClauseAssayDerivation(order, configuration, derivation) {
  const first = derivation?.attempts?.[0];
  if (first?.phase !== "clause-assays" || first.outcome !== "derived"
      || derivation.attempts.slice(1).some(item => item.phase === "clause-assays")) {
    throw receiptAdmissionError("MISSING_PRIOR_CLAUSE_ASSAYS", "clause assays must precede source attempts");
  }
  const original = order.projections.find(item => item.configuration?.operations)?.configuration;
  if (!original) throw receiptAdmissionError("MISSING_WORK_ORDER_OPERATIONS", "clause assays require the original operation contract");
  const closure = { ...original, requirements: order.requirements, prohibitions: order.prohibitions, constraints: order.constraints };
  let admitted;
  try { admitted = assayCasesOfDelivery(JSON.stringify({ cases: first.cases, question: null }), closure); }
  catch (error) { throw receiptAdmissionError("INVALID_CLAUSE_ASSAYS", error.message); }
  const expected = testsOfClosure(closure, admitted.cases);
  if (semanticId(expected) !== semanticId(configuration.tests)) {
    throw receiptAdmissionError("CLAUSE_ASSAY_TEST_BINDING_MISMATCH", "realized tests must be exactly the projection of admitted examples and prior clause assays");
  }
  return immutable({ cases: admitted.cases, tests: expected });
}

/**
 * Re-admits the complete fabrication receipt that crosses from fabrication to a
 * receiver.  The realization evidence must name the exact admitted creation
 * receipt that the fabricator produced; independently valid records cannot be
 * combined into a new history.
 *
 * @param {object} receipt A MarkdownJsnodeOperationPackageFabricationReceipt.
 * @returns {object} The receipt with its specification, creation, and realization records canonically admitted.
 * @throws {TypeError} When any record is absent, refused, or not bound to the born package.
 */
export function admitMarkdownJsnodeOperationPackageFabricationReceipt(receipt) {
  if (receipt?.type !== "MarkdownJsnodeOperationPackageFabricationReceipt" || receipt.version !== 1) {
    throw receiptAdmissionError("MISSING_REALIZATION_RECEIPT", "fabrication receipt must be a complete MarkdownJsnodeOperationPackageFabricationReceipt");
  }
  const specification = receipt.artifactSpecification;
  if (specification === null || typeof specification !== "object") {
    throw receiptAdmissionError("MISSING_ARTIFACT_SPECIFICATION", "fabrication receipt has no artifact specification");
  }
  const { type, version, specificationDigest, ...specificationCandidate } = specification;
  const admittedSpecification = admitArtifactFabricationSpecification({ type: "ArtifactFabricationSpecificationCandidate", version, ...specificationCandidate }, { admittedDigest: specificationDigest });
  if (admittedSpecification.type !== "ArtifactFabricationSpecification" || admittedSpecification.specificationDigest !== specificationDigest) {
    throw receiptAdmissionError("INVALID_ARTIFACT_SPECIFICATION", "fabrication receipt has an unadmitted artifact specification", admittedSpecification);
  }
  if (receipt.specificationDigest !== admittedSpecification.specificationDigest || receipt.sourceDigest !== admittedSpecification.source.provenance.digest) {
    throw receiptAdmissionError("SPECIFICATION_BINDING_MISMATCH", "fabrication receipt does not bind its admitted specification");
  }
  // Historical v1 derivations remain readable as their original, weaker
  // evidence. Every new v2 derivation binds its pre-inference work order.
  if ([2, 3].includes(receipt.derivation?.version)) {
    const order = receipt.derivation.workOrderSpecification;
    if (order?.type !== "ArtifactFabricationSpecification" || ![1, 2].includes(order.version)) {
      throw receiptAdmissionError("MISSING_WORK_ORDER_SPECIFICATION", "derived fabrication must retain the source-free admitted work order");
    }
    const { type: orderType, version: orderVersion, specificationDigest: orderDigest, ...orderCandidate } = order;
    const admittedOrder = admitArtifactFabricationSpecification({ type: "ArtifactFabricationSpecificationCandidate", version: orderVersion, ...orderCandidate }, { admittedDigest: orderDigest });
    // Projecting away only generated sources and tests must recover exactly the
    // admitted order. All requirements, constraints, examples and dependencies
    // remain part of its identity; provider output cannot change them.
    const recoveredOrder = admitArtifactFabricationSpecification({
      type: "ArtifactFabricationSpecificationCandidate", version,
      ...specificationCandidate,
      projections: admittedSpecification.projections.map((projection) => ({
        ...projection, configuration: { ...projection.configuration, sources: [], tests: [] },
      })),
    }, { admittedDigest: orderDigest });
    if (admittedOrder.type !== "ArtifactFabricationSpecification" || admittedOrder.specificationDigest !== orderDigest
      || receipt.derivation.workOrderSpecificationDigest !== orderDigest
      || recoveredOrder.type !== "ArtifactFabricationSpecification" || recoveredOrder.specificationDigest !== orderDigest) {
      throw receiptAdmissionError("WORK_ORDER_REALIZATION_BINDING_MISMATCH", "derived fabrication must preserve its admitted order apart from generated sources and tests");
    }
  }
  if (receipt.derivation?.version === 3) {
    const configuration = admittedSpecification.projections.find(item => item.configuration?.operations)?.configuration;
    admitClauseAssayDerivation(receipt.derivation.workOrderSpecification, configuration, receipt.derivation);
  }
  const creation = admitJsnodeOperationPackageCreationReceipt(receipt.jsnodeOperationPackageCreationReceipt);
  if (creation.type !== "JsnodeOperationPackageCreationReceipt") {
    throw receiptAdmissionError(creation.code, `fabrication creation receipt admission refused: ${creation.code}`, creation);
  }
  const realization = receipt.artifactFabricationRealizationReceipt;
  if (realization === null || typeof realization !== "object") {
    throw receiptAdmissionError("MISSING_REALIZATION_RECEIPT", "fabrication receipt has no realization receipt");
  }
  const { type: realizationType, version: realizationVersion, traceability, ...realizationCandidate } = realization;
  const admittedRealization = admitArtifactFabricationRealizationReceipt(admittedSpecification, { type: "ArtifactFabricationRealizationReceiptCandidate", version: 1, ...realizationCandidate });
  if (admittedRealization.type !== "ArtifactFabricationRealizationReceipt") {
    throw receiptAdmissionError(admittedRealization.code, `fabrication realization receipt admission refused: ${admittedRealization.code}`, admittedRealization);
  }
  const creationDigest = semanticId(creation);
  const evidence = [...admittedRealization.realizations, ...admittedRealization.acceptances].map(({ evidence: item }) => item);
  if (evidence.length === 0 || !evidence.every((item) => item.locator === creation.destination && item.digest === creationDigest)) {
    throw receiptAdmissionError("CREATION_REALIZATION_BINDING_MISMATCH", "fabrication realization evidence must identify the admitted creation receipt");
  }
  return immutable({
    ...receipt,
    sourceDigest: admittedSpecification.source.provenance.digest,
    specificationDigest: admittedSpecification.specificationDigest,
    artifactSpecification: admittedSpecification,
    jsnodeOperationPackageCreationReceipt: creation,
    artifactFabricationRealizationReceipt: admittedRealization,
  });
}

/** The ordinary ordinal-EAVT attribute carrying a complete native fabrication Cell. */
export const FABRICATION_CELL_ATTRIBUTE = "jsnode-fabrication:cell";

const predicate = name => `urn:561:jsnode:fabrication:${name}`;
/** Source-coordinate vocabulary; each object remains its original admitted record. */
export const FABRICATION_CELL_PREDICATES = Object.freeze(Object.fromEntries([
  "receipt", "candidate", "source", "specification", "workOrder", "claim", "requirement",
  "prohibition", "constraint", "openQuestion", "projection", "acceptanceObligation",
  "materialization", "assay", "realizationEvidence", "acceptanceEvidence", "traceability",
  "derivationAttempt", "proofing", "publication", "receiptPath", "legacyEntity",
  "independentlyReceived", "customerAccepted", "deployed",
].map(name => [name, predicate(name)])));

const presentationSchema = {
  type: "object", minProperties: 1, additionalProperties: false,
  properties: { locator: { type: "string", minLength: 1, pattern: "\\S" },
    occurrence: { type: "string", minLength: 1, pattern: "\\S" } },
};

/** Wire shape only. The original receipt and presentation are separately replayed. */
export const fabricationReceiptCellProjectionSchema = retainedCarrier({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.561.group/jsnode/fabrication-receipt-cell-projection.schema.json",
  title: "Source-bearing JSNode fabrication receipt Cells",
  type: "object", additionalProperties: false,
  required: ["type", "version", "receiptId", "candidateId", "source", "cells", "legacyEntityCell", "legacyCellAddresses"],
  properties: {
    type: { const: "JsnodeFabricationCellProjection" }, version: { const: 1 },
    receiptId: { type: "string", pattern: "^ni:" }, candidateId: { type: "string", pattern: "^ni:" },
    source: { anyOf: [{ type: "null" }, presentationSchema] },
    cells: { type: "array", minItems: 1, items: { $ref: cellSchema.$id } },
    legacyEntityCell: { type: "string", pattern: "^ni:" },
    legacyCellAddresses: { type: "array", items: { type: "string", pattern: "^ni:" } },
  },
});

function sourcePresentation(source) {
  if (source === undefined) return null;
  let value;
  try { value = retainedCarrier(source); }
  catch (error) { throw receiptAdmissionError("INVALID_FABRICATION_SOURCE_PRESENTATION", error.message); }
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length === 0 || Object.keys(value).some(key =>
        !["locator", "occurrence"].includes(key) || typeof value[key] !== "string" || !value[key].trim())) {
    throw receiptAdmissionError("INVALID_FABRICATION_SOURCE_PRESENTATION",
      "source presentation requires only a supplied nonblank locator and/or occurrence");
  }
  return value;
}

function fabricationRequest(value) {
  try {
    // Keep the native getter refusal, then admit the ORIGINAL value at the
    // JSON owner. The retained snapshot can omit undefined object properties,
    // so validating only that snapshot would silently discard source data.
    const snapshot = retainedCarrier(value);
    canonicalJson(value);
    return snapshot;
  }
  catch (error) { throw receiptAdmissionError("INVALID_FABRICATION_RECEIPT_WIRE", error.message); }
}

// Only inspect an already retained carrier whose original was admitted by
// EAVT's JSON owner; the extra sign check refuses its lossy -0 encoding.
function receiptWireValue(value) {
  try {
    const pending = [value];
    while (pending.length) {
      const at = pending.pop();
      if (Object.is(at, -0)) throw new TypeError("ordinary EAVT JSON does not preserve negative zero");
      if (at !== null && typeof at === "object")
        for (const child of Object.values(at)) pending.push(child);
    }
    return value;
  } catch (error) { throw receiptAdmissionError("INVALID_FABRICATION_RECEIPT_WIRE", error.message); }
}

/**
 * Retain one complete admitted receipt and expose its source-bound records as
 * native SignCells. A report's content identity is not its issuer identity or
 * an original fabrication occurrence. A supplied source presentation is kept
 * in witnesses; no source event or clock is synthesized when it is absent.
 * @param {{receipt: object, source?: {locator?: string, occurrence?: string}}} request Original receipt and optional actual source presentation.
 * @returns {object} The canonical JsnodeFabricationCellProjection, with reported content and unknown external receiving kept distinct.
 */
export function projectFabricationReceiptCells(request) {
  request = fabricationRequest(request);
  const input = request?.receipt;
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError("receipt must be an object");
  const source = sourcePresentation(request.source);
  // Admission's existing immutable result must not freeze or alias the
  // caller's mutable source. SignCell's carrier owns the exact snapshot.
  const admitted = admitMarkdownJsnodeOperationPackageFabricationReceipt(receiptWireValue(input));
  const specification = admitted.artifactSpecification;
  const creation = admitted.jsnodeOperationPackageCreationReceipt;
  const realization = admitted.artifactFabricationRealizationReceipt;
  const receiptId = cellSemanticId(admitted);
  const candidate = { type: "JsnodeFabricationCandidate", version: 1,
    packageName: creation.packageName, packageVersion: creation.packageVersion,
    filesDigest: creation.filesDigest, specificationDigest: admitted.specificationDigest };
  const candidateId = cellSemanticId(candidate);
  const cells = [];
  const P = FABRICATION_CELL_PREDICATES;
  // Native semantic identity normalizes text. A real source locator or
  // occurrence is a literal identifier, so retain its exact observation basis
  // alongside the original field using the shared native lexical encoding.
  const literal = value => typeof value === "string"
    ? bytesToHex(new TextEncoder().encode(JSON.stringify(value))) : null;
  const presentationBinding = { encoding: "utf8-json-string-hex",
    locator: literal(source?.locator), occurrence: literal(source?.occurrence),
    receiptPath: literal(admitted.receiptPath) };
  const witness = pointers => ({
    type: "JsnodeFabricationReceiptContentWitness", version: 1,
    receiptId, candidateId, source, receiptPath: admitted.receiptPath ?? null, presentationBinding,
    sourceDigest: admitted.sourceDigest, specificationDigest: admitted.specificationDigest,
    creationReceiptDigest: semanticId(creation), pointers,
    scope: "admitted-receipt-content",
  });
  const tell = (subject, predicate, object, pointers) => {
    const at = cell(subject, predicate, object, { for: [witness(pointers)] });
    cells.push(at);
    return cellAddress(at);
  };
  const report = (predicate, object, pointer) => tell(candidateId, predicate, object, [pointer]);
  const reports = (predicate, values, pointer) => values.forEach((value, index) => report(predicate, value, `${pointer}/${index}`));

  tell(receiptId, P.receipt, admitted, [""]);
  tell(candidateId, P.candidate, candidate, ["/jsnodeOperationPackageCreationReceipt/packageName",
    "/jsnodeOperationPackageCreationReceipt/packageVersion", "/jsnodeOperationPackageCreationReceipt/filesDigest", "/specificationDigest"]);
  report(P.source, specification.source, "/artifactSpecification/source");
  report(P.specification, specification, "/artifactSpecification");
  for (const [field, role] of [["claims", "claim"], ["requirements", "requirement"],
    ["prohibitions", "prohibition"], ["constraints", "constraint"], ["openQuestions", "openQuestion"],
    ["projections", "projection"], ["acceptanceObligations", "acceptanceObligation"]]) {
    if (Array.isArray(specification[field])) reports(P[role], specification[field], `/artifactSpecification/${field}`);
  }
  reports(P.materialization, creation.files, "/jsnodeOperationPackageCreationReceipt/files");
  reports(P.assay, creation.assays, "/jsnodeOperationPackageCreationReceipt/assays");
  reports(P.realizationEvidence, realization.realizations, "/artifactFabricationRealizationReceipt/realizations");
  reports(P.acceptanceEvidence, realization.acceptances, "/artifactFabricationRealizationReceipt/acceptances");
  reports(P.traceability, realization.traceability, "/artifactFabricationRealizationReceipt/traceability");
  if ([2, 3].includes(admitted.derivation?.version))
    report(P.workOrder, admitted.derivation.workOrderSpecification, "/derivation/workOrderSpecification");
  if (Array.isArray(admitted.derivation?.attempts))
    reports(P.derivationAttempt, admitted.derivation.attempts, "/derivation/attempts");
  if (admitted.derivation?.proofing !== undefined)
    report(P.proofing, admitted.derivation.proofing, "/derivation/proofing");
  if (admitted.jsnodeOperationPackageRegistryPublication !== undefined)
    report(P.publication, admitted.jsnodeOperationPackageRegistryPublication, "/jsnodeOperationPackageRegistryPublication");
  if (admitted.receiptPath !== undefined) report(P.receiptPath, admitted.receiptPath, "/receiptPath");

  // These are explicit coordinates with no evidence, not denial. Neither
  // schema admission nor a reported acceptance record can fill them in.
  for (const role of ["independentlyReceived", "customerAccepted", "deployed"])
    cells.push(cell(candidateId, P[role], admitted.specificationDigest));

  const workOrder = admitted.workOrder ?? specification.source.provenance.locator ?? null;
  const workOrderPointer = admitted.workOrder == null ? "/artifactSpecification/source/provenance/locator" : "/workOrder";
  const legacyEntityCell = tell(candidateId, P.legacyEntity,
    { name: creation.packageName, version: creation.packageVersion, workOrder },
    ["/jsnodeOperationPackageCreationReceipt/packageName", "/jsnodeOperationPackageCreationReceipt/packageVersion", workOrderPointer]);
  // One source-bearing mapping owns both the ordinary legacy world facts
  // and their evidence. No parallel list in the storage emitter can drift.
  const facts = [
    ["born-from-work-order", workOrder, [workOrderPointer]],
    ["source-digest", admitted.sourceDigest, ["/sourceDigest"]],
    ["specification-digest", admitted.specificationDigest, ["/specificationDigest"]],
    ...([2, 3].includes(admitted.derivation?.version)
      ? [["work-order-specification-digest", admitted.derivation.workOrderSpecificationDigest, ["/derivation/workOrderSpecificationDigest"]]] : []),
    ...realization.traceability.map((trace, index) => ["fabrication-trace", trace, [`/artifactFabricationRealizationReceipt/traceability/${index}`]]),
    ["files-digest", creation.filesDigest, ["/jsnodeOperationPackageCreationReceipt/filesDigest"]],
    ["has-quality", "fabricated-through-the-jsnode-line", ["/type", "/jsnodeOperationPackageCreationReceipt/type"]],
    ...creation.assays.map((assay, index) => ["assay-passed", assay.name, [`/jsnodeOperationPackageCreationReceipt/assays/${index}`]]),
  ];
  const legacyCellAddresses = facts.filter(([, value]) => value !== null && value !== undefined)
    .map(([predicate, object, pointers]) => tell(candidateId, predicate, object, pointers));
  return retainedCarrier({ type: "JsnodeFabricationCellProjection", version: 1,
    receiptId, candidateId, source, cells: cellSet(cells), legacyEntityCell, legacyCellAddresses });
}

/**
 * Replay a proposed Cell projection against the original complete receipt and
 * its actual supplied presentation. Shape alone cannot establish this binding.
 * @param {object} projection A received JsnodeFabricationCellProjection.
 * @param {{receipt: object, source?: {locator?: string, occurrence?: string}}} request Original source for replay.
 * @returns {object} The canonically replayed projection, or throws on mismatch.
 */
export function admitFabricationReceiptCellProjection(projection, request) {
  const expected = projectFabricationReceiptCells(request);
  let matches = false;
  try { matches = cellSemanticId(receiptWireValue(fabricationRequest(projection))) === cellSemanticId(expected); } catch { /* An invalid carrier cannot replay. */ }
  if (!matches) throw receiptAdmissionError("FABRICATION_CELL_BINDING_MISMATCH",
    "fabrication Cells do not replay from this exact admitted receipt and source presentation");
  return expected;
}

/**
 * Read native Cells from the existing ordinal EAVT carrier, retaining opposing
 * witnesses by SignCell's canonical join. This is structural Cell receiving;
 * use the original-receipt replay for source binding and never infer authority.
 * @param {object[]} rows Ordinary EAVT rows, possibly containing unrelated facts.
 * @returns {object[]} The canonical native Cell set.
 */
export function readFabricationReceiptCellRows(rows) {
  try { rows = receiptWireValue(fabricationRequest(rows)); }
  catch (error) { throw receiptAdmissionError("FABRICATION_CELL_ROW_MISMATCH", error.message); }
  if (!Array.isArray(rows)) throw new TypeError("fabrication Cell receiving requires an EAVT row array");
  return cellSet(rows.filter(row => row?.a === FABRICATION_CELL_ATTRIBUTE).map(row => {
    let at;
    try { at = admitCell(row.v); }
    catch (error) { throw receiptAdmissionError("FABRICATION_CELL_ROW_MISMATCH", error.message); }
    if (!Number.isSafeInteger(row.t) || row.e !== cellAddress(at))
      throw receiptAdmissionError("FABRICATION_CELL_ROW_MISMATCH", "the row must retain its native Cell address and safe trace ordinal");
    return at;
  }));
}

/**
 * Derive legacy facts and lossless native Cell rows from one original receipt.
 * The existing emitter persists every row. Its t is only a trace ordinal,
 * never an absolute clock or manufactured original fabrication occurrence.
 * @param {{receipt: object, t: number, source?: {locator?: string, occurrence?: string}}} request Original fabrication report, genesis ordinal and optional source presentation.
 * @returns {object} WorldRowsFold with original fields and the same persisted native cellProjection.
 */
export function foldFabricationReceiptIntoWorldRows(request) {
  request = fabricationRequest(request);
  if (!Number.isSafeInteger(request?.t) || Object.is(request.t, -0))
    throw receiptAdmissionError("INVALID_FABRICATION_TRACE_ORDINAL", "t must be a safe integer trace ordinal");
  const projection = projectFabricationReceiptCells(request);
  const byId = new Map(projection.cells.map(at => [cellAddress(at), at]));
  const lastOffset = projection.legacyCellAddresses.length + projection.cells.length;
  if (!Number.isSafeInteger(request.t + lastOffset))
    throw receiptAdmissionError("FABRICATION_TRACE_ORDINAL_OVERFLOW", "the complete fabrication fold exceeds safe trace ordinals");
  const attributes = byId.get(projection.legacyEntityCell).object;
  const { address, genesis: genesisRow } = constitute({ kind: "jsnode-operation-package", attributes, t: request.t });
  const rows = [genesisRow];
  let t = request.t;
  for (const identity of projection.legacyCellAddresses) {
    const at = byId.get(identity);
    rows.push({ e: address, a: at.predicate, v: at.object, t: ++t });
  }
  for (const at of projection.cells)
    rows.push({ e: cellAddress(at), a: FABRICATION_CELL_ATTRIBUTE, v: at, t: ++t });
  const receipt = projection.cells.find(at => at.predicate === FABRICATION_CELL_PREDICATES.receipt).object;
  return { type: "WorldRowsFold", version: 1, address, rows,
    traceability: receipt.artifactFabricationRealizationReceipt.traceability, cellProjection: projection };
}

