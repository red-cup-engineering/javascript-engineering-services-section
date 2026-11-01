import assert from "node:assert/strict";
import test from "node:test";
import { projectJsnodeOperationSourceFromArguments } from "../src/project-jsnode-operation-source-from-arguments.mjs";

const doubleValueArguments = {
  type: "JsnodeOperationArguments",
  version: 1,
  path: "scripts/double-value.mjs",
  exportName: "doubleValue",
  exportCount: 1,
  description: "Doubles a number.",
  params: [{ name: "value", type: "number", description: "The number to double." }],
  returns: { type: "number", description: "The doubled value." },
  throws: [],
  imports: [],
  hasMainGuard: true,
  readsStdin: true,
  writesStdout: true,
  bodyText:
    '/**\n * Doubles a number.\n * @param {number} value The number to double.\n * @returns {number} The doubled value.\n */\nexport function doubleValue(value) {\n  return value * 2;\n}',
  shebang: true,
  residue: [],
};

const expectedDoubleValueText = `/**
 * Doubles a number.
 * @param {number} value The number to double.
 * @returns {number} The doubled value.
 */
export function doubleValue(value) {
  return value * 2;
}

export const operation = Object.freeze({ name: "double-value", description: "Doubles a number.", operation: doubleValue });
`;

test("projects a no-import argument record into the canonical operation source", () => {
  const projection = projectJsnodeOperationSourceFromArguments(doubleValueArguments);
  assert.equal(projection.type, "JsnodeOperationSourceProjection");
  assert.equal(projection.version, 1);
  assert.equal(projection.path, "scripts/double-value.mjs");
  assert.equal(projection.text, expectedDoubleValueText);
  assert.deepEqual(projection.files, [{ path: "scripts/double-value.mjs", text: expectedDoubleValueText }]);
});

test("projects schema files under data/records/schema/ when the record carries inputSchema and outputSchema", () => {
  const record = {
    ...doubleValueArguments,
    inputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", title: "doubleValueInput", type: "number", description: "The number to double." },
    outputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", title: "doubleValueOutput", type: "number", description: "The doubled value." },
  };
  const projection = projectJsnodeOperationSourceFromArguments(record);
  const expectedText = `import operationInputSchema from "../data/records/schema/double-value.input.schema.json" with { type: "json" };
import operationOutputSchema from "../data/records/schema/double-value.output.schema.json" with { type: "json" };

` + expectedDoubleValueText.replace("operation: doubleValue })", "operation: doubleValue, inputSchema: operationInputSchema, outputSchema: operationOutputSchema })");
  assert.deepEqual(projection.files, [
    { path: "scripts/double-value.mjs", text: expectedText },
    {
      path: "data/records/schema/double-value.input.schema.json",
      text: '{"$schema":"https://json-schema.org/draft/2020-12/schema","description":"The number to double.","title":"doubleValueInput","type":"number"}\n',
    },
    {
      path: "data/records/schema/double-value.output.schema.json",
      text: '{"$schema":"https://json-schema.org/draft/2020-12/schema","description":"The doubled value.","title":"doubleValueOutput","type":"number"}\n',
    },
  ]);
});

test("projects only files array entry when inputSchema and outputSchema are null", () => {
  const projection = projectJsnodeOperationSourceFromArguments({ ...doubleValueArguments, inputSchema: null, outputSchema: null });
  assert.deepEqual(projection.files, [{ path: "scripts/double-value.mjs", text: expectedDoubleValueText }]);
});

test("preserves complete boolean and constrained JSON Schemas in command descriptors and sidecars", () => {
  const record = {
    ...doubleValueArguments,
    inputSchema: false,
    outputSchema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: { count: { type: "integer", minimum: 0 } },
      allOf: [{ $ref: "#/$defs/count" }],
      additionalProperties: false,
    },
  };
  const projection = projectJsnodeOperationSourceFromArguments(record);
  assert.match(projection.text, /inputSchema: operationInputSchema/u);
  assert.match(projection.text, /operationInputSchema from "\.\.\/data\/records\/schema\/double-value\.input\.schema\.json" with \{ type: "json" \}/u);
  assert.doesNotMatch(projection.text, /additionalProperties/u);
  assert.equal(projection.files[1].text, "false\n");
  assert.equal(projection.files[2].text, '{"$defs":{"count":{"minimum":0,"type":"integer"}},"$schema":"https://json-schema.org/draft/2020-12/schema","additionalProperties":false,"allOf":[{"$ref":"#/$defs/count"}]}\n');
});

test("projects schema file text in a fixed key order regardless of the incoming schema object's own key order", () => {
  const canonicalKeyOrderInputSchema = JSON.parse(
    '{"$schema":"https://json-schema.org/draft/2020-12/schema","description":"The number to double.","title":"doubleValueInput","type":"number"}',
  );
  const record = { ...doubleValueArguments, inputSchema: canonicalKeyOrderInputSchema, outputSchema: null };
  const projection = projectJsnodeOperationSourceFromArguments(record);
  assert.equal(
    projection.files[1].text,
    '{"$schema":"https://json-schema.org/draft/2020-12/schema","description":"The number to double.","title":"doubleValueInput","type":"number"}\n',
  );
});

test("is deterministic: the same arguments record projects to the same bytes twice", () => {
  const first = projectJsnodeOperationSourceFromArguments(doubleValueArguments);
  const second = projectJsnodeOperationSourceFromArguments(doubleValueArguments);
  assert.equal(first.text, second.text);
});

test("retains requested import evaluation order and imports no runtime", () => {
  const record = {
    ...doubleValueArguments,
    exportName: "example",
    bodyText: "/**\n * Example.\n */\nexport function example() {\n  return 1;\n}",
    imports: [
      { source: "lodash", names: ["chunk"] },
      { source: "@red-cup-engineering/json-services-section", names: ["parse"] },
      { source: "node:path", names: ["basename"] },
    ],
  };
  const projection = projectJsnodeOperationSourceFromArguments(record);
  const importLines = projection.text.split("\n").filter((line) => line.startsWith("import "));
  assert.deepEqual(importLines, [
    'import { chunk } from "lodash";',
    'import { parse } from "@red-cup-engineering/json-services-section";',
    'import { basename } from "node:path";',
  ]);
});

test("declares the operation without importing or calling a runtime, a shebang or a main guard", () => {
  const projection = projectJsnodeOperationSourceFromArguments(doubleValueArguments);
  assert.deepEqual(projection.text.split("\n").filter((line) => line.startsWith("import ")), []);
  assert.doesNotMatch(projection.text, /^#!|import\.meta\.main|runJavascriptNodeOperation|process\./mu);
  assert.equal(projection.text.split("\n").filter((line) => line.startsWith("export const ")).length, 1);
});

test("drops the runtime import the old guard called when nothing else uses it", () => {
  const imports = [{ source: "@red-cup-engineering/javascript-node-services-section/operation", names: ["runJavascriptNodeOperation"] }];
  assert.doesNotMatch(projectJsnodeOperationSourceFromArguments({ ...doubleValueArguments, imports }).text, /runJavascriptNodeOperation/u);
});

test("refuses a body that already exports an operation binding", () => {
  assert.throws(() => projectJsnodeOperationSourceFromArguments({ ...doubleValueArguments, exportName: "operation", bodyText: "export function operation() { return 1; }" }), /declaration collision/u);
});

test("delegates async operation invocation to the shared runtime", () => {
  const record = { ...doubleValueArguments, exportName: "waitOne", isAsync: true, bodyText: "/**\n * Waits.\n */\nexport async function waitOne() {\n  return 1;\n}" };
  const projection = projectJsnodeOperationSourceFromArguments(record);
  assert.match(projection.text, /operation: waitOne/u);
  const inferred = projectJsnodeOperationSourceFromArguments({ ...record, isAsync: undefined });
  assert.equal(inferred.text, projection.text);
});

test("refuses a record missing exportName, bodyText, or description", () => {
  assert.throws(
    () => projectJsnodeOperationSourceFromArguments({ ...doubleValueArguments, exportName: null }),
    /exportName is required/u,
  );
  assert.throws(
    () => projectJsnodeOperationSourceFromArguments({ ...doubleValueArguments, bodyText: null }),
    /bodyText is required/u,
  );
  assert.throws(
    () => projectJsnodeOperationSourceFromArguments({ ...doubleValueArguments, description: null }),
    /description is required/u,
  );
});

test("observed top-level residue is refused rather than dropped", () => {
  assert.throws(() => projectJsnodeOperationSourceFromArguments({
    path: "scripts/x.mjs", exportName: "x", description: "Echo.", bodyText: "export function x(v) { return v; }",
    mainGuardText: null, residueStatements: ['console.log("startup");'],
  }), /unrepresented top-level/u);
});

test("import attributes survive explicit migration to the canonical declaration", () => {
  const output = projectJsnodeOperationSourceFromArguments({
    path: "scripts/x.mjs", exportName: "x", description: "Read.", bodyText: "export function x() { return data; }",
    mainGuardText: null, shebangText: null, imports: [{ text: 'import data from "./data.json" with { type: "json" };' }],
  });
  assert.match(output.text, /with \{ type: "json" \}/u);
  assert.match(output.text, /export const operation = Object\.freeze/u);
  assert.doesNotMatch(output.text, /import\.meta\.main/u);
});

test("refuses a reserved schema binding collision", () => {
  assert.throws(() => projectJsnodeOperationSourceFromArguments({
    ...doubleValueArguments,
    inputSchema: false,
    imports: [{ source: "example", names: ["operationInputSchema"] }],
  }), /canonical command import binding collision: operationInputSchema/u);
});

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { runJavascriptNodeOperationModule } from "@red-cup-engineering/javascript-node-services-section/operation";

test("canonical migration keeps alias meaning and import effects while the code layer runs the declaration", async (t) => {
  const directory = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), ".migration-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(join(directory, "z.mjs"), 'globalThis.order = ["z"];');
  writeFileSync(join(directory, "a.mjs"), 'globalThis.order.push("a"); export const parse = value => ({ order: globalThis.order, value });');
  const bodyText = 'export function example(value) { return decode(value); }';
  const mainGuardText = 'if (import.meta.main) { process.stdout.write("old"); process.exitCode = 7; } else { globalThis.oldImported = true; }';
  const imports = [
    { source: "./z.mjs", names: [], text: 'import "./z.mjs";' },
    { source: "./a.mjs", names: ["decode"], bindings: [{ imported: "parse", local: "decode" }], text: 'import { parse as decode } from "./a.mjs";' },
  ];
  const original = imports.map((entry) => entry.text).join("\n") + "\n" + bodyText + "\n" + mainGuardText;
  const script = join(directory, "example.mjs");
  const run = (input) => spawnSync(process.execPath, [script], { input, encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT")) });
  writeFileSync(script, original);
  const before = run("");
  assert.equal(before.status, 7);
  assert.equal(before.stdout, "old");
  const projection = projectJsnodeOperationSourceFromArguments({ path: "scripts/example.mjs", exportName: "example", description: "Echo.", bodyText, imports, mainGuardText });
  assert.equal(projection.interfaceChanged, true);
  writeFileSync(script, projection.text);
  // A declaration is not a process: importing it runs nothing; the code layer's runner executes it.
  const streams = (input) => { const out = { text: "" }; return { out, streams: { arguments: [], standardInput: Readable.from([input]), standardOutput: { write(text, done) { out.text += text; done?.(); return true; } }, standardError: { write(text, done) { done?.(); return true; } } } }; };
  const imported = spawnSync(process.execPath, [script], { input: "", encoding: "utf8", env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== "NODE_TEST_CONTEXT")) });
  assert.equal(imported.status, 0);
  assert.equal(imported.stdout, "");
  const module = await import(pathToFileURL(script).href);
  const ran = streams('{"answer":42}' + String.fromCharCode(10));
  assert.equal((await runJavascriptNodeOperationModule(module, ran.streams)).exitCode, 0);
  assert.deepEqual(JSON.parse(ran.out.text), { order: ["z", "a"], value: { answer: 42 } });
  const bad = streams("invalid" + String.fromCharCode(10));
  assert.equal((await runJavascriptNodeOperationModule(module, bad.streams)).exitCode, 2);
  assert.equal(JSON.parse(bad.out.text).ok, false);
});
