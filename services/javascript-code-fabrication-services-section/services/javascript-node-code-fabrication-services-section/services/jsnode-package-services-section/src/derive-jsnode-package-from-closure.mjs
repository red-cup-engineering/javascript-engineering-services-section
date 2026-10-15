/**
 * Derive a JSNode package's sources and tests from its meaning-closure (computer-code-fabrication
 * science specification 2026-09-04, "Code fabrication from a specification"; the Central Dogma of
 * Code Fabrication). The closure states what is made: requirements and prohibitions, the laws and
 * standards they answer to, each operation's input and output schemas, and admitted examples. It
 * carries no source and no tests. The fabricator derives both:
 *
 * - **Tests first, and deterministically**, from admitted examples and a separate clause-derived assay delivery: one test per example
 *   holding the operation to its admitted output. The channel that writes the source never writes
 *   or sees these beyond the examples the closure already admits.
 * - **Then each declared module**, from the closure alone, by whatever `infer` the caller
 *   composes (the house inference market: this package is code and never reaches the market
 *   itself). A delivery that names an open question instead of a module is a refusal, and the order
 *   is revised; a provider's convenient default is never a resolution.
 * - **One pre-assay** runs the complete declared module set on its examples before the package-birth pipeline
 *   spends an install on it, using exact dependencies already installed in the
 *   host-supplied consumer project. A failure is judged
 *   back to the market as refused, with the failing example as its evidence. The derivation ends;
 *   selecting another provider or revising the order belongs to the allocating work process.
 *
 * Every attempt is recorded with the lot the market sold it under, so the fabrication receipt binds
 * the provider, and the caller judges the accepted lot once the whole pipeline has assayed it.
 */
import path from "node:path";
import { parseJsonValue } from "@red-cup-engineering/json-services-section";
import { inspectInstalledNpmPackageResolution } from "@red-cup-engineering/inspect-installed-npm-package-service";
import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";
import { bindOperationMeaningClosure } from "@red-cup-engineering/computer-data-engineering-services-section/artifact-fabrication";
import { projectJsnodeModules } from "./project-jsnode-modules.mjs";
import { channelOfPreAssayFailure, proofingOfDerivation } from "./assay-channels.mjs";
import { admittedAssayNames, receiveIsolatedAssayOutcome } from "./assay-completion.mjs";
import { misfoldRefusal, misfoldsOfModule } from "./misfold.mjs";

import { moduleMeaningClosure, moduleFabricationPlan, testsOfClosure } from "./plan-jsnode-modules.mjs";
export { JSNODE_MODULE_MEANING_CLOSURE_SCHEMA, planJsnodeModules, testsOfClosure } from "./plan-jsnode-modules.mjs";

const TASK_CLASS = "code-fabrication";

/** Fabricate module proposals from canonical work data, without package birth. */
export async function deriveJsnodeModules(candidate, carriers = {}) {
  let phase = "artifact-specification-admission", workOrder;
  const refuse = cause => Object.freeze({
    type: "JsnodeModuleDerivationRefusal", version: 1, phase,
    code: cause.code ?? "FABRICATION_FAILED", message: cause.question ?? cause.evidence ?? cause.message ?? String(cause),
    cause, ...(workOrder ? { workOrderSpecificationDigest: workOrder.specificationDigest, source: workOrder.source } : {}),
  });
  try {
    const admitted = moduleFabricationPlan(candidate);
    if (admitted.type === "JsnodeModuleDerivationRefusal") return admitted;
    const {closure, plan} = admitted;
    workOrder = admitted.workOrder;
    phase = "derivation";
    if (typeof carriers.infer !== "function") return refuse({ code: "NO_DERIVATION_CARRIER", message: "no inference carrier was composed" });
    const derivation = await deriveJsnodePackageFromClosure(workOrder, carriers);
    if (derivation.type === "JsnodeClosureDerivationRefusal") return refuse(derivation);
    phase = "module-projection";
    const files = projectJsnodeModules({ sources: derivation.sources.map(({ path, text }) => ({ path, text })), operations: closure.operations });
    return Object.freeze({
      type: "JsnodeModuleProposal", version: 1, workOrderSpecification: workOrder,
      realizationPlan: plan, files, tests: derivation.tests,
      dependencies: closure.dependencies, derivation,
    });
  } catch (error) { return refuse({ name: error.name, message: error.message }); }
}


/** One whole delivery: source and question are mutually exclusive at admission.
 * Nullable fields retain one closed shape supported by strict structured decoders.
 */
export const MODULE_DELIVERY_SCHEMA = Object.freeze({
  $id: "jsnode/fabrication/module-delivery",
  type: "object", required: ["source", "question"], additionalProperties: false,
  properties: {
    source: { type: ["string", "null"] },
    question: { type: ["string", "null"] },
  },
});
const moduleDelivery = schemaFrom(MODULE_DELIVERY_SCHEMA);


/**
 * The Node binding of a language-neutral operation closure (artifact-fabrication
 * `OperationMeaningClosure`, fabrication line stage 2): the same order any language binds, given its
 * module paths and export names by the Node convention and admitted as this line's module closure.
 * `requirements` and `prohibitions` are the order's settled clauses (ArtifactFabricationSpecification),
 * which the clause assays must cover. Returns the closure with `packageName`, or the binding's refusal.
 */
export function jsnodeClosureOfOperationClosure(closure, { packageName, requirements = [], prohibitions = [] } = {}) {
  const bound = bindOperationMeaningClosure(closure, "javascript-node");
  if (bound.type !== "BoundOperationMeaningClosure") return bound;
  const jsnode = moduleMeaningClosure.assert({
    operations: bound.operations.map(({ symbol, ...operation }) => ({ ...operation, exportName: symbol })),
    examples: bound.examples, dependencies: bound.dependencies,
  });
  // The order's settled clauses travel with it: clause assays must cover every one of them.
  return Object.freeze({ ...jsnode, packageName: packageName ?? "operation-closure", requirements, prohibitions, closureDigest: bound.closureDigest });
}

/** Clause assays are data, never provider-supplied executable test programs. */
export function assayDeliverySchema(closure) {
  const clauseIds = [...closure.requirements, ...closure.prohibitions].map(item => item.id);
  return {
    type: "object", required: ["cases", "question"], additionalProperties: false,
    properties: {
      question: { type: ["string", "null"] },
      cases: { anyOf: [{ type: "null" }, { type: "array", minItems: 1, items: {
        anyOf: closure.operations.map(op => ({
          type: "object", additionalProperties: false,
          required: ["operation", "name", "clauses", "input", "output", "throws"],
          properties: {
            operation: { const: op.name }, name: { type: "string", minLength: 1 },
            clauses: { type: "array", minItems: 1, uniqueItems: true, items: { enum: clauseIds } },
            input: op.inputSchema,
            output: { anyOf: [op.outputSchema, { type: "null" }] },
            throws: { enum: [null, "Error", "TypeError", "RangeError", "SyntaxError"] },
          },
        })),
      } }] },
    },
  };
}

export function assayCasesOfDelivery(text, closure) {
  const delivery = schemaFrom(assayDeliverySchema(closure)).assert(parseJsonValue(text));
  if (delivery.cases === null && typeof delivery.question === "string" && delivery.question.trim()) return { question: delivery.question };
  if (!Array.isArray(delivery.cases) || delivery.question !== null) throw new TypeError("assay delivery must carry cases or an open question exclusively");
  const covered = new Set(), names = new Set();
  for (const item of delivery.cases) {
    if (item.throws !== null && item.output !== null) throw new TypeError("a refusal assay cannot also declare a returned output");
    const op = closure.operations.find(op => op.name === item.operation);
    if (item.throws === null) schemaFrom(op.outputSchema).assert(item.output);
    const name = item.operation + ":" + item.name;
    if (names.has(name)) throw new TypeError("duplicate clause assay name");
    names.add(name); item.clauses.forEach(id => covered.add(id));
  }
  const missing = [...closure.requirements, ...closure.prohibitions].filter(item => !covered.has(item.id));
  if (missing.length) throw new TypeError("uncovered clauses: " + missing.map(item => item.id).join(", "));
  return { cases: delivery.cases };
}

/** Carry the complete admitted order, rather than an independently maintained summary.
 * Direct code callers may supply a closure; the native fabricator supplies the
 * admitted specification, including provenance, obligations and traceability.
 * Generated assays never enter either carrier.
 */
export function assayMessagesOf(workOrder) {
  return [
    { role: "system", content: "Derive behavioral assay cases from the closed work order's requirements and prohibitions before any source is written. The workOrder carrier is the entire order; its projection configuration declares the operations, schemas, examples and dependencies. Return only the supplied JSON carrier. Cases must be determined by the clauses, cover every clause by ID, and use inputs admitted by the operation's input schema. Do not invent requirements. Include cases beyond the supplied examples. Returned outputs and thrown error names are exclusive. If a required expectation is not determined, return cases null and a nonempty question. No executable source, tool calls or repository access." },
    { role: "user", content: JSON.stringify({ workOrder }) },
  ];
}

/** The complete original order and the module to realize; never derived assays. */
export function sourceMessagesOf(workOrder, member) {
  const operations = Array.isArray(member) ? member : [member];
  return [
    { role: "system", content: "Realize exactly the selected module from the complete workOrder carrier. Its projection configuration declares the operations, schemas, dependencies and admitted examples. Preserve all normative clauses, their authority, revision, locator and applicability, traceability, and receiving obligations. Produce one ECMAScript module for Node.js 24 exporting every operation declared for selectedModule. Each export takes the value its input schema admits, without changing its shape, and returns the value its output schema admits, directly or as a Promise. Import only node: builtins, declared dependencies, and relative paths to other modules declared by the order. Use the other modules' declared export names and schemas; do not inline their implementations. Read no file, network or environment unless required by the order. Each export carries a JSDoc description, @param and @returns. No shebang or command face: the package projects that. Return one JSON document satisfying the supplied output schema, source carrying the complete module and question null. If the order leaves a required choice open, source must be null and question must name that open choice. Exactly one field carries a nonempty string. Return no fences, commentary, additional fields or multiple candidates." },
    { role: "user", content: JSON.stringify({ workOrder, selectedModule: operations[0].module }) },
  ];
}

/** Decode and admit one complete sourced-module delivery; never guess from prose. */
export function moduleOfDelivery(text, member) {
  const operations = Array.isArray(member) ? member : [member];
  let record;
  try { record = moduleDelivery.assert(parseJsonValue(text)); }
  catch (error) { return { refused: "delivery is outside the closed module/question carrier: " + error.message }; }
  const hasSource = typeof record.source === "string" && record.source.trim().length > 0;
  const hasQuestion = typeof record.question === "string" && record.question.trim().length > 0;
  if (hasSource && record.question === null) {
    if (record.source.startsWith("#!")) return { refused: "the module carries a shebang; the package projects its command-line face" };
  } else if (hasQuestion && record.source === null) return { question: record.question };
  else return { refused: "delivery must carry exactly one nonempty source or open question and null for the other" };
  const source = record.source;
  for (const operation of operations) {
  const name = operation.exportName;
  const exported = new RegExp(`export\\s+(?:(?:async\\s+)?function\\s*\\*?\\s*${name}\\b|(?:const|let)\\s+${name}\\s*=)|export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`, "u");
  if (!exported.test(source)) return { refused: `the module does not export ${name}` };
  }
  if (/import\.meta\.main/u.test(source)) return { refused: "the module carries a command-line face; the package projects that" };
  return { source };
}

/**
 * Build the complete connected source and independent test lot, then receive
 * the outcome from the host's isolated execution capability.
 *
 * This Code Engineering module does NOT execute supplier-authored code. The
 * runtime host must provide isolatedAssayExecutor from its own trusted service
 * composition, not from the customer's JSON request. A temporary directory or
 * Node --test child is NOT an isolation mechanism. No ambient fallback exists.
 *
 * The executor is responsible for making the supplied files available only in
 * an ephemeral isolated workspace, mounting exact declared dependencies
 * read-only, disabling network and host credentials, bounding resources and
 * killing all descendants. This function checks behavior evidence afterward.
 */
export async function preAssayModules(closure, sources, derivedCases = [], dependencyResolutions = [], isolatedAssayExecutor) {
  if (typeof isolatedAssayExecutor !== "function") return {
    passed: false, code: "ISOLATED_ASSAY_UNAVAILABLE",
    failure: "isolated execution capability was not composed by the host; candidate source was not executed",
  };
  for (const [name, version] of Object.entries(closure.dependencies ?? {})) {
    const resolution = dependencyResolutions.find(item => item.expectedName === name);
    if (!resolution?.conformant || resolution.packageVersion !== version || !resolution.packageRoot) {
      return { passed: false, code: "ASSAY_CONTEXT_UNAVAILABLE",
        failure: `no exact installed assay dependency: ${name}@${version}` };
    }
  }
  try {
    // Admission of paths, named exports and complete import closure happens
    // BEFORE any executable provider is called.
    const modules = projectJsnodeModules({
      sources: sources.map(({ path, text }) => ({ path, text })),
      operations: closure.operations,
    });
    const assays = testsOfClosure(closure, derivedCases);
    const names = admittedAssayNames(closure, derivedCases);
    const files = Object.freeze([...modules, ...assays.map(({ path, text }) => ({ path, text }))].map(file =>
      Object.freeze({ path: file.path, text: file.text })));
    const testPaths = Object.freeze(assays.map(({ path }) => path));
    const allPaths = files.map(file => file.path);
    if (new Set(allPaths).size !== allPaths.length ||
        files.length > 128 || files.some(file => file.text.length > 1024 * 1024) ||
        files.reduce((size, file) => size + Buffer.byteLength(file.text, "utf8"), 0) > 4 * 1024 * 1024)
      return { passed: false, code: "ASSAY_INPUT_UNBOUNDED",
        failure: "connected module assay input has duplicate paths or exceeds the bounded source profile" };

    const run = await isolatedAssayExecutor(Object.freeze({
      kind: "jsnode.connected-module-pre-assay", version: 1,
      files, testPaths, expectedAssays: names,
      dependencies: Object.freeze(dependencyResolutions.map(item => Object.freeze({
        expectedName: item.expectedName, packageVersion: item.packageVersion,
        packageRoot: item.packageRoot,
      }))),
      timeoutMs: 30000, network: false, writableHostWorkspace: false,
    }));
    return receiveIsolatedAssayOutcome(run, names);
  } catch (error) {
    return { passed: false, code: "ASSAY_EXECUTION_REFUSED",
      failure: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Derive a closure's sources and tests. `infer({ taskClass, objective, messages, schema, requiredCapabilities })` resolves to
 * { text, lot }; `judge(lot, outcome, evidence)` tells the market its judgment of a delivery, its
 * evidence one string.
 * Returns { sources, tests, derivations } or a JsnodeClosureDerivationRefusal naming the operation,
 * the open question when the order is not closed, and every attempt.
 */
export async function deriveJsnodePackageFromClosure(workOrder, { infer, judge = async () => undefined, dependencyProjectRoot, isolatedAssayExecutor } = {}) {
  // The native path uses one admitted order for both the providers and assays.
  // A lower-level closure remains usable by code callers without claiming admission.
  const closure = workOrder.type === "ArtifactFabricationSpecification"
    ? { ...workOrder.projections[0].configuration, packageName: workOrder.projections[0].configuration.packageName ?? workOrder.artifact.id,
        requirements: workOrder.requirements, prohibitions: workOrder.prohibitions,
        constraints: workOrder.constraints, openQuestions: workOrder.openQuestions }
    : workOrder;
  if (typeof infer !== "function") throw new TypeError("a closure's sources are derived by an inference carrier the caller composes");
  // Do not purchase inference or materialize source when the host cannot
  // actually run and receive the complete hidden/declared test lot safely.
  if (typeof isolatedAssayExecutor !== "function")
    return Object.freeze({ type: "JsnodeClosureDerivationRefusal", version: 1,
      code: "ISOLATED_ASSAY_UNAVAILABLE",
      evidence: "the host did not compose an isolated code-execution capability",
      derivations: Object.freeze([]) });
  const told = async (lot, outcome, evidence) => {
    try { await judge(lot, outcome, evidence); return outcome; } catch (error) { return `${outcome} (untold: ${String(error?.message ?? error).slice(0, 200)})`; }
  };
  const sources = [];
  const derivations = [];
  let dependencyResolutions = [];
  try {
    for (const [expectedName, expectedVersion] of Object.entries(closure.dependencies ?? {})) {
      if (typeof dependencyProjectRoot !== "string" || !path.isAbsolute(dependencyProjectRoot)) {
        throw new TypeError("dependency-bearing fabrication requires an explicit installed consumer project");
      }
      const resolution = await inspectInstalledNpmPackageResolution({
        type: "InstalledNpmPackageInspectionRequest", version: 1,
        projectRoot: path.resolve(dependencyProjectRoot), packageRoot: null,
        expectedName, expectedVersion, entry: { kind: "package" },
      });
      dependencyResolutions.push(resolution);
      if (!resolution.conformant) throw new TypeError(`assay dependency unavailable: ${expectedName}@${expectedVersion}`);
    }
  } catch (error) {
    return Object.freeze({ type: "JsnodeClosureDerivationRefusal", version: 1,
      code: "ASSAY_CONTEXT_UNAVAILABLE", evidence: error.message,
      dependencyResolutions: Object.freeze(dependencyResolutions), derivations: Object.freeze(derivations) });
  }
  let assayDelivery, assayCases;
  try {
    assayDelivery = await infer({ taskClass: "code-fabrication-assays", objective: `Derive clause assays for ${closure.packageName} before source`, messages: assayMessagesOf(workOrder), schema: assayDeliverySchema(closure), requiredCapabilities: ["text-output"] });
    assayCases = assayCasesOfDelivery(assayDelivery.text, closure);
    if (assayCases.question !== undefined) throw new Error("open assay question: " + assayCases.question);
  } catch (error) {
    derivations.push({ phase: "clause-assays", outcome: assayDelivery ? "refused" : "undelivered", evidence: String(error?.message ?? error), ...(assayDelivery ? { lot: assayDelivery.lot, judged: await told(assayDelivery.lot, "refused", String(error?.message ?? error)) } : {}), ...(error?.cause === undefined ? {} : { cause: error.cause }) });
    return Object.freeze({ type: "JsnodeClosureDerivationRefusal", version: 1, code: assayCases?.question ? "OPEN_QUESTION" : "ASSAY_DERIVATION_REFUSED", ...(assayCases?.question ? { question: assayCases.question } : {}), derivations: Object.freeze(derivations) });
  }
  derivations.push({ phase: "clause-assays", outcome: "derived", lot: assayDelivery.lot, cases: assayCases.cases });
  const tests = testsOfClosure(closure, assayCases.cases);
  // Kinetic proofing: which channels examined the source, their independence from its writer, and
  // which channel caught which defect (assay-channels.mjs).
  const catches = [];
  const proofing = () => proofingOfDerivation({
    workOrder, assayLot: assayDelivery.lot, examples: closure.examples,
    writerLots: derivations.filter(item => item.module && item.lot !== undefined).map(item => item.lot), catches,
  });
  const refused = (code, operation, detail = {}) => Object.freeze({
    type: "JsnodeClosureDerivationRefusal", version: 1, code,
    ...(operation === undefined ? {} : { operation: operation.name }), ...detail, derivations: Object.freeze(derivations), proofing: proofing(),
  });
  const modules = new Map();
  for (const operation of closure.operations) {
    if (!modules.has(operation.module)) modules.set(operation.module, []);
    modules.get(operation.module).push(operation);
  }
  for (const operations of modules.values()) {
    const operation = operations[0];
    // One delivery is one derivation, not an implicit authority to purchase repairs.
    let delivery;
    try {
      delivery = await infer({ taskClass: TASK_CLASS, objective: `Derive ${closure.packageName}'s ${operation.module} from its work order`, messages: sourceMessagesOf(workOrder, operations), schema: MODULE_DELIVERY_SCHEMA, requiredCapabilities: ["text-output"] });
    } catch (error) {
      derivations.push({ operation: operation.name, attempt: 1, outcome: "undelivered", evidence: String(error?.message ?? error).slice(0, 300),
        ...(error?.cause === undefined ? {} : { cause: error.cause }),
      });
      return refused("DERIVATION_UNDELIVERED", operation);
    }
    const read = moduleOfDelivery(delivery.text, operations);
    const record = { operation: operation.name, operations: operations.map(op => op.name), module: operation.module, attempt: 1, lot: delivery.lot };
    if (read.question !== undefined) {
      derivations.push({ ...record, outcome: "question", evidence: read.question, judged: await told(delivery.lot, "refused", `open question: ${read.question}`) });
      return refused("OPEN_QUESTION", operation, { question: read.question });
    }
    if (read.source === undefined) {
      derivations.push({ ...record, outcome: "refused", evidence: read.refused, excerpt: delivery.text.slice(0, 400), judged: await told(delivery.lot, "refused", read.refused) });
      catches.push({ defect: read.refused, method: "delivery-admission" });
      return refused("DERIVATION_REJECTED", operation);
    }
    // A module that only re-exports or forwards to a declared dependency's capability is a misfold:
    // deposited beside the territory rather than folded from the order (misfold.mjs).
    const misfold = misfoldRefusal(misfoldsOfModule(read.source, operation.module, operations.map(op => op.exportName)));
    if (misfold !== undefined) {
      derivations.push({ ...record, outcome: "refused", evidence: misfold, judged: await told(delivery.lot, "refused", misfold) });
      catches.push({ defect: misfold, method: "fold-check" });
      return refused("MISFOLD", operation);
    }
    derivations.push({ ...record, outcome: "derived" });
    sources.push(Object.freeze({ type: "JavascriptNodePackageSource", path: operation.module, text: read.source }));
  }
  // Inference may outlive the installed context. A changed environment is
  // not a negative judgment of a supplier's source.
  const currentDependencies = await Promise.all(dependencyResolutions.map(item =>
    inspectInstalledNpmPackageResolution({
      type: "InstalledNpmPackageInspectionRequest", version: 1,
      projectRoot: item.projectRoot, packageRoot: item.packageRoot,
      expectedName: item.expectedName, expectedVersion: item.expectedVersion,
      entry: { kind: "package" },
    })));
  if (currentDependencies.some(item => !item.conformant)) {
    for (const record of derivations.filter(item => item.module)) Object.assign(record, {
      outcome: "unassayed", evidence: "installed dependency context changed during derivation", dependencyResolutions: currentDependencies,
    });
    return refused("ASSAY_CONTEXT_CHANGED", undefined, { scope: "module-set" });
  }
  dependencyResolutions = currentDependencies;
  const assay = await preAssayModules(closure, sources, assayCases.cases, dependencyResolutions, isolatedAssayExecutor);
  if (!assay.passed) {
    // The whole composition failed. Do not attribute an interaction failure
    // to an arbitrarily selected module or purchase automatic repairs.
    for (const record of derivations.filter(item => item.module)) Object.assign(record, {
      outcome: "composition-refused", evidence: assay.failure, dependencyResolutions,
    });
    catches.push({ defect: assay.failure, method: channelOfPreAssayFailure(assay.failure) });
    return refused("DERIVATION_REJECTED", undefined, { scope: "module-set", evidence: assay.failure });
  }
  for (const record of derivations.filter(item => item.module)) Object.assign(record, {
    outcome: "pre-assayed", evidence: "complete declared module set: admitted examples and prior clause assays", dependencyResolutions,
  });
  return Object.freeze({ sources: Object.freeze(sources), tests: Object.freeze(tests), derivations: Object.freeze(derivations), proofing: proofing() });
}

