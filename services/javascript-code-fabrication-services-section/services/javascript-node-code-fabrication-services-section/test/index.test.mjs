import assert from "node:assert/strict";
import test from "node:test";
import { renderJsonSchemaModule, transformJsonSchemaToTypescript } from "../scripts/transform-json-schema-to-typescript.mjs";

test("transforms object properties, required keys, and literals", () => {
  const source = transformJsonSchemaToTypescript({
    title: "Message",
    type: "object",
    required: ["kind", "body"],
    properties: {
      kind: { const: "message" },
      body: { type: "string" },
      attempts: { type: "integer" },
    },
  });
  assert.equal(source, 'export type Message = { readonly "kind": "message"; readonly "body": string; readonly "attempts"?: number; };\n');
});

test("transforms unions, Draft 7 and 2020-12 tuples, and named local definitions", () => {
  const source = transformJsonSchemaToTypescript({
    type: "object",
    $defs: { Tag: { enum: ["left", "right"] } },
    properties: {
      tag: { $ref: "#/$defs/Tag" },
      legacyClosed: { type: "array", items: [{ type: "string" }, { type: "null" }], additionalItems: false, minItems: 2 },
      optionalClosed: { type: "array", prefixItems: [{ type: "string" }, { type: "null" }], items: false, minItems: 1 },
      openTail: { type: "array", prefixItems: [{ type: "string" }, { type: "null" }], items: { type: "boolean" }, minItems: 2 },
      value: { oneOf: [{ type: "boolean" }, { type: "number" }] },
    },
  }, { typeName: "Envelope" });
  assert.equal(source, 'export type Tag = "left" | "right";\nexport type Envelope = { readonly "tag"?: Tag; readonly "legacyClosed"?: readonly [string, null]; readonly "optionalClosed"?: readonly [string, null?]; readonly "openTail"?: readonly [string, null, ...boolean[]]; readonly "value"?: boolean | number; };\n');
});

test("emits optional prefix and union tail tuples", () => {
  const declaration = transformJsonSchemaToTypescript({
    title: "Envelope",
    type: "object",
    required: ["optional", "open"],
    properties: {
      optional: { type: "array", prefixItems: [{ type: ["string", "number"] }, { type: "null" }, { type: "boolean" }], items: false, minItems: 0 },
      open: { type: "array", prefixItems: [{ type: "string" }], items: { type: ["boolean", "number"] }, minItems: 1 },
    },
  });
  assert.equal(declaration, 'export type Envelope = { readonly "optional": readonly [(string | number)?, null?, boolean?]; readonly "open": readonly [string, ...(boolean | number)[]]; };\n');
});

test("refuses non-schema inputs and unsafe TypeScript names", () => {
  assert.throws(() => transformJsonSchemaToTypescript(null), /schema must/u);
  assert.throws(() => transformJsonSchemaToTypescript({}, { typeName: "not-a-name" }), /TypeScript\/JavaScript identifier/u);
  const nonAlias = transformJsonSchemaToTypescript({ type: "object", $defs: {
    "not-a-name": { type: "string" },
  }, properties: { mark: { $ref: "#/$defs/not-a-name" } } });
  assert.match(nonAlias, /"mark"\?: string/u);
  assert.doesNotMatch(nonAlias, /export type not-a-name/u);
});

test("emits intersections and homogeneous arrays with correct precedence", () => {
  const source = transformJsonSchemaToTypescript({ type: "array", items: { allOf: [{ type: "string" }, { enum: ["a", "b"] }] } });
  assert.equal(source, 'export type Schema = readonly ((unknown) & (string) & ("a" | "b"))[];\n');
});

test("renders stable schema declarations alongside their source schemas", () => {
  const source = renderJsonSchemaModule([
    { exportName: "zSchema", typeName: "Z", schema: { title: "Z", type: "string" } },
    { exportName: "aSchema", typeName: "A", schema: { title: "A", type: "number" } },
  ]);
  assert.equal(source, `/** Generated from specifications/*.schema.json. Do not edit. */
export type A = number;

export const aSchema = Object.freeze({
  "title": "A",
  "type": "number"
} as const);

export type Z = string;

export const zSchema = Object.freeze({
  "title": "Z",
  "type": "string"
} as const);
`);
});

test("renders declared runtime bindings from emitted schema values", () => {
  const source = renderJsonSchemaModule([
    { exportName: "evidenceSchema", typeName: "Evidence", runtimeName: "evidenceType", schema: { $id: "evidence.schema.json", title: "Evidence", type: "object" } },
    { exportName: "receiptSchema", typeName: "Receipt", runtimeName: "receiptType", schema: { title: "Receipt", type: "object", properties: { evidence: { $ref: "evidence.schema.json" } } } },
  ], { runtimeBinding: { name: "defineSchemaType", from: "../schema-type.mjs" } });
  assert.match(source, /import \{ defineSchemaType \} from "\.\.\/schema-type\.mjs";/u);
  assert.match(source, /export const evidenceType = defineSchemaType\(evidenceSchema\);/u);
  assert.match(source, /export const receiptType = defineSchemaType\(receiptSchema, \[evidenceSchema\]\);/u);
});

test("closes transitive runtime schema references before declaring a type", () => {
  const source = renderJsonSchemaModule([
    { exportName: "cSchema", typeName: "C", schema: { $id: "https://schemas.example/sub/c.schema.json", title: "C", type: "string" } },
    { exportName: "aSchema", typeName: "A", runtimeName: "aType", schema: { $id: "https://schemas.example/a.schema.json", title: "A", $ref: "sub/b.schema.json" } },
    { exportName: "bSchema", typeName: "B", schema: { $id: "https://schemas.example/sub/b.schema.json", title: "B", $ref: "c.schema.json" } },
  ], { runtimeBinding: { name: "defineSchemaType", from: "../schema-type.mjs" } });
  assert.match(source, /export type A = B;/u);
  assert.match(source, /export type B = C;/u);
  assert.match(source, /export const aType = defineSchemaType\(aSchema, \[bSchema, cSchema\]\);/u);
});

test("does not interpret example data as a schema reference", () => {
  const source = renderJsonSchemaModule([
    { exportName: "aSchema", typeName: "A", runtimeName: "aType", schema: { $id: "https://schemas.example/a.schema.json", title: "A", examples: [{ $ref: "b.schema.json" }], type: "string" } },
    { exportName: "bSchema", typeName: "B", schema: { $id: "https://schemas.example/b.schema.json", title: "B", type: "string" } },
  ], { runtimeBinding: { name: "defineSchemaType", from: "../schema-type.mjs" } });
  assert.match(source, /export const aType = defineSchemaType\(aSchema\);/u);
});


test("generates native ESM and matching declarations from shared carrier schemas", async () => {
  const entries = [
    { exportName: "refSchema", typeName: "Ref", schema: { $id: "https://test.example/ref", title: "Ref", description: "Typed reference", type: "object", required: ["id"], properties: { id: { type: "string", minLength: 1 } }, additionalProperties: false } },
    { exportName: "recordSchema", typeName: "Record", runtimeName: "recordType", schema: { $id: "https://test.example/record", title: "Record", description: "Record with a shared reference", type: "object", required: ["ref"], properties: { ref: { $ref: "https://test.example/ref" } }, additionalProperties: false } },
  ];
  const runtimeBinding = { name: "defineSchemaType", from: new URL("../../../../../../../../../../computer-data-engineering-services-section/apps/computer-data-engine/src/schema-type.mjs", import.meta.url).href, genericSchema: true };
  const javascript = renderJsonSchemaModule(entries, { format: "javascript", runtimeBinding });
  const generated = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
  const { admit } = await import(new URL("../../../../../../../../../../computer-data-engineering-services-section/apps/computer-data-engine/src/type-system.mjs", import.meta.url));
  assert.equal(admit(generated.recordType, { ref: { id: "retained" } }).ok, true);
  assert.equal(admit(generated.recordType, { ref: { id: "" } }).ok, false);
  assert.equal(admit(generated.recordType, { ref: { id: "retained", unrelated: true } }).ok, false);
  const declarations = renderJsonSchemaModule(entries, { format: "declaration", runtimeBinding });
  assert.match(declarations, /export type Record = .*"ref": Ref/);
  assert.match(declarations, /export declare const recordType: ReturnType<typeof defineSchemaType<typeof recordSchema>>;/);
  assert.doesNotMatch(javascript, /export type| as const/);
  assert.throws(() => renderJsonSchemaModule(entries, { format: "unsupported" }), /format must/);
});

test("fabricates proof-motion types through nested local JSON pointers", () => {
  const schema = {
    $id: "https://schemas.561.group/math/proof-motion.json",
    type: "object",
    required: ["stages", "edges"],
    properties: {
      stages: { type: "array", items: { type: "integer" } },
      edges: { type: "array", items: { type: "object",
        required: ["parent", "child"],
        properties: {
          parent: { $ref: "#/properties/stages/items" },
          child: { $ref: "#/properties/stages/items" },
        },
      } },
    },
  };
  const projected = transformJsonSchemaToTypescript(schema, { typeName: "ProofMotion" });
  assert.equal(projected, 'export type ProofMotion = { readonly "stages": readonly number[]; readonly "edges": readonly { readonly "parent": number; readonly "child": number; }[]; };\n');
  assert.doesNotMatch(projected, /"parent": unknown|"child": unknown/u);
});

test("JSON Pointer projection traverses tuple indices and escaped and percent-encoded keys", () => {
  const schema = {
    type: "object",
    $defs: {
      "edge/evidence": { type: "string" },
      "charge~four": { type: "number" },
    },
    properties: {
      tuple: { type: "array", prefixItems: [{ type: "boolean" }, { type: "integer" }], minItems: 2, items: false },
      first: { $ref: "#/properties/tuple/prefixItems/0" },
      escaped: { $ref: "#/$defs/edge~1evidence" },
      charge: { $ref: "#/$defs/charge~0four" },
      percent: { $ref: "#/%24defs/edge~1evidence" },
    },
  };
  const projected = transformJsonSchemaToTypescript(schema, { typeName: "MotionCell" });
  for (const [field, kind] of [
    ['"first"?: boolean;', "tuple index"], ['"escaped"?: string;', "slash token"],
    ['"charge"?: number;', "tilde token"], ['"percent"?: string;', "percent encoding"],
  ]) assert.ok(projected.includes(field), kind + ": " + projected);
});

test("relative references into a separately supplied schema retain nested types", () => {
  const entries = [
    { exportName: "motionSchema", typeName: "Motion", schema: {
      $id: "https://schemas.561.group/motion/root.json", type: "object",
      properties: { rank: { $ref: "values.json#/$defs/Rank" } },
    }},
    { exportName: "valuesSchema", typeName: "Values", schema: {
      $id: "https://schemas.561.group/motion/values.json",
      $defs: { Rank: { type: "integer" } }, type: "object",
    }},
  ];
  const text = renderJsonSchemaModule(entries);
  assert.match(text, /export type Motion = \{ readonly "rank"\?: number; \}/u);
});

test("nullable structured carriers retain their constrained fields", () => {
  const schema = { type: ["object", "null"], required: ["side"],
    properties: { side: { enum: ["for", "against"] } } };
  const text = transformJsonSchemaToTypescript(schema, { typeName: "SignedCell" });
  assert.equal(text, 'export type SignedCell = { readonly "side": "for" | "against"; } | null;\n');
});

test("impossible finite tuple lower bounds generate never", () => {
  const impossible = [
    { type: "array", prefixItems: [{ type: "string" }], minItems: 2, items: false },
    { type: "array", items: false, minItems: 1 },
    { type: "array", items: [{ type: "string" }], additionalItems: false, minItems: 2 },
  ];
  for (const schema of impossible)
    assert.equal(transformJsonSchemaToTypescript(schema, { typeName: "Impossible" }), "export type Impossible = never;\n");
});

test("named recursive proof cells stay expressible; anonymous cycles explicitly refuse", () => {
  const named = transformJsonSchemaToTypescript({
    type: "object",
    $defs: { Node: { type: "object", properties: {
      next: { $ref: "#/$defs/Node" },
    } } },
    properties: { root: { $ref: "#/$defs/Node" } },
  }, { typeName: "Graph" });
  assert.match(named, /export type Node = \{ readonly "next"\?: Node; \};/u);
  assert.match(named, /"root"\?: Node/u);
  const anonymous = { type: "object", properties: { loop: { $ref: "#" } } };
  assert.throws(() => transformJsonSchemaToTypescript(anonymous, { typeName: "Cyclic" }), /recursive schema reference/);
});

test("native generated JavaScript retains the exact math carrier schema", async () => {
  const schema = {
    $id: "https://schemas.561.group/motion-event", type: "object",
    required: ["cell", "side"],
    properties: { cell: { type: "string" }, side: { enum: ["for", "against"] },
      parentIndices: { type: "array", items: { type: "integer" } } },
  };
  const javascript = renderJsonSchemaModule([{ exportName: "eventSchema", typeName: "Event", schema }],
    { format: "javascript" });
  const generated = await import("data:text/javascript;base64," + Buffer.from(javascript).toString("base64"));
  assert.deepEqual(generated.eventSchema, schema);
  assert.match(transformJsonSchemaToTypescript(schema, { typeName: "Event" }),
    /"parentIndices"\?: readonly number\[\]/u);
});

test("generated code refuses runtime import injection and reserved symbols", () => {
  const entries = [{ exportName:"evidenceSchema", typeName:"Evidence", schema:{ type:"object" } }];
  for (const name of ["x }; import 'attacker'; //", "default", "class", "with-hyphen", "read\nme"]) {
    assert.throws(() => renderJsonSchemaModule(entries, {
      format:"javascript", runtimeBinding:{ name, from:"./schemas.mjs" }
    }), /identifier/u);
  }
  for (const entry of [
    { ...entries[0], exportName:"function" },
    { ...entries[0], typeName:"interface" },
    { ...entries[0], runtimeName:"await" },
  ]) {
    assert.throws(() => renderJsonSchemaModule([entry], {
      format:"javascript", runtimeBinding:{ name:"schemaFrom", from:"./schemas.mjs" }
    }), /identifier/u);
  }
});

test("generated value/type bindings cannot collide across independent schema entries", () => {
  const a = { exportName:"aSchema", typeName:"A", runtimeName:"aType", schema:{type:"number"} };
  const b = { exportName:"bSchema", typeName:"B", runtimeName:"bType", schema:{type:"string"} };
  const runtimeBinding={name:"schemaFrom",from:"./schemas.mjs"};
  assert.throws(() => renderJsonSchemaModule([a, { ...b, exportName:"aType" }],
    {runtimeBinding}), /duplicate generated JavaScript binding/u);
  assert.throws(() => renderJsonSchemaModule([a, { ...b, typeName:"A" }],
    {runtimeBinding}), /duplicate generated TypeScript type/u);
  assert.throws(() => renderJsonSchemaModule([a, { ...b, runtimeName:"schemaFrom" }],
    {runtimeBinding}), /duplicate generated JavaScript binding/u);
  assert.throws(() => renderJsonSchemaModule([a, { ...b, schema:{
    type:"object",$defs:{ A:{ type:"number" } }
  }}], {runtimeBinding}), /duplicate generated TypeScript type/u);
});
