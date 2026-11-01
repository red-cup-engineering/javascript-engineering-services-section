#!/usr/bin/env node
import path from "node:path";
import { immutableJsonValue } from "../../../../../../../../../../../../computer-data-engineering-services-section/services/serialized-computer-data-engineering-services-section/services/json-services-section/src/index.mjs";
import { isJsonRecord, parse, parseLines, serializeLines } from "../../../../../../../../../../../../computer-data-engineering-services-section/services/serialized-computer-data-engineering-services-section/services/json-services-section/src/index.mjs";
import { admitNpmPackageVersion } from "@red-cup-engineering/npm-package-version-admission-service";
import { admitNpmPackageManifest } from "@red-cup-engineering/npm-package-manifest-admission-service";
import { readJavascriptFileExportDocumentation } from "@red-cup-engineering/read-javascript-file-export-documentation-service";
import { readJavascriptFileImports } from "@red-cup-engineering/read-javascript-file-imports-service";
import { readJavascriptFileMainGuards } from "@red-cup-engineering/read-javascript-file-main-guards-service";
import { admitTextFileCreationProjectionSet } from "@red-cup-engineering/text-file-creation-projection-set-admission-service";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

class ProjectionRefusal extends Error {
  constructor(code, message, refusedPath = null) {
    super(message);
    this.code = code;
    this.refusedPath = refusedPath;
  }
}

function refuse(code, message, refusedPath = null) {
  throw new ProjectionRefusal(code, message, refusedPath);
}

function exactVersion(value, context) {
  try {
    admitNpmPackageVersion(value);
  } catch {
    refuse("INVALID_EXACT_VERSION", `${context} must be an exact three-part numeric version`);
  }
  return value;
}

function packageFromSpecifier(specifier) {
  if (specifier.startsWith("node:")) return null;
  if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("file:")) return false;
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

function dependencyRecord(value, context) {
  if (!isJsonRecord(value)) refuse("INVALID_DEPENDENCIES", `${context} must be a JSON record`);
  for (const [name, version] of Object.entries(value)) exactVersion(version, `${context}.${name}`);
  return value;
}

function javascriptImports(file, refusalCode) {
  try {
    return readJavascriptFileImports({ type: "TextFileRead", path: file.path, text: file.text }).imports;
  } catch (error) {
    refuse(refusalCode, error.message, file.path);
  }
}

function operationImports(operation, manifest) {
  const imports = javascriptImports(operation, "INVALID_OPERATION_JAVASCRIPT");
  const used = new Set();
  for (const imported of imports) {
    const packageName = packageFromSpecifier(imported.specifier);
    if (packageName === false) refuse("RELATIVE_OPERATION_IMPORT", "one-operation packages must compose published package faces, not private source modules", operation.path);
    if (packageName !== null) used.add(packageName);
  }
  const declared = new Set(Object.keys(manifest.dependencies));
  for (const name of used) if (!declared.has(name)) refuse("UNDECLARED_RUNTIME_DEPENDENCY", `operation imports undeclared package ${name}`, operation.path);
  for (const name of declared) if (!used.has(name)) refuse("UNUSED_RUNTIME_DEPENDENCY", `manifest declares unused runtime package ${name}`, "package.json");
}

function testImports(tests, manifest, operationPath) {
  const usedExternal = new Set();
  for (const test of tests) {
    for (const imported of javascriptImports(test, "INVALID_TEST_JAVASCRIPT")) {
      const packageName = packageFromSpecifier(imported.specifier);
      if (packageName === false) {
        if (!imported.specifier.startsWith(".")) refuse("UNSAFE_TEST_IMPORT", "test imports must remain inside the projected package", test.path);
        const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(test.path), imported.specifier));
        if (resolved !== operationPath) refuse("UNPROJECTED_TEST_IMPORT", "test relative imports must address the projected operation file", test.path);
      }
      if (packageName !== null && packageName !== false) usedExternal.add(packageName);
    }
  }
  const available = new Set([...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)]);
  for (const name of usedExternal) if (!available.has(name)) refuse("UNDECLARED_TEST_DEPENDENCY", `tests import undeclared package ${name}`);
  for (const name of Object.keys(manifest.devDependencies)) {
    if (!usedExternal.has(name)) refuse("UNUSED_DEVELOPMENT_DEPENDENCY", `manifest declares unused development package ${name}`, "package.json");
  }
}

function admitProjection(value) {
  if (!isJsonRecord(value) || value.type !== "JsnodeOperationPackageProjection" || value.version !== 1) {
    refuse("INVALID_PROJECTION", "input must be a JsnodeOperationPackageProjection@1");
  }
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "files,filesDigest,packageName,packageVersion,type,version") {
    refuse("UNEXPECTED_FIELDS", "projection carries fields outside the JsnodeOperationPackageProjection@1 vocabulary");
  }
  if (typeof value.packageName !== "string" || value.packageName.length === 0) refuse("INVALID_PACKAGE_NAME", "packageName must be a nonempty string");
  exactVersion(value.packageVersion, "packageVersion");
  if (!Array.isArray(value.files) || value.files.length === 0) refuse("MISSING_FILES", "projection must contain package files");

  const fileSet = admitTextFileCreationProjectionSet({
    type: "TextFileCreationProjectionSet",
    version: 1,
    files: value.files,
    filesDigest: value.filesDigest,
  });
  if (fileSet.type !== "TextFileCreationProjectionSet") refuse(fileSet.code, fileSet.message, fileSet.path);
  const files = fileSet.files;
  for (const file of files) if (!file.text.endsWith("\n")) refuse("MISSING_FINAL_LINEFEED", "projected text files must end with a linefeed", file.path);

  const byPath = new Map(files.map((file) => [file.path, file]));
  const manifestFile = byPath.get("package.json");
  const readme = byPath.get("README.md");
  if (!manifestFile) refuse("MISSING_MANIFEST", "projection must contain package.json");
  if (!readme) refuse("MISSING_README", "projection must contain README.md");
  let manifest;
  try {
    manifest = admitNpmPackageManifest({ type: "NpmPackageManifestCandidate", version: 1, manifest: parse(manifestFile.text) }).manifest;
  } catch (error) {
    refuse("INVALID_MANIFEST", error.message, "package.json");
  }
  if (manifest.name !== value.packageName || manifest.version !== value.packageVersion) {
    refuse("MANIFEST_IDENTITY_MISMATCH", "manifest identity must equal projection identity", "package.json");
  }
  if (manifest.type !== "module" || manifest.private !== false) refuse("INVALID_MANIFEST_PUBLICATION", "manifest must describe a public ES module", "package.json");
  if (typeof manifest.exports !== "string" || !manifest.exports.startsWith("./")) refuse("INVALID_EXPORT", "manifest must carry one relative string export", "package.json");
  if (!isJsonRecord(manifest.bin) || Object.keys(manifest.bin).length !== 1) refuse("INVALID_BIN", "manifest must carry exactly one command", "package.json");
  const [[commandName, commandTarget]] = Object.entries(manifest.bin);
  const operationPath = manifest.exports.slice(2);
  if (commandTarget !== operationPath) refuse("SPLIT_OPERATION_FACES", "manifest export and command must address the same file in their npm-canonical spellings", "package.json");
  const operation = byPath.get(operationPath);
  if (!operation) refuse("MISSING_OPERATION", "manifest operation target is absent", operationPath);
  if (operation.mode !== 0o755 || !operation.text.startsWith("#!/usr/bin/env node\n")) {
    refuse("NONEXECUTABLE_OPERATION", "operation file must be mode 0o755 with the Node shebang", operationPath);
  }
  if (path.posix.basename(operationPath, ".mjs") !== commandName) refuse("COMMAND_PATH_MISMATCH", "command name must equal the operation filename", operationPath);

  let documentation;
  let mainGuards;
  try {
    documentation = readJavascriptFileExportDocumentation({ type: "TextFileRead", path: operationPath, text: operation.text });
    mainGuards = readJavascriptFileMainGuards({ type: "TextFileRead", path: operationPath, text: operation.text });
  } catch (error) {
    refuse("INVALID_OPERATION_JAVASCRIPT", error.message, operationPath);
  }
  if (documentation.length !== 1 || documentation[0].kind !== "function") refuse("OPERATION_EXPORT_COUNT", "operation file must export exactly one documented function", operationPath);
  if (documentation[0].description !== manifest.description) refuse("DESCRIPTION_MISMATCH", "manifest description must derive from operation JSDoc", "package.json");
  if (mainGuards.length !== 1) {
    refuse("MAIN_GUARD_COUNT", "operation file must contain exactly one real if (import.meta.main) guard", operationPath);
  }
  if (!readme.text.includes(documentation[0].description) || !readme.text.includes(commandName)) {
    refuse("HELP_MISMATCH", "README must carry the JSDoc description and command name", "README.md");
  }

  dependencyRecord(manifest.dependencies, "dependencies");
  dependencyRecord(manifest.devDependencies, "devDependencies");
  for (const name of Object.keys(manifest.dependencies)) {
    if (Object.hasOwn(manifest.devDependencies, name)) refuse("DUPLICATE_DEPENDENCY", `${name} occurs in dependencies and devDependencies`, "package.json");
  }
  operationImports(operation, manifest);

  const tests = files.filter((file) => file.path.startsWith("test/") && file.path.endsWith(".test.mjs"));
  if (tests.length < 2) refuse("MISSING_TESTS", "projection must contain authored tests and a generated face-equivalence test");
  if (!byPath.has(`test/${commandName}-faces.test.mjs`)) refuse("MISSING_FACE_TEST", "projection must contain the generated face-equivalence test");
  testImports(tests, manifest, operationPath);

  const allowed = new Set(["package.json", "README.md", operationPath, ...tests.map((test) => test.path)]);
  for (const file of files) {
    if (!allowed.has(file.path)) refuse("UNOWNED_PACKAGE_FILE", "one-operation package contains a file with no projected role", file.path);
    if (file.path !== operationPath && file.mode !== 0o644) refuse("INVALID_FILE_MODE", "non-operation package files must use mode 0o644", file.path);
  }
  if (manifest.scripts?.check !== `node --check ${operationPath}`) refuse("INVALID_CHECK_COMMAND", "manifest check command must address the operation file", "package.json");
  if (manifest.scripts?.test !== "node --test test/*.test.mjs") refuse("INVALID_TEST_COMMAND", "manifest test command must execute every projected test", "package.json");
  if (Object.hasOwn(manifest.scripts, "verify")) refuse("VERIFICATION_SCRIPT_LAYER", "manifest must not declare a verify script", "package.json");
  if (manifest.scripts?.["pack:dry-run"] !== "npm pack --dry-run --ignore-scripts") refuse("INVALID_PACK_COMMAND", "manifest pack dry-run must disable lifecycle scripts", "package.json");
  if (manifest.engines?.node !== ">=24.2.0") refuse("INVALID_NODE_ENGINE", "manifest must declare the admitted Node engine", "package.json");

  return immutableJsonValue({ ...value, files });
}

function refusalRecord(error) {
  if (error instanceof ProjectionRefusal) {
    return immutableJsonValue({
      type: "JsnodeOperationPackageProjectionRefusal",
      version: 1,
      code: error.code,
      message: error.message,
      path: error.refusedPath,
    });
  }
  throw error;
}

/**
 * Admits a complete JSNode operation package projection after pure read-only conformance checks.
 *
 * @summary Admits a conforming JSNode operation package projection.
 * @param {object} projection A candidate JsnodeOperationPackageProjection.
 * @returns {object} The immutable admitted projection or a specific refusal record.
 */
export function admitJsnodeOperationPackageProjection(projection) {
  try {
    return admitProjection(projection);
  } catch (error) {
    return refusalRecord(error);
  }
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "admit-jsnode-operation-package-projection", description: "Admits a complete JSNode operation package projection after pure read-only conformance checks.", operation: admitJsnodeOperationPackageProjection }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
