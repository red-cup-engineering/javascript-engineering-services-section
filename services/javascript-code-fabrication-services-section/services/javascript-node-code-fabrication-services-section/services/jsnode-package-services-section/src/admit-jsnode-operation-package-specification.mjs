import path from "node:path";
import { freezeJson } from "@red-cup-engineering/json-services-section";
import { isJsonValue } from "@red-cup-engineering/json-services-section";
import { admitNpmPackageVersion } from "@red-cup-engineering/npm-package-version-admission-service";
import { admitNonemptySingleLineText } from "@red-cup-engineering/computer-text-content-engineering-services-section/admit-nonempty-single-line-text";
import { formNpmScopedPackageName } from "@red-cup-engineering/npm-scoped-package-name-formation-service";
import { readJavascriptFileExportDocumentation } from "@red-cup-engineering/read-javascript-file-export-documentation-service";
import { admitJavascriptExportDescription } from "@red-cup-engineering/read-javascript-file-export-documentation-service/description";
import { admitRelativePosixFilepath } from "@red-cup-engineering/computer-filepath-engineering-services-section/admit-relative-posix-filepath";
import { projectJsnodeOperationSourceFromArguments } from "./project-jsnode-operation-source-from-arguments.mjs";
import { parseJavaScript } from "@red-cup-engineering/javascript-node-services-section/javascript-parser";
import { planJsnodePackageCollapse, applyJsnodePackageCollapsePlan } from "@red-cup-engineering/javascript-node-services-section/syntax";

class SpecificationRefusal extends Error {
  constructor(code, message, refusedPath = null) {
    super(message);
    this.code = code;
    this.refusedPath = refusedPath;
  }
}

function refuse(code, message, refusedPath = null) {
  throw new SpecificationRefusal(code, message, refusedPath);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys, context) {
  const actual = Object.keys(value).filter((key) => context === "candidate" ? key !== "cli" : true).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || expected.some((key) => !actual.includes(key)) || actual.some((key) => !expected.includes(key))) {
    refuse("UNEXPECTED_FIELDS", `${context} must carry exactly: ${expected.join(", ")}`);
  }
}

function safePackagePath(value, context) {
  try {
    return admitRelativePosixFilepath(value);
  } catch {
    refuse("UNSAFE_PATH", `${context} must remain within the package`, typeof value === "string" ? value : null);
  }
}

function exactVersion(value, context) {
  try {
    admitNpmPackageVersion(value);
  } catch {
    refuse("INVALID_EXACT_VERSION", `${context} must be an exact three-part numeric version`);
  }
  return value;
}

function packageName(value) {
  if (typeof value !== "string") refuse("INVALID_PACKAGE_NAME", "packageName must be a scoped npm package name");
  const match = /^@([^/]+)\/([^/]+)$/u.exec(value);
  if (!match) refuse("INVALID_PACKAGE_NAME", "packageName must be a scoped npm package name");
  try {
    if (formNpmScopedPackageName({ type: "NpmScopedPackageNameFormationRequest", version: 1, owner: match[1], leaf: match[2] }) !== value) {
      refuse("INVALID_PACKAGE_NAME", "packageName must already be normalized");
    }
  } catch {
    refuse("INVALID_PACKAGE_NAME", "packageName must be a scoped npm package name");
  }
  return value;
}

function dependencyName(value) {
  if (typeof value !== "string") return false;
  if (value.startsWith("@")) {
    const match = /^@([^/]+)\/([^/]+)$/u.exec(value);
    if (!match) return false;
    try {
      return formNpmScopedPackageName({ type: "NpmScopedPackageNameFormationRequest", version: 1, owner: match[1], leaf: match[2] }) === value;
    } catch {
      return false;
    }
  }
  return /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u.test(value);
}

function dependencies(value, context) {
  if (!isRecord(value)) refuse("INVALID_DEPENDENCIES", `${context} must be a JSON record`);
  const admitted = {};
  for (const name of Object.keys(value).sort()) {
    if (!dependencyName(name)) refuse("INVALID_DEPENDENCY_NAME", `${context} contains an invalid npm package name: ${name}`);
    admitted[name] = exactVersion(value[name], `${context}.${name}`);
  }
  return admitted;
}

function operationSource(value) {
  if (!isRecord(value)) refuse("INVALID_OPERATION_SOURCE", "operation must be a JavascriptNodeOperationSource record");
  exactKeys(value, ["type", "path", "text"], "operation");
  if (value.type !== "JavascriptNodeOperationSource") refuse("INVALID_OPERATION_SOURCE", "operation.type must be JavascriptNodeOperationSource");
  const operationPath = safePackagePath(value.path, "operation.path");
  if (path.posix.dirname(operationPath) !== "scripts" || path.posix.extname(operationPath) !== ".mjs") {
    refuse("INVALID_OPERATION_PATH", "operation.path must be scripts/<command>.mjs", operationPath);
  }
  if (typeof value.text !== "string" || value.text.length === 0) refuse("EMPTY_OPERATION_SOURCE", "operation.text must carry the complete operation source", operationPath);
  // The runnable face is either one legacy import.meta.main guard (which must begin with the Node shebang) or one declaration.
  if (runnableFaces(value.text, operationPath).guards.length === 1 && !value.text.startsWith("#!/usr/bin/env node\n")) refuse("MISSING_NODE_SHEBANG", "the operation source must begin with the Node executable shebang", operationPath);

  let exported;
  try {
    exported = readJavascriptFileExportDocumentation({ type: "TextFileRead", path: operationPath, text: value.text });
  } catch (error) {
    refuse("INVALID_JAVASCRIPT", error.message, operationPath);
  }
  if (exported.length !== 1) refuse("OPERATION_EXPORT_COUNT", "the operation file must contain exactly one exported function", operationPath);
  const documentation = exported[0];
  try {
    admitJavascriptExportDescription(documentation.description);
  } catch {
    refuse("MISSING_DESCRIPTION", "the exported operation must have an admitted JSDoc description", operationPath);
  }
  if (documentation.returns === null) refuse("MISSING_RETURNS", "the exported operation must have a JSDoc @returns declaration", operationPath);

  const commandName = path.posix.basename(operationPath, ".mjs");
  return {
    type: "JavascriptNodeOperationSource",
    path: operationPath,
    text: value.text,
    exportName: documentation.name,
    commandName,
    documentation,
  };
}

function topic(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9-]*$/u.test(value)) refuse("INVALID_TOPIC", "topic must be normalized lower-kebab text");
  return value;
}

// Old authored function records are migration input, not a second emitter.
// Every operation becomes an export binding to a source module.
function operations(value) {
  if (!Array.isArray(value) || value.length === 0) refuse("MISSING_OPERATIONS", "operations must contain at least one module export binding");
  const names = new Set();
  return value.map((candidate) => {
    let operation;
    if (typeof candidate?.module === "string") {
      const module = safePackagePath(candidate.module, "operation.module");
      const name = candidate.name;
      if (typeof name !== "string" || !/^[a-z][a-z0-9-]*$/u.test(name)) refuse("INVALID_OPERATION_NAME", "operation name must be lower-kebab text");
      if (typeof candidate.exportName !== "string" || !candidate.exportName) refuse("INVALID_OPERATION_EXPORT", "operation requires an exportName");
      if (typeof candidate.description !== "string" || !candidate.description.trim()) refuse("MISSING_DESCRIPTION", "operation requires a description");
      operation = { path: module, commandName: name, exportName: candidate.exportName,
        documentation: { description: candidate.description },
        arguments: { inputSchema: candidate.inputSchema ?? null, outputSchema: candidate.outputSchema ?? null } };
    } else {
      const oldPath = safePackagePath(candidate?.path, "operation.path");
      const name = path.posix.basename(oldPath, ".mjs");
      const module = `src/${name}.mjs`;
      const projection = projectJsnodeOperationSourceFromArguments({ ...candidate, path: module, command: false });
      operation = { path: module, originalPath: oldPath, commandName: name, exportName: candidate.exportName,
        documentation: { description: candidate.description }, arguments: candidate,
        source: { type: "JavascriptNodePackageSource", path: module, text: projection.text } };
    }
    if (names.has(operation.commandName)) refuse("DUPLICATE_OPERATION_NAME", `operation name is duplicated: ${operation.commandName}`);
    names.add(operation.commandName);
    return operation;
  }).sort((left, right) => left.commandName.localeCompare(right.commandName));
}

const DECLARATION_NAMES = new Set(["operation", "catalog", "command"]);

// The runnable faces of a legacy source: import.meta.main guards (old) and exported
// operation/catalog/command declarations (new).
function runnableFaces(text, operationPath) {
  let parsed;
  try { parsed = parseJavaScript(text); } catch (error) { refuse("INVALID_JAVASCRIPT", error.message, operationPath); }
  const guards = parsed.body.filter((statement) => statement.type === "IfStatement" && text.slice(statement.test.start, statement.test.end).trim() === "import.meta.main");
  const declarations = parsed.body.filter((statement) => statement.type === "ExportNamedDeclaration"
    && statement.declaration?.type === "VariableDeclaration"
    && statement.declaration.declarations.some((declarator) => declarator.id?.type === "Identifier" && DECLARATION_NAMES.has(declarator.id.name)));
  return { guards, declarations };
}

// The runtime the old guard called must not survive into a module below the code layer.
const RUNTIME_SPECIFIER = "@red-cup-engineering/javascript-node-services-section/operation";
function withoutDeadRuntimeImports(text) {
  const program = parseJavaScript(text);
  let result = text;
  for (const statement of [...program.body].reverse()) {
    if (statement.type !== "ImportDeclaration" || statement.source.value !== RUNTIME_SPECIFIER) continue;
    const rest = text.slice(0, statement.start) + text.slice(statement.end);
    const locals = statement.specifiers.map((specifier) => specifier.local.name);
    if (locals.some((local) => new RegExp(`(?<![\\w$.])${local}(?![\\w$])`, "u").test(rest))) continue;
    result = result.slice(0, statement.start) + result.slice(statement.end).replace(/^\n/u, "");
  }
  return result;
}

function legacyOperationModule(operation) {
  const { guards, declarations } = runnableFaces(operation.text, operation.path);
  if (guards.length + declarations.length !== 1) refuse("RUNNABLE_FACE_COUNT", "legacy source migration requires exactly one runnable face: one import.meta.main guard or one operation, catalog or command declaration", operation.path);
  const face = guards[0] ?? declarations[0];
  const text = withoutDeadRuntimeImports((operation.text.slice(0, face.start) + operation.text.slice(face.end)).replace(/^#![^\n]*\n/u, "").trimEnd() + "\n");
  const module = `src/${operation.commandName}.mjs`;
  return { ...operation, path: module, originalPath: operation.path,
    arguments: { inputSchema: null, outputSchema: null },
    source: { type: "JavascriptNodePackageSource", path: module, text } };
}

function sources(value) {
  if (!Array.isArray(value)) refuse("INVALID_SOURCES", "sources must be an array");
  const paths = new Set();
  return value.map((source) => {
    if (!isRecord(source)) refuse("INVALID_SOURCE", "each source must be a JavascriptNodePackageSource record");
    exactKeys(source, ["type", "path", "text"], "source");
    if (source.type !== "JavascriptNodePackageSource") refuse("INVALID_SOURCE", "source.type must be JavascriptNodePackageSource");
    const sourcePath = safePackagePath(source.path, "source.path");
    if (!sourcePath.startsWith("src/") || !sourcePath.endsWith(".mjs")) refuse("INVALID_SOURCE_PATH", "source.path must be beneath src/ and end in .mjs", sourcePath);
    if (typeof source.text !== "string" || source.text.length === 0) refuse("EMPTY_SOURCE", "source.text must carry complete source text", sourcePath);
    if (paths.has(sourcePath)) refuse("DUPLICATE_SOURCE_PATH", `source path is duplicated: ${sourcePath}`, sourcePath);
    paths.add(sourcePath);
    return { type: "JavascriptNodePackageSource", path: sourcePath, text: source.text };
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function testSources(value, occupiedPaths) {
  if (!Array.isArray(value) || value.length === 0) refuse("MISSING_TESTS", "tests must contain at least one authored behavioral test");
  const tests = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) refuse("INVALID_TEST_SOURCE", "each test must be a JavascriptNodeOperationTestSource record");
    exactKeys(candidate, ["type", "path", "text"], "test");
    if (candidate.type !== "JavascriptNodeOperationTestSource") refuse("INVALID_TEST_SOURCE", "test.type must be JavascriptNodeOperationTestSource");
    const testPath = safePackagePath(candidate.path, "test.path");
    if (path.posix.dirname(testPath) !== "test" || !testPath.endsWith(".test.mjs")) {
      refuse("INVALID_TEST_PATH", "test.path must be test/<name>.test.mjs", testPath);
    }
    if (occupiedPaths.has(testPath)) refuse("DUPLICATE_PATH", `package path is duplicated: ${testPath}`, testPath);
    if (typeof candidate.text !== "string" || candidate.text.length === 0) refuse("EMPTY_TEST_SOURCE", "test.text must carry an authored behavioral test", testPath);
    occupiedPaths.add(testPath);
    tests.push({ type: "JavascriptNodeOperationTestSource", path: testPath, text: candidate.text });
  }
  return tests.sort((left, right) => left.path.localeCompare(right.path));
}

function operationExamples(value) {
  if (!Array.isArray(value) || value.length === 0) {
    refuse("MISSING_EXAMPLES", "examples must contain at least one import-and-command equivalence example");
  }
  const examples = [];
  const names = new Set();
  for (const candidate of value) {
    if (!isRecord(candidate)) refuse("INVALID_EXAMPLE", "each example must be a JavascriptNodeOperationExample record");
    exactKeys(candidate, ["type", "name", "input", "output"], "example");
    if (candidate.type !== "JavascriptNodeOperationExample") refuse("INVALID_EXAMPLE", "example.type must be JavascriptNodeOperationExample");
    let name;
    try {
      name = admitNonemptySingleLineText(candidate.name);
    } catch {
      refuse("INVALID_EXAMPLE_NAME", "example.name must be nonempty single-line text");
    }
    if (names.has(name)) refuse("DUPLICATE_EXAMPLE_NAME", `example name is duplicated: ${name}`);
    if (!isJsonValue(candidate.input)) refuse("INVALID_EXAMPLE_INPUT", `example ${name} input must be a JSON value`);
    if (!isJsonValue(candidate.output)) refuse("INVALID_EXAMPLE_OUTPUT", `example ${name} output must be a JSON value`);
    names.add(name);
    examples.push({ type: "JavascriptNodeOperationExample", name, input: candidate.input, output: candidate.output });
  }
  return examples;
}

function packageExamples(value, operationsByPath) {
  if (!Array.isArray(value) || value.length === 0) refuse("MISSING_EXAMPLES", "examples must contain at least one typed operation example");
  const names = new Set();
  return value.map((candidate) => {
    if (!isRecord(candidate)) refuse("INVALID_EXAMPLE", "each example must be a JsnodeOperationPackageExample record");
    exactKeys(candidate, ["type", "name", "operation", "input", "output"], "example");
    if (candidate.type !== "JsnodeOperationPackageExample") refuse("INVALID_EXAMPLE", "example.type must be JsnodeOperationPackageExample");
    const name = admitNonemptySingleLineText(candidate.name);
    if (names.has(name)) refuse("DUPLICATE_EXAMPLE_NAME", `example name is duplicated: ${name}`);
    if (!operationsByPath.has(candidate.operation)) refuse("UNKNOWN_EXAMPLE_OPERATION", "example operation must name an admitted operation binding", candidate.operation);
    if (!isJsonValue(candidate.input) || !isJsonValue(candidate.output)) refuse("INVALID_EXAMPLE", "example input and output must be JSON values");
    names.add(name);
    return { type: "JsnodeOperationPackageExample", name, operation: candidate.operation, input: candidate.input, output: candidate.output };
  });
}

function admissionRefusal(error) {
  if (error instanceof SpecificationRefusal) {
    return freezeJson({
      type: "JsnodeOperationPackageSpecificationRefusal",
      version: 1,
      code: error.code,
      message: error.message,
      path: error.refusedPath,
    });
  }
  throw error;
}

/**
 * Admits an authored module-based JSNode package specification without writing files.
 *
 * @summary Admits an authored module-based JSNode package specification.
 * @param {object} candidate A JsnodeOperationPackageSpecificationCandidate JSON record.
 * @returns {object} An immutable JsnodeOperationPackageSpecification or a specific refusal record.
 * @throws {Error} Only when an internal dependency violates its own declared contract.
 */
export function admitJsnodeOperationPackageSpecification(candidate) {
  try {
    if (!isRecord(candidate)) refuse("INVALID_CANDIDATE", "input must be a JsnodeOperationPackageSpecificationCandidate record");
    if (candidate.type !== "JsnodeOperationPackageSpecificationCandidate" || ![1, 2].includes(candidate.version)) refuse("INVALID_CANDIDATE", "candidate type and version must be JsnodeOperationPackageSpecificationCandidate@1 or @2");
    const isV2 = candidate.version === 2;
    exactKeys(candidate, isV2 ? ["type", "version", "packageName", "packageVersion", "license", "topic", "sources", "operations", "tests", "examples", "dependencies", "devDependencies"] : ["type", "version", "packageName", "packageVersion", "license", "operation", "tests", "examples", "dependencies", "devDependencies"], "candidate");
    const admittedPackageName = packageName(candidate.packageName);
    const admittedVersion = exactVersion(candidate.packageVersion, "packageVersion");
    let license;
    try {
      license = admitNonemptySingleLineText(candidate.license);
    } catch {
      refuse("INVALID_LICENSE", "license must be nonempty single-line text");
    }
    const admittedOperations = isV2 ? operations(candidate.operations) : [legacyOperationModule(operationSource(candidate.operation))];
    let sourceModules = sources([...(isV2 ? candidate.sources : []), ...admittedOperations.flatMap((operation) => operation.source ? [operation.source] : [])]);
    const modulePaths = new Set(sourceModules.map((source) => source.path));
    for (const operation of admittedOperations) if (!modulePaths.has(operation.path)) refuse("MISSING_OPERATION_MODULE", `operation module is absent: ${operation.path}`, operation.path);
    const tests = testSources(candidate.tests, new Set([...admittedOperations.map((operation) => operation.path), "test/operation-contracts.test.mjs"]));
    const paths = new Map(admittedOperations.map((operation) => [operation.commandName, operation]));
    for (const operation of admittedOperations) {
      if (admittedOperations.filter((other) => other.path === operation.path).length === 1) paths.set(operation.path, operation);
      if (operation.originalPath) paths.set(operation.originalPath, operation);
    }
    const mapping = { files: admittedOperations.flatMap((operation) => operation.originalPath ? [{ from: operation.originalPath, to: operation.path }] : []), packageExports: [] };
    const projectReference = (file, originalPath = file.path) => ({ ...file, text: applyJsnodePackageCollapsePlan(file.text, originalPath, planJsnodePackageCollapse(file.text, originalPath, mapping)).text });
    sourceModules = sourceModules.map((source) => projectReference(source, admittedOperations.find((operation) => operation.source?.path === source.path)?.originalPath ?? source.path));
    const migratedTests = tests.map((test) => projectReference(test));
    const examples = isV2 ? packageExamples(candidate.examples, paths).map((example) => ({ ...example, operation: paths.get(example.operation).commandName })) : operationExamples(candidate.examples).map((example) => ({ ...example, type: "JsnodeOperationPackageExample", operation: admittedOperations[0].commandName }));
    for (const operation of admittedOperations) if (!examples.some((example) => example.operation === operation.commandName)) refuse("MISSING_OPERATION_EXAMPLE", `operation requires an example: ${operation.commandName}`, operation.path);
    if (Object.hasOwn(candidate, "cli") && candidate.cli !== null) refuse("INVALID_CLI", "omit cli for the topic catalog or set cli to null for modules only");
    const app = candidate.cli === null ? null : { path: `apps/${isV2 ? topic(candidate.topic) : admittedOperations[0].commandName}-cli.mjs`, commandName: isV2 ? topic(candidate.topic) : admittedOperations[0].commandName };
    const runtimeDependencies = dependencies(candidate.dependencies, "dependencies");
    const developmentDependencies = dependencies(candidate.devDependencies, "devDependencies");
    if (app !== null) {
      for (const [name, version] of Object.entries({
        "@red-cup-engineering/javascript-node-services-section": "0.3.0",
      })) {
        if (Object.hasOwn(runtimeDependencies, name) && !["0.2.0", version].includes(runtimeDependencies[name])) {
          refuse("PROJECTED_MACHINE_FACE_DEPENDENCY_CONFLICT", `${name} must be pinned to ${version} for projected machine faces`);
        }
        if (Object.hasOwn(developmentDependencies, name)) {
          refuse("PROJECTED_MACHINE_FACE_DEPENDENCY_CONFLICT", `${name} must be a runtime dependency pinned to ${version} for projected machine faces`);
        }
        runtimeDependencies[name] = version;
      }
    }
    for (const name of Object.keys(runtimeDependencies)) {
      if (Object.hasOwn(developmentDependencies, name)) refuse("DUPLICATE_DEPENDENCY", `${name} occurs in dependencies and devDependencies`);
    }

    return freezeJson({
      type: "JsnodeOperationPackageSpecification",
      version: 2,
      packageName: admittedPackageName,
      packageVersion: admittedVersion,
      license,
      topic: isV2 ? topic(candidate.topic) : admittedOperations[0].commandName,
      sources: sourceModules, operations: admittedOperations.map(({ source, originalPath, ...operation }) => operation), app,
      tests: migratedTests,
      examples,
      dependencies: runtimeDependencies,
      devDependencies: developmentDependencies,
    });
  } catch (error) {
    return admissionRefusal(error);
  }
}
