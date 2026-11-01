import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path, { isAbsolute as isAbsoluteFilepath } from "node:path";
import { freezeJson } from "@red-cup-engineering/json-services-section";
import { admitJavascriptNodeCommandExecutionRequest } from "@red-cup-engineering/javascript-node-services-section/admit-javascript-node-command-execution-request";
import { admitJsnodeOperationPackageCreationReceipt } from "./admit-jsnode-operation-package-creation-receipt.mjs";
import { executeJavascriptNodeCommand } from "@red-cup-engineering/execute-javascript-node-command-service";
import { admitJsnodeOperationPackageSpecification } from "./admit-jsnode-operation-package-specification.mjs";
import { parse } from "@red-cup-engineering/json-services-section";
import { parseLines, serializeLines } from "@red-cup-engineering/jsonl-services-section";
import { packNpmPackage } from "@red-cup-engineering/npm-package-services-section/pack-npm-package";
import { inspectInstalledNpmPackage, inspectInstalledNpmPackageResolution } from "@red-cup-engineering/inspect-installed-npm-package-service";
import { projectJsnodeOperationPackage } from "./project-jsnode-operation-package.mjs";
import { publishStagedDirectoryAtAbsentPath } from "@red-cup-engineering/computer-file-engineering-services-section/publish-staged-directory-at-absent-path";
import { stageTextFileCreationProjections } from "./stage-text-file-creation-projections.mjs";
import { admitTextFileCreationProjectionSet } from "@red-cup-engineering/computer-file-engineering-services-section/admit-text-file-creation-projection-set";
import { validateJsonSchema } from "@red-cup-engineering/json-schema-services-section/validation";
import { sha256Digest, sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

// The house npm scopes routed to the canonical registry (~/.npmrc's own @scope:registry lines); every other package name (a bare "rrule", say) is third-party and must resolve from npm's own default registry (npmjs), per house working discipline's "third-party packages resolve from npmjs; house scopes must resolve from the canonical registry".
const HOUSE_NPM_SCOPES = ["@561-group", "@causeway-services", "@coesite-operations", "@emsenn", "@lenticule-science", "@red-cup-engineering"];

/**
 * Builds the npm environment overrides that pin every house scope to the given registry without touching npm's default registry, so third-party unscoped dependencies still resolve from npmjs.
 * @param {string} registry An absolute registry URL.
 * @returns {object} A record of `npm_config_@<scope>:registry` environment entries, one per house scope.
 */
function houseScopeRegistryEnvironment(registry) {
  return Object.fromEntries(HOUSE_NPM_SCOPES.map((scope) => [`npm_config_${scope}:registry`, registry]));
}

class CreationRefusal extends Error {
  constructor(code, message, refusedPath = null) {
    super(message);
    this.code = code;
    this.refusedPath = refusedPath;
  }
}

function refuse(code, message, refusedPath = null) {
  throw new CreationRefusal(code, message, refusedPath);
}

async function exists(candidate) {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function processEnvironment(additions = {}) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([name, value]) => name !== "NODE_TEST_CONTEXT" && typeof value === "string")),
    ...additions,
  };
}

function requireSuccessfulCommand(receipt, code, message) {
  if (receipt.result.status !== 0 || receipt.result.error || receipt.result.signal) refuse(code, `${message}: ${receipt.result.stderr || receipt.result.stdout || receipt.result.error}`, receipt.request.directory);
  return receipt.result;
}

function commandRequest({ command, arguments: args, directory, environment, input = null }) {
  return admitJavascriptNodeCommandExecutionRequest({ type: "JavascriptNodeCommandExecutionRequest", version: 1, command, arguments: args, directory, environment, input });
}

function assay(name, details = {}) {
  return freezeJson({ type: "JsnodeOperationPackageAssay", version: 1, name, status: "passed", ...details });
}

function creationRefusal(error, phase) {
  if (error instanceof CreationRefusal) {
    return freezeJson({
      type: "JsnodeOperationPackageCreationRefusal",
      version: 1,
      phase,
      code: typeof error.code === "string" ? error.code : "CREATION_FAILED",
      message: error.message,
      path: error.refusedPath ?? null,
    });
  }
  return freezeJson({
    type: "JsnodeOperationPackageCreationRefusal",
    version: 1,
    phase,
    code: typeof error?.code === "string" ? error.code : "CREATION_FAILED",
    message: error?.message ?? String(error),
    path: null,
  });
}

/**
 * Creates one complete JSNode operation package only after its staged and clean-installed faces pass every assay.
 *
 * @summary Creates and assays one complete JSNode operation package.
 * @param {object} request A JsnodeOperationPackageCreationRequest containing destination, registry, and specification candidate.
 * @returns {Promise<object>} A JsnodeOperationPackageCreationReceipt or a phase-specific refusal record.
 */
export async function createJsnodeOperationPackage(request) {
  let phase = "request";
  let stage = null;
  let assayRoot = null;
  let installRoot = null;
  let npmCache = null;
  try {
    if (request === null || typeof request !== "object" || Array.isArray(request)) refuse("INVALID_REQUEST", "input must be a JsnodeOperationPackageCreationRequest");
    if (Object.keys(request).sort().join(",") !== "destination,registry,specification,type,version") {
      refuse("UNEXPECTED_FIELDS", "request must carry exactly destination, registry, specification, type, and version");
    }
    if (request.type !== "JsnodeOperationPackageCreationRequest" || request.version !== 1) refuse("INVALID_REQUEST", "request type and version must be JsnodeOperationPackageCreationRequest@1");
    if (typeof request.destination !== "string" || !isAbsoluteFilepath(request.destination) || path.resolve(request.destination) !== request.destination) {
      refuse("INVALID_DESTINATION", "destination must be an absolute normalized path");
    }
    const parentDirectory = path.dirname(request.destination);
    if (await realpath(parentDirectory) !== parentDirectory) refuse("INVALID_DESTINATION_PARENT", "destination parent must be canonical and free of symlink redirection", parentDirectory);
    if (await exists(request.destination)) refuse("DESTINATION_EXISTS", "destination already exists and will not be overwritten", request.destination);
    let registry;
    try {
      registry = new URL(request.registry).href;
    } catch {
      refuse("INVALID_REGISTRY", "registry must be an absolute URL");
    }
    if (!["http:", "https:"].includes(new URL(registry).protocol)) refuse("INVALID_REGISTRY", "registry must use HTTP or HTTPS");

    phase = "specification-admission";
    const specification = admitJsnodeOperationPackageSpecification(request.specification);
    if (specification.type !== "JsnodeOperationPackageSpecification") refuse(specification.code, specification.message, specification.path);
    if (specification.version === 2) {
      phase = "example-schema";
      for (const operation of specification.operations) for (const example of specification.examples.filter((candidate) => candidate.operation === operation.commandName)) {
        const inputValidation = validateJsonSchema(example.input, operation.arguments.inputSchema ?? true);
        if (!inputValidation.valid) refuse("EXAMPLE_INPUT_SCHEMA_MISMATCH", `${operation.path} example ${example.name} input: ${JSON.stringify(inputValidation.issues)}`, operation.path);
        const outputValidation = validateJsonSchema(example.output, operation.arguments.outputSchema ?? true);
        if (!outputValidation.valid) refuse("EXAMPLE_OUTPUT_SCHEMA_MISMATCH", `${operation.path} example ${example.name} output: ${JSON.stringify(outputValidation.issues)}`, operation.path);
      }
    }

    phase = "projection";
    const projected = projectJsnodeOperationPackage(specification);
    const projection = admitTextFileCreationProjectionSet({ type: "TextFileCreationProjectionSet", version: 1, files: projected.files, filesDigest: projected.filesDigest });
    if (projection.type !== "TextFileCreationProjectionSet") refuse(projection.code, projection.message, projection.path);

    phase = "staging";
    stage = await stageTextFileCreationProjections({
      type: "TextFileCreationStagingRequest",
      version: 1,
      parentDirectory,
      files: projection.files,
      filesDigest: projection.filesDigest,
    });
    if (stage.type !== "TextFileCreationStageRead") refuse(stage.code, stage.message, stage.path);

    assayRoot = await mkdtemp(path.join("/tmp", "jsnode-package-assay-"));
    installRoot = await mkdtemp(path.join("/tmp", "jsnode-package-install-"));
    npmCache = await mkdtemp(path.join("/tmp", "jsnode-package-npm-cache-"));
    const environment = processEnvironment({
      npm_config_cache: npmCache,
      ...houseScopeRegistryEnvironment(registry),
      npm_config_update_notifier: "false",
      npm_config_loglevel: "error",
      npm_config_workspaces: "false",
    });
    const assays = [];

    if (Object.keys({ ...specification.dependencies, ...specification.devDependencies }).length > 0) {
      phase = "dependency-installation";
      requireSuccessfulCommand(executeJavascriptNodeCommand(commandRequest({
        command: "npm",
        arguments: ["install", "--ignore-scripts", "--no-save", "--no-package-lock", "--no-audit", "--no-fund", "--workspaces=false"],
        directory: stage.stageDirectory,
        environment,
      })), "DEPENDENCY_INSTALLATION_FAILED", "staged dependency installation failed");
    }

    phase = "installed-dependency-identity";
    for (const [expectedName, expectedVersion] of Object.entries({ ...specification.dependencies, ...specification.devDependencies })) {
      const resolution = await inspectInstalledNpmPackageResolution({
        type: "InstalledNpmPackageInspectionRequest", version: 1, projectRoot: stage.stageDirectory,
        packageRoot: null, expectedName, expectedVersion,
        entry: { kind: "package" },
      });
      if (!resolution.conformant) refuse("INSTALLED_DEPENDENCY_IDENTITY_MISMATCH", JSON.stringify(resolution), stage.stageDirectory);
    }
    if (Object.keys({ ...specification.dependencies, ...specification.devDependencies }).length > 0) assays.push(assay("staged-dependency-installation"));

    phase = "syntax";
    requireSuccessfulCommand(executeJavascriptNodeCommand(commandRequest({
      command: "npm",
      arguments: ["run", "check", "--workspaces=false"],
      directory: stage.stageDirectory,
      environment,
    })), "SYNTAX_ASSAY_FAILED", "staged syntax assay failed");
    assays.push(assay("syntax"));

    phase = "tests";
    const testPaths = projection.files
      .map((file) => file.path)
      .filter((filePath) => filePath.startsWith("test/") && filePath.endsWith(".test.mjs"));
    const testReceipt = requireSuccessfulCommand(executeJavascriptNodeCommand(commandRequest({
      command: process.execPath,
      arguments: ["--test", ...testPaths],
      directory: stage.stageDirectory,
      environment,
    })), "TEST_ASSAY_FAILED", "staged behavioral and face-equivalence tests failed");
    assays.push(assay("tests", { paths: testPaths }));

    phase = "packing";
    const packed = await packNpmPackage({ type: "NpmPackagePackingRequest", version: 1, carrierDirectory: stage.stageDirectory, destinationDirectory: assayRoot });
    const tarballDigest = sha256Digest(await readFile(packed.artifactPath));
    assays.push(assay("pack", { filename: packed.filename, digest: tarballDigest }));

    phase = "clean-installation";
    await writeFile(path.join(installRoot, "package.json"), JSON.stringify({ private: true, type: "module" }, null, 2) + "\n", { flag: "wx" });
    requireSuccessfulCommand(executeJavascriptNodeCommand(commandRequest({
      command: "npm",
      arguments: ["install", "--ignore-scripts", "--no-package-lock", "--no-audit", "--no-fund", "--workspaces=false", packed.artifactPath],
      directory: installRoot,
      environment,
    })), "CLEAN_INSTALLATION_FAILED", "clean tarball installation failed");
    const installedPackage = path.join(installRoot, "node_modules", ...specification.packageName.split("/"));
    const inspection = await inspectInstalledNpmPackage({
      type: "InstalledNpmPackageInspectionRequest",
      version: 1,
      packageRoot: installedPackage,
      expectedName: specification.packageName,
      expectedVersion: specification.packageVersion,
      projectRoot: installRoot,
      entry: { kind: "package" },
    });
    if (inspection.defects.length > 0) refuse("INSTALLED_PACKAGE_DEFECTS", JSON.stringify(inspection.defects), installedPackage);
    assays.push(assay("clean-installation", {
      javascriptFiles: inspection.javascriptFileCount,
      reachableJavascriptFiles: inspection.reachableJavascriptFileCount,
    }));

    const operations = specification.operations;
    const examplesFor = (operation) => specification.examples.filter((example) => example.operation === operation.commandName);
    phase = "import-face";
    const importProgram = [
      "const module = await import(process.argv[1]);",
      "const operation = module[process.argv[3]];",
      "if (typeof operation !== 'function') throw new TypeError('installed export is not the admitted operation');",
      "const outputs = [];",
      "for (const input of JSON.parse(process.argv[2])) outputs.push(await operation(input));",
      "process.stdout.write(JSON.stringify(outputs) + '\\n');",
    ].join("");
    const importedByOperation = new Map();
    for (const operation of operations) {
      const examples = examplesFor(operation);
      const inputs = examples.map((example) => example.input);
      const expectedOutputs = examples.map((example) => example.output);
      const imported = requireSuccessfulCommand(executeJavascriptNodeCommand(commandRequest({
        command: process.execPath,
        arguments: ["--input-type=module", "--eval", importProgram, `${specification.packageName}/${operation.commandName}`, JSON.stringify(inputs), operation.exportName],
        directory: installRoot,
        environment,
      })), "IMPORT_FACE_ASSAY_FAILED", `installed import face failed for ${operation.path}`);
      const importedOutputs = parse(imported.stdout);
      if (serializeLines(importedOutputs) !== serializeLines(expectedOutputs)) refuse("IMPORT_FACE_OUTPUT_MISMATCH", `installed import outputs differ from admitted examples for ${operation.path}`, operation.path);
      importedByOperation.set(operation.commandName, importedOutputs);
    }
    assays.push(assay("import-face", { examples: specification.examples.length }));

    if (specification.app !== null) {
    phase = "command-face";
    // The catalog is a declaration, not a program: the installed code layer's runner executes it.
    const commandPath = path.join(installRoot, "node_modules", ".bin", "run-javascript-node-operation-module");
    const catalogModule = path.join(installedPackage, specification.app.path);
    for (const operation of operations) {
      const examples = examplesFor(operation);
      const inputs = examples.map((example) => example.input);
      const expectedOutputs = examples.map((example) => example.output);
      const commanded = requireSuccessfulCommand(executeJavascriptNodeCommand(commandRequest({
        command: commandPath, arguments: [catalogModule, operation.commandName], directory: installRoot, environment, input: serializeLines(inputs),
      })), "COMMAND_FACE_ASSAY_FAILED", `installed command face failed for ${operation.path}`);
      let commandedOutputs;
      try { commandedOutputs = parseLines(commanded.stdout); } catch (error) {
        refuse("COMMAND_FACE_OUTPUT_MISMATCH", `installed command stdout did not carry ${inputs.length} parseable JSON value(s): ${error.message}`, operation.path);
      }
      if (serializeLines(commandedOutputs) !== serializeLines(expectedOutputs)) refuse("COMMAND_FACE_OUTPUT_MISMATCH", `installed command outputs differ from admitted examples for ${operation.path}`, operation.path);
      if (serializeLines(commandedOutputs) !== serializeLines(importedByOperation.get(operation.commandName))) refuse("FACE_EQUIVALENCE_FAILED", `installed import and command faces disagree for ${operation.path}`, operation.path);
    }
    assays.push(assay("command-face", { examples: specification.examples.length }));

    phase = "help";
    const helped = requireSuccessfulCommand(executeJavascriptNodeCommand(commandRequest({
      command: commandPath,
      arguments: [catalogModule, "--help"],
      directory: installRoot,
      environment,
      input: "",
    })), "HELP_ASSAY_FAILED", "installed command help failed");
    for (const operation of operations) if (!helped.stdout.includes(operation.commandName)) {
      refuse("HELP_OUTPUT_MISMATCH", `installed command help does not carry subcommand ${operation.commandName}`, operation.path);
    }
    assays.push(assay("help"));
    }

    phase = "stage-restoration";
    await rm(path.join(stage.stageDirectory, "node_modules"), { recursive: true, force: true });
    await rm(path.join(stage.stageDirectory, "package-lock.json"), { recursive: true, force: true });

    phase = "receipt-admission";
    const creationReceipt = admitJsnodeOperationPackageCreationReceipt({
      type: "JsnodeOperationPackageCreationReceipt",
      version: 1,
      packageName: specification.packageName,
      packageVersion: specification.packageVersion,
      destination: request.destination,
      filesDigest: projection.filesDigest,
      files: stage.fileDigests,
      assays,
    });
    if (creationReceipt.type !== "JsnodeOperationPackageCreationReceipt") {
      refuse(creationReceipt.code, creationReceipt.message, creationReceipt.path);
    }

    phase = "publication";
    const materialization = await publishStagedDirectoryAtAbsentPath({
      type: "StagedDirectoryPublicationRequest",
      version: 1,
      stage,
      destination: request.destination,
    });
    if (materialization.type !== "TextFileCreationMaterializationReceipt") refuse(materialization.code, materialization.message, materialization.path);
    return creationReceipt;
  } catch (error) {
    return creationRefusal(error, phase);
  } finally {
    if (stage?.stageDirectory) await rm(stage.stageDirectory, { recursive: true, force: true });
    if (assayRoot) await rm(assayRoot, { recursive: true, force: true });
    if (installRoot) await rm(installRoot, { recursive: true, force: true });
    if (npmCache) await rm(npmCache, { recursive: true, force: true });
  }
}
