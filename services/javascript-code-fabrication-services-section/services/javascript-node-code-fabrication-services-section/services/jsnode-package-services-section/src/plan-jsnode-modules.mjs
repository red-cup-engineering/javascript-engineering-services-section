/** Pure source-addressable JSNode module planning, shared with derivation. */
import { projectJsnodeExampleTests } from "./project-jsnode-example-tests.mjs";
import { admitArtifactFabricationSpecification, admitArtifactFabricationRealizationPlan } from "@red-cup-engineering/computer-data-engineering-services-section/artifact-fabrication";
import { admitNpmPackageVersion } from "@red-cup-engineering/npm-package-version-admission-service";
import { projectJsnodeModulePaths } from "./project-jsnode-module-paths.mjs";
import { admitNativeAssayProfile, nativeAssayData, nativeBindingsFor, projectNativeAssays } from "./native-assay-profile.mjs";
import { closedAssaySchema } from "./closed-assay-schema.mjs";
import { assertAdmittedAssayNames } from "./assay-completion.mjs";

// The module projector already owns operation names, export bindings and paths.
// A meaning closure supplies examples and exact dependencies, never source,
// tests, an npm identity, a destination, or a publication instruction.
import moduleSchema from "../data/records/schema/jsnode-module-specification.schema.json" with { type: "json" };
export const JSNODE_MODULE_MEANING_CLOSURE_SCHEMA = Object.freeze({
  type: "object", additionalProperties: false,
  required: ["operations", "examples", "dependencies"],
  properties: {
    operations: { ...moduleSchema.properties.operations, minItems: 1, items: {
      ...moduleSchema.properties.operations.items,
      oneOf: [
        { required: ["inputSchema", "outputSchema"], not: { required: ["nativeProfile"] } },
        { required: ["nativeProfile"], not: { anyOf: ["inputSchema", "outputSchema", "inputSchemaPath", "outputSchemaPath"].map(key => ({ required: [key] })) } },
      ],
    } },
    examples: { type: "array", minItems: 1, items: {
      type: "object", additionalProperties: false,
      required: ["name", "operation", "input", "output"],
      properties: { name: { type: "string", minLength: 1 }, operation: { type: "string", minLength: 1 }, input: {}, output: {} },
    } },
    dependencies: { type: "object", additionalProperties: {
      type: "string",
    } },
  },
});
export const moduleMeaningClosure = closedAssaySchema(JSNODE_MODULE_MEANING_CLOSURE_SCHEMA);

export function moduleFabricationPlan(candidate) {
  let phase = "artifact-specification-admission", workOrder;
  const refuse = cause => Object.freeze({
    type: "JsnodeModuleDerivationRefusal", version: 1, phase,
    code: cause.code ?? "FABRICATION_FAILED", message: cause.question ?? cause.evidence ?? cause.message ?? String(cause),
    cause, ...(workOrder ? { workOrderSpecificationDigest: workOrder.specificationDigest, source: workOrder.source } : {}),
  });
  try {
    workOrder = admitArtifactFabricationSpecification(candidate);
    if (workOrder.type !== "ArtifactFabricationSpecification") return refuse(workOrder);
    phase = "module-meaning-closure-admission";
    const projection = workOrder.projections[0];
    if (workOrder.artifact.kind !== "jsnode-modules" || workOrder.projections.length !== 1
        || projection.id !== "jsnode-modules"
        || projection.target !== "@red-cup-engineering/jsnode-package-services-section/derive-jsnode-package-from-closure") {
      return refuse({ code: "INVALID_MODULE_PROJECTION", message: "one jsnode-modules projection to the module fabricator is required" });
    }
    const closure = moduleMeaningClosure.assert(projection.configuration);
    // Source-free example names must be receivable by the native TAP runner
    // before Work admission or inference. Derived cases are checked later.
    assertAdmittedAssayNames(closure);
    const names = new Set(), bindings = new Set(), examples = new Set();
    for (const op of closure.operations) {
      if (op.nativeProfile !== undefined) admitNativeAssayProfile(op.nativeProfile);
      for (const schemaPath of [op.inputSchemaPath, op.outputSchemaPath].filter(value => value !== undefined)) {
        if (!schemaPath.startsWith("data/") || schemaPath.includes("\\") || schemaPath.split("/").some(part => part === "." || part === "..")) throw new TypeError("schema path must stay beneath data");
      }
      if (op.module.split("/").some(part => part === "." || part === "..") || op.module.includes("\\")) throw new TypeError("module path must stay beneath src");
      if (names.has(op.name) || bindings.has(op.module + ":" + op.exportName)) throw new TypeError("duplicate operation name or module export");
      names.add(op.name); bindings.add(op.module + ":" + op.exportName);
      if (!closure.examples.some(example => example.operation === op.name)) throw new TypeError("every operation needs an admitted example");
    }
    for (const example of closure.examples) {
      const op = closure.operations.find(op => op.name === example.operation);
      if (!op || examples.has(example.operation + ":" + example.name)) throw new TypeError("unknown operation or duplicate example");
      examples.add(example.operation + ":" + example.name);
      if (op.nativeProfile !== undefined) nativeAssayData(example);
      closedAssaySchema(assayInputSchemaOf(op)).assert(example.input);
      closedAssaySchema(assayOutputSchemaOf(op)).assert(example.output);
    }
    for (const [name, version] of Object.entries(closure.dependencies)) {
      if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/u.test(name)) throw new TypeError("invalid dependency name");
      admitNpmPackageVersion(version);
    }
    phase = "realization-plan-preflight";
    const plan = admitArtifactFabricationRealizationPlan(workOrder, {
      type: "ArtifactFabricationRealizationPlanCandidate", version: 1,
      artifactId: workOrder.artifact.id, specificationDigest: workOrder.specificationDigest,
      projectionIds: [projection.id], acceptanceObligationIds: workOrder.acceptanceObligations.map(item => item.id),
    });
    if (plan.type !== "ArtifactFabricationRealizationPlan") return refuse(plan);
    return {workOrder, closure, plan};
  } catch (error) { return refuse({name: error.name, message: error.message}); }
}

/** Admit the original order and project every output path without inference or filesystem effects. */
export function planJsnodeModules(candidate) {
  const admitted = moduleFabricationPlan(candidate);
  if (admitted.type === "JsnodeModuleDerivationRefusal") return admitted;
  const {workOrder, closure, plan} = admitted;
  // Planning declares paths without acquiring or invoking a native host port.
  const paths = [...projectJsnodeModulePaths(closure), ...closure.operations.map(testPathOf)];
  if (new Set(paths).size !== paths.length) throw new TypeError("fabrication output paths are duplicated");
  return Object.freeze({type: "JsnodeModuleFabricationPlan", version: 1,
    workOrderSpecificationDigest: workOrder.specificationDigest, realizationPlan: plan,
    paths: Object.freeze(paths.sort())});
}

const examplesOf = (closure, operation) => closure.examples.filter((example) => example.operation === operation.name);
const testPathOf = operation => `test/${operation.name}-examples.test.mjs`;
export const assayInputSchemaOf = operation => operation.nativeProfile?.scenarioSchema ?? operation.inputSchema;
export const assayOutputSchemaOf = operation => operation.nativeProfile?.observationSchema ?? operation.outputSchema;

/**
 * The tests a closure's examples determine: for each operation, one test per admitted example,
 * importing the operation's module and holding its result to the admitted output.
 */
export function testsOfClosure(closure, derivedCases = [], nativeAssayBindings) {
  const bindings = nativeBindingsFor(closure, nativeAssayBindings);
  return closure.operations.map((operation) => {
    if (operation.nativeProfile !== undefined) {
      const cases = [
        ...examplesOf(closure, operation).map(example => ({ ...example, throws: null, testName: `${operation.name}: ${example.name}` })),
        ...derivedCases.filter(item => item.operation === operation.name).map(item => ({ ...item, testName: `${operation.name}: clause assay ${item.name}` })),
      ];
      return Object.freeze({ type: "JavascriptNodeOperationTestSource", path: testPathOf(operation),
        text: projectNativeAssays(operation, cases, bindings) });
    }
    return projectJsnodeExampleTests(operation, examplesOf(closure, operation),
      derivedCases.filter(item => item.operation === operation.name));
  });
}
