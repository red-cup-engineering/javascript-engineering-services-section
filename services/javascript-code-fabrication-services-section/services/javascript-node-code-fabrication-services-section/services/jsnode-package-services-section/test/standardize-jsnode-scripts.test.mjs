import assert from "node:assert/strict";
import { test } from "node:test";
import {
  argumentsPassReadsStdin,
  argumentsMigrationEqual,
  argumentsRoundTripEqual,
  hasEligibleDirectNdjsonGuard,
  importKey,
  importsEqualAsSets,
  matchesReadoutCandidatePredicate,
  pendingFileWrites,
  projectDeclarationManifest,
  schemaContractsEqual,
  stripLeadingJsDoc,
} from "../apps/standardize-jsnode-scripts.mjs";

const RULE_PREDICATE = { exportCount: 1, descriptionPresent: true, residueEmpty: true, hasMainGuard: true, readsStdin: true };

test("matchesReadoutCandidatePredicate admits exactly the rule's shape", () => {
  const readoutRow = { exportCount: 1, hasDescription: true, residue: 0, hasMainGuard: true };
  assert.equal(matchesReadoutCandidatePredicate(readoutRow, RULE_PREDICATE), true);
});

test("matchesReadoutCandidatePredicate refuses more than one export", () => {
  const readoutRow = { exportCount: 2, hasDescription: true, residue: 0, hasMainGuard: true };
  assert.equal(matchesReadoutCandidatePredicate(readoutRow, RULE_PREDICATE), false);
});

test("matchesReadoutCandidatePredicate refuses a missing description", () => {
  const readoutRow = { exportCount: 1, hasDescription: false, residue: 0, hasMainGuard: true };
  assert.equal(matchesReadoutCandidatePredicate(readoutRow, RULE_PREDICATE), false);
});

test("matchesReadoutCandidatePredicate refuses non-empty residue", () => {
  const readoutRow = { exportCount: 1, hasDescription: true, residue: 3, hasMainGuard: true };
  assert.equal(matchesReadoutCandidatePredicate(readoutRow, RULE_PREDICATE), false);
});

test("matchesReadoutCandidatePredicate refuses a missing main guard", () => {
  const readoutRow = { exportCount: 1, hasDescription: true, residue: 0, hasMainGuard: false };
  assert.equal(matchesReadoutCandidatePredicate(readoutRow, RULE_PREDICATE), false);
});

test("argumentsPassReadsStdin reads the fresh-arguments half of the predicate", () => {
  assert.equal(argumentsPassReadsStdin({ readsStdin: true }, RULE_PREDICATE), true);
  assert.equal(argumentsPassReadsStdin({ readsStdin: false }, RULE_PREDICATE), false);
});

test("guard migration matches complete known templates and preserves unexpected effects", () => {
  const direct = "if (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"echo — Reads the module imports carried by one JavaScript text-file reading without resolving them.\\n\");\n  } else {\n    let text = \"\";\n    for await (const chunk of process.stdin) text += chunk;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length > 0) process.stdout.write(`${JSON.stringify(echo(JSON.parse(line)))}\\n`);\n    }\n  }\n}\n";
  const house = "if (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"echo — Admits one JSNode topic package specification.\\n\");\n  } else {\n    const { text } = await readJavascriptNodeStandardInputText({ type: \"JavascriptNodeStandardInputTextReadRequest\", version: 1 }, { standardInput: process.stdin });\n    const outputLines = [];\n    let refused = false;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length === 0) continue;\n      try {\n        const value = JSON.parse(line);\n        outputLines.push(JSON.stringify(echo(value)));\n      } catch (error) {\n        outputLines.push(JSON.stringify({ ok: false, refusal: { reason: error.name, message: error.message } }));\n        refused = true;\n      }\n    }\n    await writeJavascriptNodeStandardOutputText({ type: \"JavascriptNodeStandardOutputTextWriteRequest\", version: 1, text: outputLines.map((outputLine) => `${outputLine}\\n`).join(\"\") }, { standardOutput: process.stdout });\n    if (refused) process.exitCode = 2;\n  }\n}\n";
  for (const guard of [direct, house]) {
    assert.equal(hasEligibleDirectNdjsonGuard(guard, "echo"), true);
    for (const extra of ["globalThis.extraEffect();", "someState.changed = true;", "echo({});", "process.stdout.write('extra');"]) {
      const changed = guard.slice(0, guard.lastIndexOf("}")) + extra + "}";
      assert.equal(hasEligibleDirectNdjsonGuard(changed, "echo"), false);
    }
  }
  assert.equal(hasEligibleDirectNdjsonGuard('if (import.meta.main) { process.stdout.write(serializeLines(parseLines(text))); }', "echo"), false);
});

test("importKey ignores name-list order within one import", () => {
  const a = { source: "node:fs", names: ["readFileSync", "writeFileSync"] };
  const b = { source: "node:fs", names: ["writeFileSync", "readFileSync"] };
  assert.equal(importKey(a), importKey(b));
});

test("importsEqualAsSets ignores declaration order across imports", () => {
  const a = [{ source: "node:path" }, { source: "node:fs", names: ["readFileSync"] }];
  const b = [{ source: "node:fs", names: ["readFileSync"] }, { source: "node:path" }];
  assert.equal(importsEqualAsSets(a, b), true);
});

test("importsEqualAsSets refuses a changed import set", () => {
  const a = [{ source: "node:path" }];
  const b = [{ source: "node:fs" }];
  assert.equal(importsEqualAsSets(a, b), false);
});

test("stripLeadingJsDoc removes only the leading block comment", () => {
  const bodyText = "/**\n * old doc\n */\nexport function f() { return 1; }";
  assert.equal(stripLeadingJsDoc(bodyText), "export function f() { return 1; }");
});

test("argumentsRoundTripEqual accepts a reordered-imports, regenerated-JSDoc projection", () => {
  const original = {
    exportName: "f",
    exportCount: 1,
    isAsync: false,
    imports: [{ source: "node:path" }, { source: "node:fs", names: ["readFileSync"] }],
    bodyText: "/**\n * old doc\n */\nexport function f() { return 1; }",
    hasMainGuard: true,
    readsStdin: true,
  };
  const roundTrip = {
    exportName: "f",
    exportCount: 1,
    isAsync: false,
    imports: [{ source: "node:fs", names: ["readFileSync"] }, { source: "node:path" }],
    bodyText: "/**\n * new doc\n */\nexport function f() { return 1; }",
    hasMainGuard: true,
    readsStdin: true,
  };
  assert.equal(argumentsRoundTripEqual(original, roundTrip), true);
});

test("argumentsRoundTripEqual refuses a body text change beyond the leading JSDoc", () => {
  const original = { imports: [], bodyText: "export function f() { return 1; }" };
  const roundTrip = { imports: [], bodyText: "export function f() { return 2; }" };
  assert.equal(argumentsRoundTripEqual(original, roundTrip), false);
});

test("argumentsRoundTripEqual refuses a changed import set", () => {
  const original = { imports: [{ source: "node:path" }], bodyText: "export function f() {}" };
  const roundTrip = { imports: [{ source: "node:fs" }], bodyText: "export function f() {}" };
  assert.equal(argumentsRoundTripEqual(original, roundTrip), false);
});

test("pendingFileWrites is empty when every entry already matches disk", () => {
  const files = [
    { path: "scripts/f.mjs", text: "same" },
    { path: "data/records/schema/f.input.schema.json", text: "same-schema" },
  ];
  const existing = new Map([["scripts/f.mjs", "same"], ["data/records/schema/f.input.schema.json", "same-schema"]]);
  assert.deepEqual(pendingFileWrites(files, (path) => existing.get(path) ?? null), []);
});

test("pendingFileWrites yields a schema entry whose file is absent even when the script is canonical", () => {
  const files = [
    { path: "scripts/f.mjs", text: "same" },
    { path: "data/records/schema/f.input.schema.json", text: "new-schema" },
  ];
  const existing = new Map([["scripts/f.mjs", "same"]]);
  const pending = pendingFileWrites(files, (path) => existing.get(path) ?? null);
  assert.deepEqual(pending, [{ path: "data/records/schema/f.input.schema.json", text: "new-schema", existingText: null }]);
});

test("pendingFileWrites yields a schema entry whose file differs from disk", () => {
  const files = [{ path: "data/records/schema/f.output.schema.json", text: "new-schema" }];
  const existing = new Map([["data/records/schema/f.output.schema.json", "old-schema"]]);
  const pending = pendingFileWrites(files, (path) => existing.get(path) ?? null);
  assert.deepEqual(pending, [{ path: "data/records/schema/f.output.schema.json", text: "new-schema", existingText: "old-schema" }]);
});

test("pendingFileWrites includes the script entry when its projected text differs", () => {
  const files = [{ path: "scripts/f.mjs", text: "new" }];
  const existing = new Map([["scripts/f.mjs", "old"]]);
  const pending = pendingFileWrites(files, (path) => existing.get(path) ?? null);
  assert.deepEqual(pending, [{ path: "scripts/f.mjs", text: "new", existingText: "old" }]);
});

test("schemaContractsEqual preserves boolean schemas and every refinement", () => {
  const contract = { inputSchema: false, outputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", $defs: { name: { type: "string", minLength: 1 } }, allOf: [{ $ref: "#/$defs/name" }], additionalProperties: false } };
  assert.equal(schemaContractsEqual(contract, structuredClone(contract)), true);
  assert.equal(schemaContractsEqual(contract, { ...contract, outputSchema: { ...contract.outputSchema, additionalProperties: true } }), false);
});

test("projectDeclarationManifest ships schemas, drops the bin of a script that became a declaration and adds no runtime", () => {
  const manifest = JSON.parse(projectDeclarationManifest('{"name":"example","files":["scripts"],"bin":{"echo":"scripts/echo.mjs","other":"./scripts/other.mjs"},"devDependencies":{"x":"1.0.0"}}', "scripts/echo.mjs"));
  assert.deepEqual(manifest.bin, { other: "./scripts/other.mjs" });
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.devDependencies.x, "1.0.0");
  assert.deepEqual(manifest.files, ["scripts", "data/records/schema"]);
  assert.equal(Object.hasOwn(JSON.parse(projectDeclarationManifest('{"bin":{"echo":"scripts/echo.mjs"}}', "scripts/echo.mjs")), "bin"), false);
});

import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { standardizeJsnodeScripts } from "../apps/standardize-jsnode-scripts.mjs";

import { readJsnodeOperationArguments } from "@red-cup-engineering/javascript-node-services-section/syntax";
import { projectJsnodeOperationSourceFromArguments } from "../src/project-jsnode-operation-source-from-arguments.mjs";

const SAFE_PROJECTION = projectJsnodeOperationSourceFromArguments(readJsnodeOperationArguments({ path: "scripts/echo.mjs", text: `/**
 * Returns a value.
 * @param {string} value A value.
 * @returns {string} The value.
 */
export function echo(value) { return value; }

if (import.meta.main) {
  let stdin = "";
  for await (const chunk of process.stdin) stdin += chunk;
  process.stdout.write(echo(stdin));
}
` , inputSchema: { type: "string" }, outputSchema: { type: "string" } }));
const SAFE_SOURCE = [
  "/**",
  " * Returns a value.",
  " * @param {string} value A value.",
  " * @returns {string} The value.",
  " */",
  "export function echo(value) { return value; }",
  "",
  "if (import.meta.main) {",
  "  if (process.argv.includes(\"--help\")) {",
  "    process.stdout.write(\"echo — Returns a value.\\n\");",
  "  } else {",
  "    let text = \"\";",
  "    for await (const chunk of process.stdin) text += chunk;",
  "    for (const line of text.split(\"\\n\")) {",
  "      if (line.length > 0) process.stdout.write(`${JSON.stringify(echo(JSON.parse(line)))}\\n`);",
  "    }",
  "  }",
  "}",
  ""
].join("\n");
const SAFE_INPUT_SCHEMA = SAFE_PROJECTION.files.find((file) => file.path.endsWith(".input.schema.json")).text;
const SAFE_OUTPUT_SCHEMA = SAFE_PROJECTION.files.find((file) => file.path.endsWith(".output.schema.json")).text;

async function fixture(t, { source = SAFE_SOURCE, testText, inputSchemaText, outputSchemaText, manifestText = '{"type":"module"}' } = {}) {
  const root = await mkdtemp(join(tmpdir(), "standardizer-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"));
  if (testText) await symlink(new URL("../node_modules", import.meta.url).pathname, join(root, "node_modules"), "dir");
  await writeFile(join(root, "package.json"), manifestText);
  await writeFile(join(root, "scripts/echo.mjs"), source);
  if (testText && inputSchemaText === undefined) inputSchemaText = SAFE_INPUT_SCHEMA;
  if (testText && outputSchemaText === undefined) outputSchemaText = SAFE_OUTPUT_SCHEMA;
  if (inputSchemaText !== undefined || outputSchemaText !== undefined) await mkdir(join(root, "data/records/schema"), { recursive: true });
  if (inputSchemaText !== undefined) await writeFile(join(root, "data/records/schema/echo.input.schema.json"), inputSchemaText);
  if (outputSchemaText !== undefined) await writeFile(join(root, "data/records/schema/echo.output.schema.json"), outputSchemaText);
  const readoutPath = join(root, "readout.json");
  await writeFile(readoutPath, JSON.stringify({ scripts: [
    { file: "scripts/moved.mjs", exportCount: 1, hasDescription: true, residue: 0, hasMainGuard: true },
    { file: "scripts/echo.mjs", exportCount: 1, hasDescription: true, residue: 0, hasMainGuard: true },
  ] }));
  if (testText) {
    await mkdir(join(root, "test"));
    await writeFile(join(root, "test/echo.test.mjs"), testText);
  }
  return { root, readoutPath, tracePath: join(root, "trace.eavt") };
}

test("moved readout rows refuse individually and current unsafe source cannot write", async (t) => {
  const source = SAFE_SOURCE + "\nexport function extra() {}\n";
  const options = await fixture(t, { source });
  const result = await standardizeJsnodeScripts({ ...options, apply: true });
  assert.equal(result.candidates[0].gate, "source-missing");
  assert.equal(result.candidates[1].gate, "current-source-predicate-mismatch");
  assert.equal(await readFile(join(options.root, "scripts/echo.mjs"), "utf8"), source);
  assert.equal(result.rowsAppended, 0);
});

test("raw stdin echo guards remain refused because they are not line JSON command interfaces", async (t) => {
  const source = SAFE_SOURCE.replace("JSON.parse(line)", "line");
  const options = await fixture(t, { source, testText: 'import test from "node:test"; test("baseline", () => {});' });
  const result = await standardizeJsnodeScripts({ ...options, apply: true });
  assert.equal(result.candidates[1].gate, "main-guard-interface-not-direct-ndjson");
  assert.equal(await readFile(join(options.root, "scripts/echo.mjs"), "utf8"), source);
});

test("untestable packages cannot write a projected script or schemas", async (t) => {
  const options = await fixture(t);
  const result = await standardizeJsnodeScripts({ ...options, apply: true });
  assert.equal(result.candidates[1].gate, "tests-not-runnable");
  assert.equal(await readFile(join(options.root, "scripts/echo.mjs"), "utf8"), SAFE_SOURCE);
  await assert.rejects(access(join(options.root, "data/records/schema/echo.input.schema.json")));
});

test("live scoped discovery excludes test and dependency scripts and respects limit", async (t) => {
  const options = await fixture(t);
  for (const directory of ["node_modules/dependency", "test/fixture", "legacy/old"]) {
    await mkdir(join(options.root, directory, "scripts"), { recursive: true });
    await writeFile(join(options.root, directory, "package.json"), "{}");
    await writeFile(join(options.root, directory, "scripts/echo.mjs"), SAFE_SOURCE);
  }
  const result = await standardizeJsnodeScripts({ root: options.root, scope: ".", limit: 1 });
  assert.deepEqual(result.candidates.map((entry) => entry.file), ["scripts/echo.mjs"]);
  assert.equal(result.candidates[0].gate, "tests-not-runnable");
});

test("a failing baseline leaves every prior file untouched", async (t) => {
  const options = await fixture(t, { testText: 'import test from "node:test"; test("fails", () => { throw Error("baseline"); });' });
  const result = await standardizeJsnodeScripts({ ...options, apply: true });
  assert.equal(result.candidates[1].gate, "baseline-tests-failed");
  assert.equal(await readFile(join(options.root, "scripts/echo.mjs"), "utf8"), SAFE_SOURCE);
  assert.equal(await readFile(join(options.root, "data/records/schema/echo.input.schema.json"), "utf8"), SAFE_INPUT_SCHEMA);
});

test("a post-write test failure restores original source and schema absence", async (t) => {
  const testText = 'import test from "node:test"; import assert from "node:assert/strict"; import {readFileSync} from "node:fs"; test("manifest contract", () => assert.equal(readFileSync(new URL("../package.json", import.meta.url), "utf8"), ' + JSON.stringify('{"type":"module"}') + '));';
  const options = await fixture(t, { testText });
  const result = await standardizeJsnodeScripts({ ...options, apply: true });
  assert.equal(result.candidates[1].act, "restored");
  assert.equal(result.candidates[1].gate, "tests-regressed");
  assert.equal(await readFile(join(options.root, "scripts/echo.mjs"), "utf8"), SAFE_SOURCE);
  assert.equal(await readFile(join(options.root, "package.json"), "utf8"), '{"type":"module"}');
  assert.equal(await readFile(join(options.root, "data/records/schema/echo.input.schema.json"), "utf8"), SAFE_INPUT_SCHEMA);
});

test("successful behavior tests permit canonical writes and schemas", async (t) => {
  const options = await fixture(t, { testText: 'import test from "node:test"; import assert from "node:assert/strict"; import {echo} from "../scripts/echo.mjs"; test("echo preserves value", () => assert.equal(echo("value"), "value"));' });
  const result = await standardizeJsnodeScripts({ ...options, apply: true });
  assert.equal(result.candidates[1].act, "re-projected", result.candidates[1].gate);
  assert.match(result.candidates[1].gate, /tests-pass-before-and-after/u);
  await access(join(options.root, "data/records/schema/echo.input.schema.json"));
});

test("successful reprojection preserves authoritative schema sidecars and migrates the runtime manifest", async (t) => {
  const inputSchema = "false\n";
  const outputSchema = JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", $defs: { result: { type: "string", minLength: 3 } }, allOf: [{ $ref: "#/$defs/result" }], additionalProperties: false }) + "\n";
  const options = await fixture(t, {
    inputSchemaText: inputSchema,
    outputSchemaText: outputSchema,
    manifestText: '{"type":"module","dependencies":{"example":"1.0.0"}}',
    testText: 'import test from "node:test"; import assert from "node:assert/strict"; import {echo} from "../scripts/echo.mjs"; test("echo preserves value", () => assert.equal(echo("value"), "value"));',
  });
  const result = await standardizeJsnodeScripts({ ...options, apply: true });
  assert.equal(result.candidates[1].act, "re-projected", result.candidates[1].gate);
  assert.equal(result.candidates[1].schemaFilesWritten.every((path) => path.endsWith(".schema.json")), true);
  assert.equal(await readFile(join(options.root, "data/records/schema/echo.input.schema.json"), "utf8"), inputSchema);
  assert.deepEqual(JSON.parse(await readFile(join(options.root, "data/records/schema/echo.output.schema.json"), "utf8")), JSON.parse(outputSchema));
  const manifest = JSON.parse(await readFile(join(options.root, "package.json"), "utf8"));
  assert.deepEqual(manifest.dependencies, { example: "1.0.0" });
  const script = await readFile(join(options.root, "scripts/echo.mjs"), "utf8");
  assert.match(script, /^export const operation = Object\.freeze\(/mu);
  assert.doesNotMatch(script, /import\.meta\.main|#!\/usr\/bin\/env node|runJavascriptNodeOperation\b/u);
});

test("nested package fixture tests do not authorize writes in their parent", async (t) => {
  const options = await fixture(t);
  const nested = join(options.root, "test/fixture");
  await mkdir(nested, { recursive: true });
  await writeFile(join(nested, "package.json"), "{}");
  await writeFile(join(nested, "always.test.mjs"), 'import test from "node:test"; test("fixture", () => {});');
  const result = await standardizeJsnodeScripts({ ...options, apply: true });
  assert.equal(result.candidates[1].gate, "tests-not-runnable");
});

test("canonical interface migration preserves body meaning while changing the guard", () => {
  const original = { imports: [], bodyText: "export function f(x) { return x; }", mainGuardText: "old", readsStdin: false };
  const canonical = { ...original, mainGuardText: "canonical", readsStdin: true };
  assert.equal(argumentsMigrationEqual(original, canonical), true);
  assert.equal(argumentsRoundTripEqual(original, canonical), false);
  assert.equal(argumentsMigrationEqual(original, { ...canonical, bodyText: "export function f(x) { return 2; }" }), false);
});

test("canonical migration cannot reorder imports or change alias bindings", () => {
  const original = { imports: [{ source: "z", names: ["decode"], bindings: [{ imported: "parse", local: "decode" }] }, { source: "a", names: [] }], bodyText: "export function f(x) { return x; }" };
  assert.equal(argumentsMigrationEqual(original, { ...original, imports: [...original.imports].reverse() }), false);
  assert.equal(argumentsMigrationEqual(original, { ...original, imports: [{ source: "z", names: ["decode"], bindings: [{ imported: "other", local: "decode" }] }, original.imports[1]] }), false);
});
