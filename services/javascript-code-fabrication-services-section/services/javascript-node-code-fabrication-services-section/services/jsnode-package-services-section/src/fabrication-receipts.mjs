import { assayCasesOfDelivery, testsOfClosure } from "./derive-jsnode-package-from-closure.mjs";
import { constitute } from "@red-cup-engineering/eavt-services-section";
import { admitArtifactFabricationRealizationReceipt, admitArtifactFabricationSpecification } from "@red-cup-engineering/computer-data-engineering-services-section/artifact-fabrication";
import { admitJsnodeOperationPackageCreationReceipt } from "./admit-jsnode-operation-package-creation-receipt.mjs";
import { semanticId } from "@red-cup-engineering/computer-content-engineering-services-section/semiotic-content-address";

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
  const admittedSpecification = admitArtifactFabricationSpecification({ type: "ArtifactFabricationSpecificationCandidate", version: 1, ...specificationCandidate });
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
    if (order?.type !== "ArtifactFabricationSpecification" || order.version !== 1) {
      throw receiptAdmissionError("MISSING_WORK_ORDER_SPECIFICATION", "derived fabrication must retain the source-free admitted work order");
    }
    const { type: orderType, version: orderVersion, specificationDigest: orderDigest, ...orderCandidate } = order;
    const admittedOrder = admitArtifactFabricationSpecification({ type: "ArtifactFabricationSpecificationCandidate", version: 1, ...orderCandidate });
    // Projecting away only generated sources and tests must recover exactly the
    // admitted order. All requirements, constraints, examples and dependencies
    // remain part of its identity; provider output cannot change them.
    const recoveredOrder = admitArtifactFabricationSpecification({
      type: "ArtifactFabricationSpecificationCandidate", version: 1,
      ...specificationCandidate,
      projections: admittedSpecification.projections.map((projection) => ({
        ...projection, configuration: { ...projection.configuration, sources: [], tests: [] },
      })),
    });
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

/**
 * Derives the EAVT facts of one fully admitted JSNode package fabrication.
 * The caller owns persistence; this function only admits the receipt and
 * returns the rows to append to a JSONL EAVT carrier.
 *
 * @param {{receipt: object, t: number}} request A fabrication receipt and its genesis trace ordinal.
 * @returns {{type: string, version: number, address: string, rows: object[], traceability: object[]}}
 */
export function foldFabricationReceiptIntoWorldRows(request) {
  const receipt = request?.receipt;
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) throw new TypeError("receipt must be an object");
  if (!Number.isInteger(request?.t)) throw new TypeError("t must be an integer");
  const admitted = admitMarkdownJsnodeOperationPackageFabricationReceipt(receipt);
  const realization = admitted.artifactFabricationRealizationReceipt;
  const creation = admitted.jsnodeOperationPackageCreationReceipt;
  const workOrder = admitted.workOrder ?? admitted.artifactSpecification.source.provenance.locator ?? null;
  const { address, genesis: genesisRow } = constitute({ kind: "jsnode-operation-package", attributes: { name: creation.packageName, version: creation.packageVersion, workOrder }, t: request.t });
  const facts = [
    ["born-from-work-order", workOrder],
    ["source-digest", admitted.sourceDigest],
    ["specification-digest", admitted.specificationDigest],
    ...(admitted.derivation?.version === 2 ? [["work-order-specification-digest", admitted.derivation.workOrderSpecificationDigest]] : []),
    ...realization.traceability.map((trace) => ["fabrication-trace", trace]),
    ["files-digest", creation.filesDigest],
    ["has-quality", "fabricated-through-the-jsnode-line"],
    ...creation.assays.map((assay) => ["assay-passed", assay.name]),
  ];
  const rows = [genesisRow];
  let t = request.t;
  for (const [a, v] of facts) {
    if (v === null || v === undefined) continue;
    rows.push({ e: address, a, v, t: ++t });
  }
  return { type: "WorldRowsFold", version: 1, address, rows, traceability: realization.traceability };
}

