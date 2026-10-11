import assert from "node:assert/strict";
import test from "node:test";
import { transformJsonSchemaToTypescript } from "../src/transform-json-schema-to-typescript.mjs";

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

test("transforms unions, tuples, and named local definitions", () => {
  const source = transformJsonSchemaToTypescript({
    type: "object",
    $defs: { Tag: { enum: ["left", "right"] } },
    properties: {
      tag: { $ref: "#/$defs/Tag" },
      pair: { type: "array", items: [{ type: "string" }, { type: "null" }] },
      value: { oneOf: [{ type: "boolean" }, { type: "number" }] },
    },
  }, { typeName: "Envelope" });
  assert.equal(source, 'export type Tag = "left" | "right";\nexport type Envelope = { readonly "tag"?: Tag; readonly "pair"?: readonly [string, null]; readonly "value"?: boolean | number; };\n');
});

test("refuses non-schema inputs and unsafe TypeScript names", () => {
  assert.throws(() => transformJsonSchemaToTypescript(null), /schema must/u);
  assert.throws(() => transformJsonSchemaToTypescript({}, { typeName: "not-a-name" }), /valid TypeScript identifier/u);
  assert.throws(() => transformJsonSchemaToTypescript({ $defs: { "not-a-name": {} } }), /\$defs key/u);
});
