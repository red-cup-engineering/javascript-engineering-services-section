import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { admitArtifactFabricationRealizationPlan, admitArtifactFabricationRealizationReceipt, admitArtifactFabricationSpecification } from "@red-cup-engineering/computer-data-engineering-services-section/artifact-fabrication";
import { admitJavascriptNodeCommandExecutionRequest } from "@red-cup-engineering/javascript-node-services-section/admit-javascript-node-command-execution-request";
import { createJsnodeOperationPackage } from "./create-jsnode-operation-package.mjs";
import { executeJavascriptNodeCommand } from "@red-cup-engineering/execute-javascript-node-command-service";
import { fileURLToPath } from "node:url";
import { completeClosureTranslation, translateMarkdownJsnodeOperationPackageSpecification } from "./translate-markdown-jsnode-operation-package-specification.mjs";
import { admitJsnodeOperationPackageSpecification } from "./admit-jsnode-operation-package-specification.mjs";
import { projectJsnodeOperationModules } from "./project-jsnode-operation-package.mjs";
import { deriveJsnodePackageFromClosure } from "./derive-jsnode-package-from-closure.mjs";
import { writeTextFile } from "@red-cup-engineering/computer-file-engineering-services-section/write-text-file";
import { admitMarkdownJsnodeOperationPackageFabricationReceipt } from "@red-cup-engineering/jsnode-package-services-section/fabrication-receipts";
import { semanticId } from "@red-cup-engineering/computer-content-engineering-services-section/semiotic-content-address";

const DEFAULT_JOURNAL_ROOT_SUFFIX = "lib/emsenn/services/561-group/services/engineering-services-section";

function defaultJournalRoot() {
  return path.join(process.env.INFO_REPOSITORY_ROOT ?? "/home/emsenn/info", DEFAULT_JOURNAL_ROOT_SUFFIX);
}

/**
 * Derives the fabrication-receipt filename's operation-name segment from a born package's destination directory: its leaf name with a trailing "-service" dropped, matching the house convention seen across the section's own on-disk fabrication receipts (e.g. observe-set-of-kalshi-weather-markets-service -> observe-set-of-kalshi-weather-markets).
 * @param {string} destination An absolute path to a born package directory.
 * @returns {string} The operation-name segment for the receipt filename.
 */
export function operationNameFromDestination(destination) {
  const leaf = path.basename(destination);
  return leaf.endsWith("-service") ? leaf.slice(0, -"-service".length) : leaf;
}

/**
 * Computes the absolute path at which one fabrication's disk receipt is written, per the FROG admission convention: `<destination>/data/records/<YYYY-MM-DD>-<operation-name>-fabrication-receipt.json`.
 * @param {string} destination An absolute path to a born package directory.
 * @param {Date} recordedAt The instant the receipt is recorded, used only for its UTC calendar date.
 * @returns {string} The absolute receipt file path.
 */
export function fabricationReceiptDiskPath(destination, recordedAt) {
  const date = recordedAt.toISOString().slice(0, 10);
  return path.join(destination, "data", "records", `${date}-${operationNameFromDestination(destination)}-fabrication-receipt.json`);
}

/**
 * Walks upward from one born package's destination to the nearest ancestor directory whose name ends in "-services-section" and already carries a data/ directory, per the house records-custody rule; falls back to the engineering-services-section root when no such ancestor exists.
 * @param {string} destination An absolute path to a born package directory.
 * @returns {string} An absolute directory path to use as a semantic-record-journal root.
 */
export function nearestServicesSectionCarryingData(destination) {
  let dir = path.dirname(path.resolve(destination));
  for (;;) {
    if (path.basename(dir).endsWith("-services-section") && existsSync(path.join(dir, "data"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return defaultJournalRoot();
    dir = parent;
  }
}

function commandRequest({ command, arguments: args, directory, environment }) {
  return admitJavascriptNodeCommandExecutionRequest({ type: "JavascriptNodeCommandExecutionRequest", version: 1, command, arguments: args, directory, environment, input: null });
}

/**
 * Runs the mechanical house publish gate for one just-materialized JSNode operation package: fresh install with a canonical-resolved-URL count, a pack dry run, a never-republish existence check, npm publish, and a post-publish version verification.
 * @param {object} request A record with `destination`, `packageName`, `packageVersion`, and `registry`.
 * @returns {Promise<object>} A JsnodeOperationPackageRegistryPublicationReceipt or a phase-named JsnodeOperationPackageRegistryPublicationRefusal.
 */
export async function publishJsnodeOperationPackageToRegistry({ destination, packageName, packageVersion, registry }, { execute = executeJavascriptNodeCommand } = {}) {
  const gate = fileURLToPath(new URL("./scripts/publish-package.mjs", import.meta.resolve("@red-cup-engineering/npm-workspace-publication-service/package.json")));
  const execution = execute(commandRequest({
    command: process.execPath,
    arguments: [gate, "--package", destination, "--registry", registry, "--apply"],
    directory: destination,
    environment: Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === "string")),
  }));
  let result;
  try { result = JSON.parse(execution.result.stdout); } catch {
    return { type: "JsnodeOperationPackageRegistryPublicationRefusal", version: 1, phase: "publish-gate", code: "INVALID_GATE_RESULT", message: execution.result.stderr || execution.result.stdout || "publish gate returned no JSON result" };
  }
  if (execution.result.status !== 0 || result.outcome !== "published") {
    return { type: "JsnodeOperationPackageRegistryPublicationRefusal", version: 1, phase: "publish-gate", code: result.refusal?.code ?? "PUBLISH_GATE_REFUSED", message: JSON.stringify(result.refusal ?? result) };
  }
  const publication = result.steps.find((step) => step.name === "publish")?.evidence;
  if (publication?.package !== packageName || publication.version !== packageVersion) {
    return { type: "JsnodeOperationPackageRegistryPublicationRefusal", version: 1, phase: "publish-gate", code: "PUBLICATION_IDENTITY_MISMATCH", message: JSON.stringify(publication) };
  }
  return {
    type: "JsnodeOperationPackageRegistryPublicationReceipt", version: 1,
    packageName, packageVersion, registry,
    freshInstallLockfileCheck: result.state.freshInstallLockfileCheck,
    tarballDiffClassification: result.state.tarballDiffClassification,
    journalReceiptId: result.steps.find((step) => step.name === "receipt")?.evidence?.id,
  };
}

function immutable(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) immutable(item);
    Object.freeze(value);
  }
  return value;
}





/**
 * Wraps a composed step's own refusal (or a thrown error) as one MarkdownJsnodeOperationPackageFabricationRefusal, surfacing the inner refusal's own `phase` (e.g. a JsnodeOperationPackageCreationRefusal's "command-face", or a JsnodeOperationPackageRegistryPublicationRefusal's "publish") verbatim rather than the outer step name — the outer `phase` argument is used only when the refused value carries no phase of its own.
 * @param {string} phase The outer fabrication step in progress when the refusal or error was observed.
 * @param {object} value The composed step's own refusal record, or a thrown error.
 * @returns {object} An immutable MarkdownJsnodeOperationPackageFabricationRefusal.
 */
function refusal(phase, value) {
  return immutable({
    type: "MarkdownJsnodeOperationPackageFabricationRefusal",
    version: 1,
    phase: typeof value?.phase === "string" ? value.phase : phase,
    code: typeof value?.code === "string" ? value.code : "FABRICATION_FAILED",
    message: value?.message ?? String(value),
    path: value?.path ?? value?.sourceSpan ?? null,
    // A summary is a display projection, not a replacement for the step's
    // attributable evidence. Keep the native refusal or exception's cause.
    cause: value instanceof Error
      ? { name: value.name, message: value.message, ...(value.cause === undefined ? {} : { cause: value.cause }) }
      : value,
  });
}

function realizationCandidate(specification, evidence) {
  return {
    type: "ArtifactFabricationRealizationReceiptCandidate",
    version: 1,
    artifactId: specification.artifact.id,
    specificationDigest: specification.specificationDigest,
    realizations: specification.projections.map((projection) => ({ type: "ArtifactFabricationRealizationEvidence", version: 1, projectionId: projection.id, evidence })),
    acceptances: specification.acceptanceObligations.map((obligation) => ({ type: "ArtifactFabricationRealizationEvidence", version: 1, acceptanceObligationId: obligation.id, evidence })),
  };
}

function realizationPlanCandidate(specification) {
  return {
    type: "ArtifactFabricationRealizationPlanCandidate",
    version: 1,
    artifactId: specification.artifact.id,
    specificationDigest: specification.specificationDigest,
    projectionIds: specification.projections.map(({ id }) => id),
    acceptanceObligationIds: specification.acceptanceObligations.map(({ id }) => id),
  };
}

export function selectSingleJsnodeProjection(specification) {
  const projections = specification.projections.filter(({ id }) => id === "jsnode-operation-package");
  if (specification.projections.length !== 1 || projections.length !== 1 || !["@red-cup-engineering/jsnode-operation-package-specification-admission-service", "@red-cup-engineering/jsnode-package-services-section/admit-jsnode-operation-package-specification"].includes(projections[0].target)) {
    return immutable({ type: "MarkdownJsnodeOperationPackageFabricationRefusal", version: 1, phase: "jsnode-projection-selection", code: "INVALID_JSNODE_PROJECTION", message: "the admitted specification must contain exactly one JSNode operation-package projection for the canonical admission service", path: null });
  }
  return projections[0];
}

function materializedWithoutReceipt(specification, creationReceipt, registryPublication, realizationReceipt) {
  return immutable({
    type: "MarkdownJsnodeOperationPackageMaterializedWithoutAdmittedReceipt",
    version: 1,
    sourceDigest: specification.source.provenance.digest,
    specificationDigest: specification.specificationDigest,
    artifactSpecification: specification,
    jsnodeOperationPackageCreationReceipt: creationReceipt,
    jsnodeOperationPackageRegistryPublication: registryPublication,
    artifactFabricationRealizationReceiptRefusal: realizationReceipt,
  });
}

function validRequest(request) {
  if (request === null || typeof request !== "object" || Array.isArray(request)) return "input must be a record";
  const hasPublish = Object.hasOwn(request, "publish");
  const expectedKeys = hasPublish ? ["destination", "publish", "registry", "source", "type", "version"] : ["destination", "registry", "source", "type", "version"];
  const keys = Object.keys(request).sort();
  if (keys.length !== expectedKeys.length || keys.join(",") !== expectedKeys.join(",")) {
    return "request must carry exactly destination, registry, source, type, version, and optionally publish";
  }
  if (request.type !== "MarkdownJsnodeOperationPackageFabricationRequest" || request.version !== 1) return "request must be MarkdownJsnodeOperationPackageFabricationRequest@1";
  if (typeof request.destination !== "string" || typeof request.registry !== "string") return "destination and registry must be strings";
  if (hasPublish && typeof request.publish !== "boolean") return "publish must be a boolean when present";
  return null;
}

/** Admit the work order before spending inference; return a proposal, never acceptance. */
export async function deriveMarkdownJsnodeOperationModules(source, { infer, judge = async () => undefined, dependencyProjectRoot } = {}) {
  let phase = "translation";
  let derivation;
  try {
    let translated = translateMarkdownJsnodeOperationPackageSpecification({
    type: "MarkdownJsnodeOperationPackageSpecificationTranslationRequest",
    version: 1,
    source,
    });
    if (!["MarkdownJsnodeOperationPackageClosureTranslation", "MarkdownJsnodeOperationPackageSpecificationTranslation"].includes(translated.type)) return refusal(phase, translated);

    // Admission governs resource use: generated source is a realization of this
    // immutable order, never a retrospective addition to what authorized it.
    phase = "artifact-specification-admission";
    const workOrderSpecification = admitArtifactFabricationSpecification(translated.artifactSpecificationCandidate);
    if (workOrderSpecification.type !== "ArtifactFabricationSpecification") return refusal(phase, workOrderSpecification);
    phase = "realization-plan-preflight";
    const orderPlan = admitArtifactFabricationRealizationPlan(workOrderSpecification, realizationPlanCandidate(workOrderSpecification));
    if (orderPlan.type !== "ArtifactFabricationRealizationPlan") return refusal(phase, orderPlan);

    if (translated.type === "MarkdownJsnodeOperationPackageClosureTranslation") {
      phase = "derivation";
      if (typeof infer !== "function") return refusal(phase, { code: "NO_DERIVATION_CARRIER", message: "a meaning-closure's sources are derived, and no inference carrier was composed" });
      derivation = await deriveJsnodePackageFromClosure(workOrderSpecification, { infer, judge, dependencyProjectRoot });
      if (derivation.type === "JsnodeClosureDerivationRefusal") return immutable({
        ...refusal(phase, derivation),
        message: derivation.question ?? derivation.evidence ?? `no delivery for ${derivation.operation} passed its examples`,
        workOrderSpecificationDigest: workOrderSpecification.specificationDigest,
        source: workOrderSpecification.source,
      });
      translated = completeClosureTranslation(translated, derivation);
    }
    if (translated.type !== "MarkdownJsnodeOperationPackageSpecificationTranslation") return refusal(phase, translated);

    phase = "artifact-specification-admission";
    const specification = derivation === undefined ? workOrderSpecification : admitArtifactFabricationSpecification(translated.artifactSpecificationCandidate);
    if (specification.type !== "ArtifactFabricationSpecification") return refusal(phase, specification);

    phase = "jsnode-projection-selection";
    const projection = selectSingleJsnodeProjection(specification);
    if (projection.type === "MarkdownJsnodeOperationPackageFabricationRefusal") return immutable(projection);

    phase = "realization-plan-preflight";
    const preflight = derivation === undefined ? orderPlan : admitArtifactFabricationRealizationPlan(specification, realizationPlanCandidate(specification));
    if (preflight.type !== "ArtifactFabricationRealizationPlan") return refusal(phase, preflight);

    phase = "jsnode-module-projection";
    const moduleSpecification = admitJsnodeOperationPackageSpecification(projection.configuration);
    if (moduleSpecification.type !== "JsnodeOperationPackageSpecification") return refusal(phase, moduleSpecification);
    return immutable({
      type: "MarkdownJsnodeOperationModuleProposal", version: 1,
      workOrderSpecification, artifactSpecification: specification,
      realizationPlan: preflight, projection,
      files: projectJsnodeOperationModules(moduleSpecification),
      tests: moduleSpecification.tests,
      dependencies: moduleSpecification.dependencies,
      derivation: derivation ?? null,
    });
  } catch (error) { return refusal(phase, error); }
}

/**
 * Fabricates one JSNode package from a closed Markdown work order through existing translators, admissions, and package-birth machinery. A work order that is a meaning-closure (no Sources or Tests) has its sources and tests derived first, through the inference carrier the caller composes, and its receipt binds every derivation attempt and the lot each was sold under.
 * @param {object} request A MarkdownJsnodeOperationPackageFabricationRequest record.
 * @param {{infer?: Function, judge?: Function}} [carriers] For a closure: `infer({ taskClass, objective, messages, json })` resolving to { text, lot }, and `judge(lot, outcome, evidence)`.
 * @returns {Promise<object>} A MarkdownJsnodeOperationPackageFabricationReceipt or phase-specific refusal.
 */
export async function fabricateMarkdownJsnodeOperationPackage(request, { infer, judge = async () => undefined, dependencyProjectRoot } = {}) {
  const invalid = validRequest(request);
  if (invalid) return refusal("request", { code: "INVALID_REQUEST", message: invalid });
  let phase = "translation";
  let derivation;
  let workOrderSpecification;
  // The market learns from the package's whole assay: the lots that made it are judged by its birth.
  const judgeDerived = async (outcome, evidence) => {
    for (const entry of derivation?.derivations ?? []) {
      if (entry.outcome !== "pre-assayed" && !(entry.phase === "clause-assays" && entry.outcome === "derived")) continue;
      try { await judge(entry.lot, outcome, evidence); } catch (error) { process.stderr.write(`fabrication: the market did not take the ${outcome} judgment of ${entry.operation}: ${error?.message ?? error}\n`); }
    }
  };
  try {
    const proposal = await deriveMarkdownJsnodeOperationModules(request.source, { infer, judge, dependencyProjectRoot });
    if (proposal.type !== "MarkdownJsnodeOperationModuleProposal") return proposal;
    const { artifactSpecification: specification, projection } = proposal;
    workOrderSpecification = proposal.workOrderSpecification;
    derivation = proposal.derivation ?? undefined;

    phase = "jsnode-package-creation";
    const creationReceipt = await createJsnodeOperationPackage({
    type: "JsnodeOperationPackageCreationRequest",
    version: 1,
    destination: request.destination,
    registry: request.registry,
    specification: projection.configuration,
    });
    if (creationReceipt.type !== "JsnodeOperationPackageCreationReceipt") {
      await judgeDerived("refused", `package birth refused at ${creationReceipt.phase ?? phase}: ${creationReceipt.code ?? ""} ${creationReceipt.message ?? ""}`.slice(0, 600));
      return derivation === undefined ? refusal(phase, creationReceipt) : immutable({ ...refusal(phase, creationReceipt), derivations: derivation.derivations });
    }

    phase = "registry-publication";
    const shouldPublish = request.publish === true;
    let registryPublication;
    if (!shouldPublish) {
    registryPublication = immutable({ type: "JsnodeOperationPackageRegistryPublicationSkipped", version: 1, reason: "publish:false" });
    } else {
    const published = await publishJsnodeOperationPackageToRegistry({
      destination: creationReceipt.destination,
      packageName: creationReceipt.packageName,
      packageVersion: creationReceipt.packageVersion,
      registry: request.registry,
    });
    if (published.type !== "JsnodeOperationPackageRegistryPublicationReceipt") return refusal(phase, published);
    registryPublication = immutable(published);
    }

    phase = "realization-receipt-admission";
    const creationDigest = semanticId(creationReceipt);
    const evidence = { type: "ArtifactFabricationEvidence", locator: creationReceipt.destination, digest: creationDigest };
    const realizationReceipt = admitArtifactFabricationRealizationReceipt(specification, realizationCandidate(specification, evidence));
    if (realizationReceipt.type !== "ArtifactFabricationRealizationReceipt") return materializedWithoutReceipt(specification, creationReceipt, registryPublication, realizationReceipt);

    // FROG admits a born package only from this complete, admitted receipt.  Do
    // not write a creation-only projection: realization evidence must reach the
    // receiver with its specification and traceability intact.
    phase = "receipt-write";
    const receiptPath = fabricationReceiptDiskPath(creationReceipt.destination, new Date());
    const receipt = admitMarkdownJsnodeOperationPackageFabricationReceipt({
    type: "MarkdownJsnodeOperationPackageFabricationReceipt",
    version: 1,
    sourceDigest: specification.source.provenance.digest,
    specificationDigest: specification.specificationDigest,
    artifactSpecification: specification,
    jsnodeOperationPackageCreationReceipt: creationReceipt,
    jsnodeOperationPackageRegistryPublication: registryPublication,
    artifactFabricationRealizationReceipt: realizationReceipt,
    ...(derivation === undefined ? {} : { derivation: { type: "JsnodeClosureDerivation", version: 3, workOrderSpecification, workOrderSpecificationDigest: workOrderSpecification.specificationDigest, tests: "admitted examples and separately derived requirement/prohibition assays, before source; hidden from source derivation", attempts: derivation.derivations, proofing: derivation.proofing } }),
    receiptPath,
    });
    try {
      await writeTextFile({ path: receiptPath, text: `${JSON.stringify(receipt, null, 2)}\n` });
    } catch (error) {
      const unwritten = new Error(`fabrication receipt could not be written to ${receiptPath}: ${error.message}`);
      unwritten.code = "RECEIPT_UNWRITTEN";
      throw unwritten;
    }
    await judgeDerived("accepted", `born and assayed; receipt ${receiptPath}`);
    return receipt;
  } catch (error) {
    return refusal(phase, error);
  }
}
