#!/usr/bin/env node
// Composed standardization operator: migrates legacy import.meta.main scripts to the declaration form
// (an exported `operation` the code layer runs; no runtime import, no shebang, no bin) by re-projecting the scripts a JsnodeScriptReprojectionRule names
// as candidates, writing each candidate's canonical script text and its schema files under
// data/records/schema/, and appending the outcome as EAVT rows. Owns no law: predicate/gate policy
// is the rule record's; AST reading, projection, and EAVT primitives are the published operations composed here.
import { basename, dirname, relative, resolve } from "node:path";
// friction (missing-capability, delete-file-service): no house service restores a path to exact
// absence, so this one restore-on-gate-failure path unlinks a schema file this run created.
import { appendFile, readFile, unlink } from "node:fs/promises";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { constitute, decode, encode } from "@red-cup-engineering/eavt-services-section";
import { executeJavascriptNodeCommand } from "@red-cup-engineering/execute-javascript-node-command-service";
import { canonicalChecked } from "@red-cup-engineering/json-services-section";
import { makeNiUri } from "@red-cup-engineering/uri-services-section/ni-uri";
import { walkPosixPaths } from "@red-cup-engineering/computer-filepath-engineering-services-section/walk-posix-paths";
import { isDeadOperationRuntimeImport, projectJsnodeOperationSourceFromArguments } from "../src/project-jsnode-operation-source-from-arguments.mjs";
import { readJsnodeOperationArguments } from "@red-cup-engineering/javascript-node-services-section/syntax";
import { readTextFile } from "@red-cup-engineering/computer-file-engineering-services-section/read-text-file";
import { writeTextFile } from "@red-cup-engineering/computer-file-engineering-services-section/write-text-file";
import { parseJavaScript } from "@red-cup-engineering/javascript-node-services-section/javascript-parser";


// friction (term-engineering-services-section-node-import-migration, 2026-09-04): no house
// service converts a file:// URL to a filesystem path and walks an arbitrary ancestor count, so
// a pure node:path resolve over this file's own known depth performs that one ancestor join.
const APPS_DIRECTORY = new URL(".", import.meta.url).pathname;
export const DEFAULT_REPOSITORY_ROOT = resolve(APPS_DIRECTORY, "../../../../../../../../../../../../../../../../../../..");
const SECTION_ROOT = resolve(APPS_DIRECTORY, "..");
export const DEFAULT_RULE_PATH = resolve(SECTION_ROOT, "data/records/2026-09-04-jsnode-script-reprojection-rule.json");
export const DEFAULT_READOUT_PATH = resolve(DEFAULT_REPOSITORY_ROOT, "lib/emsenn/services/561-group/services/561-group-services-section/data/records/2026-09-04-jsnode-script-discovery-readout.json");
export const DEFAULT_TRACE_PATH = resolve(DEFAULT_REPOSITORY_ROOT, "lib/emsenn/services/561-group/services/561-group-services-section/data/logs/2026/09/04/standardization.eavt");

/**
 * The comparison key for one import declaration record, ignoring name-list order — an import is
 * the same import regardless of where it sits.
 * @param {{source?: string, default?: string, namespace?: string, names?: string[]}} [importRecord]
 * @returns {string} A stable JSON key for set comparison.
 */
export function importKey(importRecord = {}) {
  const { source = null, default: defaultName = null, namespace = null, names = [], ...rest } = importRecord;
  return JSON.stringify({ source, default: defaultName, namespace, names: [...names].sort(), ...rest });
}

/**
 * Whether two JsnodeOperationArguments.imports arrays name the same imports, compared as sets.
 * @param {object[]} [a]
 * @param {object[]} [b]
 * @returns {boolean}
 */
export function importsEqualAsSets(a = [], b = []) {
  const setA = new Set(a.map(importKey));
  const setB = new Set(b.map(importKey));
  if (setA.size !== setB.size) return false;
  for (const key of setA) if (!setB.has(key)) return false;
  return true;
}

/**
 * A function body's own leading JSDoc block stripped, so two bodyText values differing only in a
 * regenerated JSDoc comment still compare equal.
 * @param {string} [bodyText]
 * @returns {string}
 */
export function stripLeadingJsDoc(bodyText = "") {
  return bodyText.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/u, "").trim();
}

/**
 * The round-trip-identity gate: whether a JsnodeOperationArguments record read back from a
 * projection is the same arguments record that produced it (imports as a set, bodyText with its
 * own leading JSDoc stripped, every other field exact).
 * @param {object} original A JsnodeOperationArguments record read from the original source.
 * @param {object} roundTrip A JsnodeOperationArguments record read from the projected source.
 * @returns {boolean}
 */
export function argumentsRoundTripEqual(original, roundTrip) {
  if (Object.hasOwn(original, "mainGuardText")) {
    if (JSON.stringify(original.imports) !== JSON.stringify(roundTrip.imports)) return false;
  } else if (!importsEqualAsSets(original.imports, roundTrip.imports)) return false;
  if (stripLeadingJsDoc(original.bodyText) !== stripLeadingJsDoc(roundTrip.bodyText)) return false;
  const withoutVarying = ({ imports, bodyText, ...rest }) => rest;
  return JSON.stringify(withoutVarying(original)) === JSON.stringify(withoutVarying(roundTrip));
}

/**
 * @param {object} original
 * @param {object} canonical
 * @returns {boolean}
 */
export function argumentsMigrationEqual(original, canonical) {
  if (stripLeadingJsDoc(original.bodyText) !== stripLeadingJsDoc(canonical.bodyText)) return false;
  // The runtime import the old guard called does not survive into a declaration module.
  const live = original.imports.filter((record) => !isDeadOperationRuntimeImport(record, original.bodyText ?? ""));
  if (!live.every((record, index) => importKey(record) === importKey(canonical.imports[index]))) return false;
  const meaning = ({ imports, bodyText, mainGuardText, hasMainGuard, readsStdin, writesStdout, shebang, shebangText, ...rest }) => rest;
  return JSON.stringify(meaning(original)) === JSON.stringify(meaning(canonical));
}

/**
 * Whether one JsnodeScriptDiscoveryReadout row is a candidate under a rule's candidatePredicate,
 * checked against the four fields the readout itself carries (readsStdin is checked separately,
 * against a fresh reading of the file — see argumentsPassReadsStdin).
 * @param {{exportCount: number, hasDescription: boolean, residue: number, hasMainGuard: boolean}} row
 * @param {{exportCount: number, descriptionPresent: boolean, residueEmpty: boolean, hasMainGuard: boolean}} predicate
 * @returns {boolean}
 */
export function matchesReadoutCandidatePredicate(row, predicate) {
  return (
    row.exportCount === predicate.exportCount &&
    row.hasDescription === predicate.descriptionPresent &&
    (row.residue === 0) === predicate.residueEmpty &&
    row.hasMainGuard === predicate.hasMainGuard
  );
}

/**
 * The readsStdin half of the candidate predicate, checked against a freshly-read
 * JsnodeOperationArguments record.
 * @param {{readsStdin: boolean}} argumentsRecord
 * @param {{readsStdin: boolean}} predicate
 * @returns {boolean}
 */
export function argumentsPassReadsStdin(argumentsRecord, predicate) {
  return argumentsRecord.readsStdin === predicate.readsStdin;
}

/**
 * Recognizes only the legacy direct NDJSON guard that the shared operation runtime replaces:
 * a line is JSON-decoded, passed to the exported operation, and its result JSON-encoded.  Whole
 * stream adapters and locally-owned refusal/output protocols are distinct external interfaces and
 * must receive an explicit migration decision instead of being silently standardized.
 * @param {string} sourceText
 * @param {string} exportName
 * @returns {boolean}
 */
export function hasEligibleDirectNdjsonGuard(sourceText, exportName) {
  let program;
  try { program = parseJavaScript(sourceText); } catch { return false; }
  const guard = program.body.find(node => node.type === "IfStatement" && sourceText.slice(node.test.start, node.test.end) === "import.meta.main");
  return guard !== undefined && NDJSON_GUARD_SHAPES.has(JSON.stringify(guardShape(guard, exportName, sourceText)));
}

// Match complete syntax trees: extra writes, effects, branches, or assignments are not a known command template.
function guardShape(node, exportName, text, parent = null) {
  if (node.type === "AwaitExpression" && node.argument.type === "CallExpression" && node.argument.callee.type === "Identifier" && node.argument.callee.name === exportName) return guardShape(node.argument, exportName, text, node);
  if (node.type === "Identifier") return [node.type, node.name === exportName ? "operation" : node.name];
  if (node.type === "Literal" && (typeof node.value === "string" || typeof node.value === "number")) {
    const help = typeof node.value === "string" && parent?.type === "CallExpression" && text.slice(parent.callee.start, parent.callee.end) === "process.stdout.write";
    return [node.type, help ? "HELP" : String(node.value)];
  }
  if (node.type === "TemplateElement") return [node.type, node.value.cooked];
  const children = [];
  const scalars = ["operator", "prefix", "computed", "kind", "await", "optional"].filter((key) => key in node).map((key) => [key, node[key]]);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end") continue;
    const value = node[key];
    const items = Array.isArray(value) ? value : [value];
    for (const item of items) if (item && typeof item === "object" && typeof item.type === "string") children.push(guardShape(item, exportName, text, node));
  }
  return [node.type, scalars, ...children];
}
const NDJSON_GUARD_SHAPES = new Set([
  "if (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"readJavascriptFileImports — Reads the module imports carried by one JavaScript text-file reading without resolving them.\\n\");\n  } else {\n    let text = \"\";\n    for await (const chunk of process.stdin) text += chunk;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length > 0) process.stdout.write(`${JSON.stringify(readJavascriptFileImports(JSON.parse(line)))}\\n`);\n    }\n  }\n}\n",
  "if (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"admitJsnodeOperationPackageSpecification — Admits one JSNode topic package specification.\\n\");\n  } else {\n    const { text } = await readJavascriptNodeStandardInputText({ type: \"JavascriptNodeStandardInputTextReadRequest\", version: 1 }, { standardInput: process.stdin });\n    const outputLines = [];\n    let refused = false;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length === 0) continue;\n      try {\n        const value = JSON.parse(line);\n        outputLines.push(JSON.stringify(admitJsnodeOperationPackageSpecification(value)));\n      } catch (error) {\n        outputLines.push(JSON.stringify({ ok: false, refusal: { reason: error.name, message: error.message } }));\n        refused = true;\n      }\n    }\n    await writeJavascriptNodeStandardOutputText({ type: \"JavascriptNodeStandardOutputTextWriteRequest\", version: 1, text: outputLines.map((outputLine) => `${outputLine}\\n`).join(\"\") }, { standardOutput: process.stdout });\n    if (refused) process.exitCode = 2;\n  }\n}\n",
].map((text, index) => {
  const parsed = parseJavaScript(text);
  return JSON.stringify(guardShape(parsed.body[0], index === 0 ? "readJavascriptFileImports" : "admitJsnodeOperationPackageSpecification", text));
}));

/**
 * Which entries of a JsnodeOperationSourceProjection.files array (the script itself at index 0,
 * plus any input/output schema files) would actually change a package's files on disk, given each
 * entry's current text or null for an absent file. A script whose own text is already canonical
 * but whose schema files are absent or differ still yields those schema entries here.
 * @param {{path: string, text: string}[]} files A JsnodeOperationSourceProjection.files array.
 * @param {(relativePath: string) => (string | null)} existingTextOf Reads one entry's current text
 *   from its relative path, or null when the file does not exist.
 * @returns {{path: string, text: string, existingText: (string | null)}[]} The subset whose target
 *   text differs from what existingTextOf reports, in the input array's order.
 */
export function pendingFileWrites(files, existingTextOf) {
  return files
    .map((file) => ({ ...file, existingText: existingTextOf(file.path) }))
    .filter((file) => file.existingText !== file.text);
}

/**
 * Reads the two schema sidecars for one command as authoritative JSON Schema values.  An absent
 * sidecar leaves the JSDoc-derived schema in place; a present one, including the boolean false
 * schema, replaces it rather than discarding refinements the JSDoc reader cannot express.
 * @param {string} packageDirectory
 * @param {string} commandName
 * @returns {Promise<object>}
 */
async function authoritativeSchemaArguments(packageDirectory, commandName) {
  const argumentsPatch = {};
  for (const [field, suffix] of [["inputSchema", "input"], ["outputSchema", "output"]]) {
    const text = await readExistingTextOrNull(resolve(packageDirectory, `data/records/schema/${commandName}.${suffix}.schema.json`));
    if (text !== null) argumentsPatch[field] = JSON.parse(text);
  }
  return argumentsPatch;
}

/** @param {object} left @param {object} right @returns {boolean} */
export function schemaContractsEqual(left, right) {
  return ["inputSchema", "outputSchema"].every((field) => canonicalChecked(left[field] ?? null, `left ${field}`) === canonicalChecked(right[field] ?? null, `right ${field}`));
}

/**
 * Projects the package manifest for a script that has become a declaration: the schema directory
 * ships with the package, and a bin entry naming the script is dropped because a declaration is
 * not executable (the code layer's run-javascript-node-operation-module runs it). Declaration modules
 * import no runtime, so no runtime dependency is added. Every unrelated manifest field is preserved.
 * @param {string} text
 * @param {string} scriptRelativePath
 * @returns {string}
 */
export function projectDeclarationManifest(text, scriptRelativePath) {
  const manifest = JSON.parse(text);
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) throw new TypeError("package.json must contain a JSON object");
  const files = Array.isArray(manifest.files) && !manifest.files.includes("data/records/schema") ? [...manifest.files, "data/records/schema"] : manifest.files;
  const projected = { ...manifest, ...(Array.isArray(manifest.files) ? { files } : {}) };
  const normalize = (value) => String(value).replace(/^\.\//u, "");
  if (manifest.bin !== null && typeof manifest.bin === "object") {
    const bin = Object.fromEntries(Object.entries(manifest.bin).filter(([, target]) => normalize(target) !== scriptRelativePath));
    if (Object.keys(bin).length) projected.bin = bin; else delete projected.bin;
  } else if (typeof manifest.bin === "string" && normalize(manifest.bin) === scriptRelativePath) delete projected.bin;
  return `${JSON.stringify(projected, null, 2)}\n`;
}

/** @param {string} text @returns {string} An RFC 6920 ni: URI content digest of one UTF-8 text. */
function digestOfText(text) {
  return makeNiUri(Buffer.from(text, "utf8"));
}

/** @param {string} absoluteScriptPath @returns {string} The package directory above a scripts/<name>.mjs file. */
function packageDirectoryOf(absoluteScriptPath) {
  return dirname(dirname(absoluteScriptPath));
}

/** @param {string} packageDirectory @returns {Promise<string[]>} */
async function packageTests(packageDirectory) {
  const nestedPackages = [];
  const result = await walkPosixPaths({
    root: resolve(packageDirectory, "test"), missing: "empty", symlinks: "skip",
    excludes: ["node_modules", "legacy", ".git", "services"],
    inspectEntry: (entry) => { if (entry.name === "package.json" && entry.kind === "file") nestedPackages.push(dirname(entry.absolutePath)); },
    includeFile: (file) => /\.test\.[cm]?js$/u.test(file.name),
    paths: "absolute", result: "paths",
  });
  return result.files.filter((file) => !nestedPackages.some((directory) => !relative(directory, file).startsWith("..")));
}

/** @param {{command: string, arguments: string[], directory: string}} request @returns {Promise<object>} A JavascriptNodeCommandExecutionReceipt@1, no shell. */
function runCommand({ command, arguments: commandArguments, directory }) {
  return executeJavascriptNodeCommand({
    type: "JavascriptNodeCommandExecutionRequest",
    version: 1,
    command,
    arguments: commandArguments,
    directory,
    environment: Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== "NODE_TEST_CONTEXT")),
    input: null,
  });
}

/** @param {string} absolutePath @returns {Promise<string | null>} The file's text, or null when it does not exist. */
async function readExistingTextOrNull(absolutePath) {
  try {
    return (await readTextFile({ path: absolutePath })).text;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Restores one file this run wrote to its exact prior state: original text when it had one, or
 * removed entirely when this run created it (see the missing-capability friction above import).
 * @param {string} absolutePath
 * @param {string | null} existingText
 * @returns {Promise<void>}
 */
async function restoreWrittenFile(absolutePath, existingText) {
  if (existingText === null) await unlink(absolutePath);
  else await writeTextFile({ path: absolutePath, text: existingText });
}

/**
 * Current disk text for every projection.files entry, keyed by relative path (the script's own
 * text is already known; schema files are read from under the package root).
 * @param {{files: {path: string, text: string}[], scriptsRelativePath: string, originalText: string, packageDirectory: string}} args
 * @returns {Promise<Map<string, string | null>>}
 */
async function existingTextByRelativePath({ files, scriptsRelativePath, originalText, packageDirectory }) {
  const map = new Map([[scriptsRelativePath, originalText]]);
  for (const file of files) {
    if (file.path === scriptsRelativePath) continue;
    map.set(file.path, await readExistingTextOrNull(resolve(packageDirectory, file.path)));
  }
  return map;
}

/** @param {object} record @param {object} predicate @returns {boolean} */
function currentArgumentsMatch(record, predicate) {
  return matchesReadoutCandidatePredicate({
    exportCount: record.exportCount, hasDescription: Boolean(record.description),
    residue: record.residue.length, hasMainGuard: record.hasMainGuard,
  }, predicate) && argumentsPassReadsStdin(record, predicate);
}

/** @param {string} packageDirectory @param {string[]} tests @returns {Promise<{ok: boolean, status: number | null, diagnostics: string}>} */
async function checkPackageTests(packageDirectory, tests) {
  const receipt = await runCommand({
    command: process.execPath, arguments: ["--test", "--test-reporter=tap", ...tests], directory: packageDirectory,
  });
  const ok = receipt.result.status === 0 && !receipt.result.error && /^# tests [1-9][0-9]*$/mu.test(receipt.result.stdout);
  return { ok, status: receipt.result.status, diagnostics: ok ? "" : [receipt.result.stdout, receipt.result.stderr, receipt.result.error].filter(Boolean).join("\n").slice(-12000) };
}

/**
 * Reads the arguments record of a canonical declaration module: the exported operation
 * declaration is the module's runnable face, not top-level residue, so it is set aside first.
 * @param {string} text
 * @param {string} path
 * @returns {object}
 */
export function readDeclaredOperationArguments(text, path) {
  const face = parseJavaScript(text).body.find((statement) => statement.type === "ExportNamedDeclaration"
    && statement.declaration?.type === "VariableDeclaration"
    && statement.declaration.declarations.some((declarator) => declarator.id?.name === "operation"));
  return readJsnodeOperationArguments({ text: face ? text.slice(0, face.start) + text.slice(face.end) : text, path });
}

/**
 * @param {{absolutePath: string, predicate: object, apply: boolean}} request
 * @returns {Promise<object>}
 */
async function processCandidate({ absolutePath, predicate, apply }) {
  const originalText = await readExistingTextOrNull(absolutePath);
  const beforeDigest = originalText === null ? null : digestOfText(originalText);
  const outcome = (act, gate, extra = {}) => ({
    act, gate, beforeDigest, afterDigest: beforeDigest, schemaFilesWritten: [], ...extra,
  });
  if (originalText === null) return outcome("skipped", "source-missing");
  const scriptsRelativePath = "scripts/" + basename(absolutePath);
  const originalArguments = readJsnodeOperationArguments({ text: originalText, path: scriptsRelativePath });
  if (!currentArgumentsMatch(originalArguments, predicate)) return outcome("skipped", "current-source-predicate-mismatch");
  const packageDirectory = packageDirectoryOf(absolutePath);
  const commandName = basename(absolutePath, ".mjs");
  let preservedSchemas;
  try {
    preservedSchemas = await authoritativeSchemaArguments(packageDirectory, commandName);
  } catch (error) {
    return outcome("skipped", "schema-contract-unreadable: " + error.message);
  }
  const projectionArguments = { ...originalArguments, ...preservedSchemas };
  const projection = projectJsnodeOperationSourceFromArguments(projectionArguments);
  const projectedScript = projection.files.find((file) => file.path === scriptsRelativePath);
  const scriptHasSemanticChange = projectedScript?.text.trimEnd() !== originalText.trimEnd();
  if (scriptHasSemanticChange && !hasEligibleDirectNdjsonGuard(originalText, originalArguments.exportName)) {
    return outcome("skipped", "main-guard-interface-not-direct-ndjson");
  }
  const manifestPath = resolve(packageDirectory, "package.json");
  const manifestText = await readExistingTextOrNull(manifestPath);
  if (manifestText === null) return outcome("skipped", "package-manifest-missing");
  let manifestProjection;
  try {
    manifestProjection = projectDeclarationManifest(manifestText, scriptsRelativePath);
  } catch (error) {
    return outcome("skipped", "package-manifest-unreadable: " + error.message);
  }
  const projectedFiles = scriptHasSemanticChange ? projection.files : projection.files.map((file) => file.path === scriptsRelativePath ? { ...file, text: originalText } : file);
  const files = [...projectedFiles, { path: "package.json", text: manifestProjection }];
  const existingByPath = await existingTextByRelativePath({ files, scriptsRelativePath, originalText, packageDirectory });
  const pendingWrites = pendingFileWrites(projectedFiles, (path) => existingByPath.get(path) ?? null);
  const manifestWrite = manifestProjection === manifestText ? null : { path: "package.json", text: manifestProjection, existingText: manifestText };
  if (manifestWrite) pendingWrites.push(manifestWrite);
  if (!pendingWrites.length) return outcome("unchanged", "identity");
  const projectedSchemas = Object.fromEntries(projectedFiles
    .filter((file) => file.path.startsWith("data/records/schema/"))
    .map((file) => [file.path.endsWith(".input.schema.json") ? "inputSchema" : "outputSchema", JSON.parse(file.text)]));
  if (!schemaContractsEqual({ ...originalArguments, ...preservedSchemas }, { ...originalArguments, ...projectedSchemas })) {
    return outcome("skipped", "schema-contract-mismatch");
  }
  const scriptWrite = pendingWrites.find((write) => write.path === scriptsRelativePath);
  if (scriptWrite) {
    const canonicalArguments = readDeclaredOperationArguments(scriptWrite.text, scriptsRelativePath);
    const canonicalWithSchemas = { ...canonicalArguments, ...preservedSchemas };
    if (!argumentsMigrationEqual(projectionArguments, canonicalWithSchemas)) return outcome("skipped", "operation-meaning-mismatch");
    if (!schemaContractsEqual(projectionArguments, canonicalWithSchemas)) return outcome("skipped", "schema-contract-mismatch");
    if (projectJsnodeOperationSourceFromArguments(canonicalWithSchemas).text !== scriptWrite.text) return outcome("skipped", "canonical-projection-not-idempotent");
  }
  const tests = await packageTests(packageDirectory);
  if (!tests.length) return outcome("skipped", "tests-not-runnable");
  if (!apply) return outcome("would-reproject", "canonical-interface-migration; tests-required-before-and-after", { pendingPaths: pendingWrites.map((file) => file.path) });
  const baseline = await checkPackageTests(packageDirectory, tests);
  if (!baseline.ok) return outcome("skipped", "baseline-tests-failed", { verification: baseline });
  if (await readExistingTextOrNull(absolutePath) !== originalText) return outcome("skipped", "source-changed-during-baseline");
  for (const write of pendingWrites) {
    if (await readExistingTextOrNull(resolve(packageDirectory, write.path)) !== write.existingText) return outcome("skipped", "source-changed-during-baseline");
  }
  const written = [];
  const restoreAll = async () => {
    for (const write of written.reverse()) await restoreWrittenFile(resolve(packageDirectory, write.path), write.existingText);
  };
  try {
    for (const write of pendingWrites) {
      written.push(write);
      await writeTextFile({ path: resolve(packageDirectory, write.path), text: write.text });
    }
    const syntax = await runCommand({ command: process.execPath, arguments: ["--check", absolutePath], directory: packageDirectory });
    if (syntax.result.status !== 0) {
      await restoreAll();
      return outcome("restored", "node-check-failed");
    }
    const verification = await checkPackageTests(packageDirectory, tests);
    if (!verification.ok) {
      await restoreAll();
      return outcome("restored", "tests-regressed", { verification });
    }
  } catch (error) {
    await restoreAll();
    return outcome("restored", "write-or-gate-failed: " + error.message);
  }
  return outcome("re-projected", "canonical-interface-migration;node-check-passed;tests-pass-before-and-after", {
    afterDigest: scriptWrite ? digestOfText(scriptWrite.text) : beforeDigest,
    schemaFilesWritten: pendingWrites.filter((write) => write.path.endsWith(".schema.json")).map((write) => write.path),
  });
}

/**
 * @param {string} root
 * @param {string} scope
 * @returns {Promise<object[]>}
 */
async function discoverScripts(root, scope) {
  const directory = resolve(root, scope);
  if (relative(resolve(root), directory).split("/").includes("..")) throw new TypeError("scope must stay within root");
  const result = await walkPosixPaths({
    root: directory, excludes: ["node_modules", "legacy", "test", "tests", ".git", "dist", "build", "data"],
    symlinks: "skip", extensions: [".mjs"],
    includeFile: (file) => basename(dirname(file.path)) === "scripts",
    paths: "absolute", result: "paths",
  });
  const scripts = [];
  for (const file of result.files) {
    if (await readExistingTextOrNull(resolve(packageDirectoryOf(file), "package.json")) !== null) scripts.push({ file: relative(root, file) });
  }
  return scripts;
}

/**
 * The one composed operation: standardizes the scripts a JsnodeScriptReprojectionRule names as
 * candidates in a JsnodeScriptDiscoveryReadout, appending one EAVT row per outcome fact to a
 * trace instead of a fresh JSON receipt. A dry run (apply: false) classifies every candidate and
 * appends nothing; apply: true additionally constitutes an entity per touched script (reusing one
 * already recorded under the same path) and appends its reprojected-by, before-digest,
 * after-digest, gate, and act rows.
 * @param {object} args
 * @param {string} [args.rulePath] Path to a JsnodeScriptReprojectionRule record.
 * @param {string} [args.readoutPath] Path to a JsnodeScriptDiscoveryReadout record.
 * @param {string} [args.root] Root for relative candidate paths.
 * @param {string} [args.scope] Live discovery directory under root, instead of a readout.
 * @param {number} [args.limit] Maximum scripts examined.
 * @param {string} [args.tracePath] Path to the EAVT trace file rows are appended to.
 * @param {boolean} [args.apply] Whether to write and append (true) or only classify (false, default).
 * @returns {Promise<object>} A run summary: rule identity, counts by outcome, and rows appended.
 * @throws {TypeError} If the rule or readout record does not parse as JSON.
 */
export async function standardizeJsnodeScripts({ rulePath = DEFAULT_RULE_PATH, readoutPath, root = DEFAULT_REPOSITORY_ROOT, scope, limit = Infinity, tracePath = DEFAULT_TRACE_PATH, apply = false } = {}) {
  const rule = JSON.parse((await readTextFile({ path: rulePath })).text);
  if (!Number.isSafeInteger(limit) && limit !== Infinity || limit < 1) throw new TypeError("limit must be a positive integer");
  if (scope !== undefined && readoutPath !== undefined) throw new TypeError("choose scope or readout");
  if (scope === undefined) readoutPath ??= DEFAULT_READOUT_PATH;
  const readout = scope === undefined ? JSON.parse((await readTextFile({ path: readoutPath })).text) : { scripts: await discoverScripts(root, scope) };

  let existingRows = [];
  try {
    existingRows = (await readFile(tracePath, "utf8")).split(/\r?\n/u).filter(Boolean).map(decode);
  } catch {
    existingRows = []; // absent trace: the first run against it
  }
  const entityAddressByPath = new Map();
  for (const row of existingRows) {
    if (row.a === "constituted" && row.v && typeof row.v.path === "string") entityAddressByPath.set(row.v.path, row.e);
  }

  const counts = { readoutCandidates: 0, unchanged: 0, reprojected: 0, restored: 0, skipped: 0 };
  const appendedRows = [];
  const candidates = [];
  const generatorId = rule.generator;

  for (const [index, row] of readout.scripts.entries()) {
    if (counts.readoutCandidates >= limit) break;
    counts.readoutCandidates += 1;
    const absolutePath = resolve(root, row.file);
    const t = index;
    let outcome;
    try {
      if (relative(resolve(root), absolutePath).split("/").includes("..")) throw new TypeError("candidate is outside root");
      outcome = await processCandidate({ absolutePath, predicate: rule.candidatePredicate, apply });
    } catch (error) {
      outcome = { act: "skipped", gate: "candidate-refused: " + error.message };
    }
    candidates.push({ file: row.file, ...outcome });
    if (outcome.act === "skipped") counts.skipped += 1;
    else if (outcome.act === "unchanged") counts.unchanged += 1;
    else if (["re-projected", "would-reproject"].includes(outcome.act)) counts.reprojected += 1;
    else if (outcome.act === "restored") counts.restored += 1;
    if (!apply || outcome.act === "skipped") continue;

    let entityAddress = entityAddressByPath.get(row.file);
    if (entityAddress === undefined) {
      const { address, genesis } = constitute({ kind: "jsnode-script", attributes: { path: row.file }, t: t });
      await appendFile(tracePath, `${encode(genesis)}\n`);
      appendedRows.push(genesis);
      entityAddressByPath.set(row.file, address);
      entityAddress = address;
    }

    const facts = [
      { e: entityAddress, a: "reprojected-by", v: generatorId, t },
      { e: entityAddress, a: "before-digest", v: outcome.beforeDigest, t },
      { e: entityAddress, a: "after-digest", v: outcome.afterDigest, t },
      { e: entityAddress, a: "gate", v: outcome.gate, t },
      { e: entityAddress, a: "act", v: outcome.act, t },
      ...(outcome.schemaFilesWritten ?? []).map((schemaFilePath) => ({ e: entityAddress, a: "schema-file", v: schemaFilePath, t })),
    ];
    for (const fact of facts) {
      await appendFile(tracePath, `${encode(fact)}\n`);
      appendedRows.push(fact);
    }
  }

  return {
    type: "JsnodeScriptStandardizationRunSummary",
    version: 1,
    rule: rulePath,
    readout: readoutPath,
    trace: tracePath,
    apply,
    counts,
    candidates,
    root,
    scope,
    rowsAppended: appendedRows.length,
    sampleRows: appendedRows.slice(0, 5),
  };
}

/** @param {string[]} argv @returns {{rulePath?: string, readoutPath?: string, tracePath?: string, root?: string, scope?: string, limit?: number, apply: boolean}} */
function parseArgs(argv) {
  const limitText = argument("--limit", argv);
  return {
    rulePath: argument("--rule", argv),
    readoutPath: argument("--readout", argv),
    tracePath: argument("--trace", argv),
    root: argument("--root", argv),
    scope: argument("--scope", argv),
    ...(limitText === undefined ? {} : { limit: Number(limitText) }),
    apply: argv.includes("--apply"),
  };
}

if (import.meta.main) {
  const summary = await standardizeJsnodeScripts(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}
