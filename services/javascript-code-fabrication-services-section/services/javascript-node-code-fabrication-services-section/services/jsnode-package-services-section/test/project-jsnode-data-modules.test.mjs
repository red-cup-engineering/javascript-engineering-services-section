import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { projectJsnodeDataModules } from "../src/project-jsnode-data-modules.mjs";
import { projectJsnodeModules, projectJsnodeModulePaths } from "../src/project-jsnode-modules.mjs";

// These cases are derived from the data-module contract, independently of its
// implementation. The receiving oracle imports the actual emitted ESM bytes.
const moduleAt = (value, schema = true, name = "RULES", output = "src/rules.mjs") => ({
  path: output,
  exports: [{ name, value, schema }],
});
const project = (dataModules, extra = {}) => projectJsnodeModules({ dataModules, operations: [], ...extra });

async function materialize(t, files) {
  const root = await mkdtemp(path.join(tmpdir(), "jsnode-data-assay-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const file of files) {
    const destination = path.join(root, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.text, { mode: file.mode });
  }
  return { root, load: (file) => import(pathToFileURL(path.join(root, file)).href) };
}

const ruleSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "array",
  minItems: 1,
  items: {
    type: "object", additionalProperties: false, required: ["id", "rate", "cost"],
    properties: {
      id: { type: "string", pattern: "^[a-z][a-z-]*$" },
      rate: { type: "integer", minimum: 1 },
      cost: { type: "integer", minimum: 1 },
    },
  },
};

test("source-free game rules become standalone ESM with exact, deeply immutable values", async (t) => {
  const input = [{ id: "pencil", rate: 1, cost: 10 }, { id: "press", rate: 7, cost: 90 }];
  const before = structuredClone(input);
  const files = project([moduleAt(input, ruleSchema)]);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, "src/rules.mjs");
  assert.equal(files[0].type, "TextFileCreationProjection");
  assert.equal(files[0].version, 1);
  assert.equal(files[0].mode, 0o644);
  assert.equal(typeof files[0].text, "string");
  assert.ok(Object.isFrozen(files));
  assert.deepEqual(input, before);
  assert.equal(Object.isFrozen(input), false, "projection must not freeze caller-owned values");
  const { load } = await materialize(t, files);
  const received = (await load("src/rules.mjs")).RULES;
  assert.deepEqual(received, input);
  assert.ok(Object.isFrozen(received));
  assert.ok(Object.isFrozen(received[0]));
  assert.throws(() => { received[0].rate = 99; }, TypeError);
  assert.throws(() => { received.push({ id: "other", rate: 99, cost: 1 }); }, TypeError);
  input[0].rate = 999;
  assert.equal(received[0].rate, 1);
});

test("canonical bytes ignore record-key and declaration ordering while preserving array order", () => {
  const first = [
    { path: "src/z.mjs", exports: [{ name: "Z", value: { z: 3, a: { y: 2, x: 1 } }, schema: true }, { name: "A", value: [3, 1, 2], schema: { type: "array" } }] },
    moduleAt("second", { type: "string" }, "VALUE", "src/a.mjs"),
  ];
  const second = [
    moduleAt("second", { type: "string" }, "VALUE", "src/a.mjs"),
    { path: "src/z.mjs", exports: [{ schema: { type: "array" }, value: [3, 1, 2], name: "A" }, { schema: true, value: { a: { x: 1, y: 2 }, z: 3 }, name: "Z" }] },
  ];
  assert.deepEqual(project(first), project(second));
  assert.deepEqual(projectJsnodeDataModules(first), projectJsnodeDataModules(second));
  assert.deepEqual(project(first).map(file => file.path), ["src/a.mjs", "src/z.mjs"]);
  const reorderedArray = structuredClone(second);
  reorderedArray[1].exports[0].value = [1, 2, 3];
  assert.notEqual(project(second)[1].text, project(reorderedArray)[1].text);
});

test("data text and prototype-like keys remain data when emitted modules execute", async (t) => {
  const value = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"escaped":true}},"prototype":"ordinary"}');
  value.text = "\"; globalThis.__dataProjectionInjected = true; //\n` ${process.exit(7)} \\ </script>\u2028\u2029";
  value.nested = [null, true, false, 12.5, "quote\"slash\\newline\n"];
  const before = globalThis.__dataProjectionInjected;
  const { load } = await materialize(t, project([moduleAt(value)]));
  const received = (await load("src/rules.mjs")).RULES;
  assert.deepEqual(received, value);
  assert.equal(Object.hasOwn(received, "__proto__"), true);
  assert.equal(Object.getPrototypeOf(received), Object.prototype);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(globalThis.__dataProjectionInjected, before);
  assert.ok(Object.isFrozen(received.__proto__));
  assert.ok(Object.isFrozen(received.constructor.prototype));
  assert.ok(Object.isFrozen(received.nested));
});

test("legal public export names cannot shadow the generated module's own machinery", async (t) => {
  const names = ["Object", "JSON", "freeze", "data", "__proto__", "$value", "_value"];
  const dataModules = [{ path: "src/names.mjs", exports: names.map((name, index) => ({ name, value: { index }, schema: { type: "object" } })) }];
  const { load } = await materialize(t, project(dataModules));
  const received = await load("src/names.mjs");
  for (let index = 0; index < names.length; index++) {
    assert.deepEqual(received[names[index]], { index });
    assert.ok(Object.isFrozen(received[names[index]]));
  }
});

test("schema admission rejects invalid data and invalid or unresolved schemas", () => {
  for (const value of [[], [{ id: "pencil", rate: 0, cost: 1 }], [{ id: "pencil", rate: 1.5, cost: 1 }], [{ id: "pencil", rate: 1, cost: 1, typo: 5 }]]) {
    assert.throws(() => project([moduleAt(value, ruleSchema)]));
    assert.throws(() => projectJsnodeDataModules([moduleAt(value, ruleSchema)]));
  }
  for (const schema of [false, { type: "invented-type" }, { $ref: "#/$defs/absent" }, { $ref: "https://example.invalid/unavailable-schema.json" }]) {
    assert.throws(() => project([moduleAt(1, schema)]));
  }
  assert.throws(() => project([{ path: "src/rules.mjs", exports: [{ name: "RULES", value: 1 }] }]));
  const localRef = { $defs: { count: { type: "integer", minimum: 1 } }, $ref: "#/$defs/count" };
  assert.equal(project([moduleAt(3, localRef)]).length, 1);
  assert.throws(() => project([moduleAt(0, localRef)]));
});

test("all lossy non-JSON values are refused instead of silently coercing", () => {
  class PretendRecord { constructor() { this.answer = 42; } }
  const sparse = new Array(2);
  sparse[1] = "present";
  const symbolKey = { visible: true };
  symbolKey[Symbol("hidden")] = 1;
  const nonEnumerable = { visible: true };
  Object.defineProperty(nonEnumerable, "hidden", { value: 1, enumerable: false });
  const cycle = { id: "cycle" };
  cycle.self = cycle;
  const invalid = [undefined, NaN, Infinity, -Infinity, 1n, () => 1, Symbol("value"), new Date(0), new Map(), new PretendRecord(), sparse, symbolKey, nonEnumerable, cycle, { nested: [undefined] }, { nested: { rate: Infinity } }];
  for (const value of invalid) {
    assert.throws(() => projectJsnodeDataModules([moduleAt(value)]));
    assert.throws(() => project([moduleAt(value)]));
  }
});

test("schema/value getters and toJSON hooks never execute during admission", () => {
  let reads = 0;
  const value = { id: "pencil" };
  Object.defineProperty(value, "rate", { enumerable: true, get() { reads++; return 1; } });
  const schema = {};
  Object.defineProperty(schema, "type", { enumerable: true, get() { reads++; return "object"; } });
  const customJSON = { toJSON() { reads++; return {}; } };
  for (const definition of [moduleAt(value, { type: "object" }), moduleAt({}, schema), moduleAt(customJSON)]) {
    assert.throws(() => projectJsnodeDataModules([definition]));
    assert.throws(() => project([definition]));
  }
  assert.equal(reads, 0);
});

test("scalar JSON and empty nested containers are received without inferred semantics", async (t) => {
  const values = [null, true, false, 0, 1.25, "", [], {}, { nested: [] }];
  const dataModules = [{ path: "src/values.mjs", exports: values.map((value, i) => ({ name: `VALUE_${i}`, value, schema: true })) }];
  const { load } = await materialize(t, project(dataModules));
  const received = await load("src/values.mjs");
  values.forEach((value, i) => assert.deepEqual(received[`VALUE_${i}`], value));
});

test("unsafe paths and nonbinding export names refuse before producing source", () => {
  for (const output of ["../escape.mjs", "/src/a.mjs", "src/../escape.mjs", "src//a.mjs", "src/./a.mjs", "src\\a.mjs", "src/a.js", "data/a.mjs"]) {
    assert.throws(() => project([moduleAt(1, true, "VALUE", output)]));
    assert.throws(() => projectJsnodeDataModules([moduleAt(1, true, "VALUE", output)]));
  }
  for (const name of ["", "not-a-binding", "1value", "value;export", "await", "class", "default", "for", "null", "let", "yield", "eval", "arguments"]) {
    assert.throws(() => project([moduleAt(1, true, name)]));
    assert.throws(() => projectJsnodeDataModules([moduleAt(1, true, name)]));
  }
});

test("module/export collisions and empty declarations refuse without partial projection", () => {
  const duplicateExport = { path: "src/rules.mjs", exports: [{ name: "RULES", value: 1, schema: true }, { name: "RULES", value: 2, schema: true }] };
  for (const dataModules of [[duplicateExport], [moduleAt(1), moduleAt(2)], [{ path: "src/empty.mjs", exports: [] }]]) {
    assert.throws(() => project(dataModules));
    assert.throws(() => projectJsnodeDataModules(dataModules));
  }
  assert.throws(() => projectJsnodeModules({ operations: [] }));
  assert.throws(() => projectJsnodeModules({ sources: [], dataModules: [], operations: [] }));
  const collision = { dataModules: [moduleAt(1)], sources: [{ path: "src/rules.mjs", text: "export const RULES = 2;\n" }], operations: [] };
  assert.throws(() => projectJsnodeModules(collision));
  assert.throws(() => projectJsnodeModulePaths(collision));
});

test("authored consumers import declared data through the original connected projector", async (t) => {
  const specification = {
    dataModules: [moduleAt([{ id: "pencil", rate: 1, cost: 10 }], ruleSchema)],
    sources: [{ path: "src/production.mjs", text: "import { RULES } from './rules.mjs';\nexport const production = (count) => RULES[0].rate * count;\n" }],
    operations: [{ name: "production", module: "src/production.mjs", exportName: "production", description: "Production from declared rules.", inputSchema: { type: "integer", minimum: 0 }, outputSchema: { type: "integer", minimum: 0 } }],
  };
  const files = projectJsnodeModules(specification);
  assert.deepEqual(projectJsnodeModulePaths(specification), files.map(file => file.path));
  assert.deepEqual(files.map(file => file.path), ["data/records/schema/production.input.schema.json", "data/records/schema/production.output.schema.json", "src/production.mjs", "src/rules.mjs"]);
  const { load } = await materialize(t, files);
  assert.equal((await load("src/production.mjs")).production(7), 7);
  assert.deepEqual(projectJsnodeModulePaths({ dataModules: specification.dataModules, operations: [] }), ["src/rules.mjs"]);
  assert.deepEqual(projectJsnodeModules({ sources: [{ path: "src/legacy.mjs", text: "export const legacy = 1;\n" }], operations: [] }).map(file => file.path), ["src/legacy.mjs"]);
});

test("a data export cannot be declared as a callable operation or a CLI operation", () => {
  const specification = { dataModules: [moduleAt(1)], operations: [{ name: "rules", module: "src/rules.mjs", exportName: "RULES", description: "Not a function." }] };
  assert.throws(() => projectJsnodeModules(specification));
  assert.throws(() => projectJsnodeModules({ ...specification, cli: { path: "apps/rules.mjs", name: "rules", description: "Not a callable catalog." } }));
  assert.throws(() => projectJsnodeModulePaths(specification));
});

test("a reference cannot bypass the closed profile by promoting annotation data into a schema", () => {
  for (const target of [{ minimun: 5 }, { minimum: "5" }, { format: "invented-format" }]) {
    const schema = { $ref: "#/default", default: target };
    assert.throws(() => projectJsnodeDataModules([moduleAt(0, schema)]));
    assert.throws(() => project([moduleAt(0, schema)]));
  }
  // Unreferenced annotations remain ordinary JSON data, including words that
  // would be unsupported or malformed if they occurred in a schema location.
  const annotation = { minimun: 5, minimum: "5", format: "invented-format" };
  assert.equal(project([moduleAt(0, { type: "number", default: annotation, examples: [annotation] })]).length, 1);
  assert.equal(project([moduleAt(annotation, { const: annotation })]).length, 1);
});

test("the closed profile refuses a dependency assertion its selected dialect would ignore", () => {
  for (const dialect of [undefined, "https://json-schema.org/draft/2020-12/schema"]) {
    const schema = { ...(dialect ? { $schema: dialect } : {}), type: "object", dependencies: { a: ["b"] } };
    assert.throws(() => projectJsnodeDataModules([moduleAt({ a: 1 }, schema)]));
  }
  const draft7 = { $schema: "http://json-schema.org/draft-07/schema#", type: "object", dependencies: { a: ["b"] } };
  assert.equal(project([moduleAt({ a: 1, b: 2 }, draft7)]).length, 1);
  assert.throws(() => project([moduleAt({ a: 1 }, draft7)]));
});

test("the original projector, helper and path plan use the same code-unit module order", () => {
  const dataModules = [moduleAt(1, true, "VALUE", "src/Z.mjs"), moduleAt(2, true, "VALUE", "src/a.mjs")];
  const specification = { dataModules, operations: [] };
  assert.deepEqual(projectJsnodeModules(specification), projectJsnodeDataModules(dataModules));
  assert.deepEqual(projectJsnodeModules(specification).map(file => file.path), projectJsnodeModulePaths(specification));
  assert.deepEqual(projectJsnodeModulePaths(specification), ["src/Z.mjs", "src/a.mjs"]);
});
