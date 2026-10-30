/**
 * @packageDocumentation
 *
 * apps/infograph/operations/realization — package self-reads: canonical form, schema realization,
 * and operation-object introspection.
 */
import { tm, type Tm } from "@red-cup-engineering/relation-model-notation";
import { operation, type Operation } from "../../../rpc/index.mts";
import type { ProgramObject } from "../../../rpc/index.mts";
import { isClosed, termSize, termUses } from "@red-cup-engineering/relation-model-notation-typing";
import { isJsonValue, type JsonRecord, type JsonValue } from "../../../lib/codecs/json/core.mts";
import { generateDeclaration } from "../../../lib/codecs/typescript/index.mts";
import { schemaFrom, type SchemaContract } from "../../../lib/schema/contract.mts";

const inspectionReportContract = schemaFrom({
  $id: "metroplat.program.inspection",
  type: "object",
  required: ["kind", "verb", "hasRunTerm"],
  properties: {
    kind: { const: "metroplat.program.inspection" },
    verb: { type: "string", minLength: 1 },
    hasRunTerm: { type: "boolean" },
    domain: { type: "string" },
    codomain: { type: "string" },
    termClosed: { type: "boolean" },
    termSize: { type: "number" },
    termUses: { type: "array", items: { type: "string" } },
  },
  title: "ProgramInspection",
  description: "RMN inspection report for a program schema.",
  additionalProperties: false,
} as const);

const jsonValueSchema = {
  $id: "metroplat/formats/json/value",
  title: "JsonValue",
  description: "Any finite JSON value admitted by the package JSON boundary.",
  anyOf: [
    { type: "null" },
    { type: "boolean" },
    { type: "number" },
    { type: "string" },
    { type: "array", items: { $ref: "#" } },
    { type: "object", additionalProperties: { $ref: "#" } },
  ],
} as const;

const jsonValueContract: SchemaContract<JsonValue> = Object.freeze({
  kind: "metroplat.schema-contract" as const,
  id: jsonValueSchema.$id,
  schema: jsonValueSchema as unknown as JsonRecord & { readonly $id: typeof jsonValueSchema.$id },
  references: Object.freeze([]),
  validate: (value: unknown): value is JsonValue => isJsonValue(value),
  assert: (value: unknown, context: string = jsonValueSchema.$id): JsonValue => {
    if (isJsonValue(value)) return value;
    throw new TypeError(`${context}: not a JSON value`);
  },
  errors: (value: unknown): readonly string[] => isJsonValue(value) ? Object.freeze([]) : Object.freeze(["/ not a JSON value"]),
});

/** canonicalize — a JSON value to its canonical form: the identity endomorphism
 *  on the JSON wire, witnessing idempotence and representation-independence. */
export const canonicalizeOperation: Operation = operation({
  verb: "canonicalize",
  inputFormat: "json",
  outputFormat: "json",
  summary: "Re-encode a JSON value in canonical form (identity on the JSON wire).",
  domain: jsonValueContract,
  codomain: jsonValueContract,
  runTerm: tm.lam(tm.var(0)),
});

/** realize — the forgetful functor as a boundary operation: a JSON Schema in,
 *  its TypeScript declaration out. `--name` sets the root type name. */
export const realizeOperation: Operation = operation({
  verb: "realize",
  inputFormat: "json",
  outputFormat: "string",
  options: ["name"],
  summary: "Generate a TypeScript declaration from a JSON Schema (realize: Sub(J) → StructuralTypes).",
  description: "Domain: a JSON Schema document. Codomain: TypeScript declaration text; refinements are forgotten and remain the schema's runtime law.",
  run: (input: unknown, args: Record<string, unknown>): unknown => {
    const name = typeof args["name"] === "string" ? args["name"] : "Root";
    return generateDeclaration(input as JsonValue, name);
  },
});

/** inspect — boundary introspection over a operation object.
 *
 *  Input: the JSON produced by `programObject(operation)`. Output: an inspection
 *  report. This deliberately remains an untyped boundary operation until RMN grows
 *  structural metadata primitives for `isClosed`, `termSize`, and `termUses`.
 */
export const inspectOperation: Operation = operation({
  verb: "inspect",
  inputFormat: "json",
  outputFormat: "json",
  summary: "Inspect a operation object: report its domain, codomain, and RMN body structure.",
  description: "Boundary introspection: input is a ProgramObject JSON (the output of programObject()). Output is an ProgramInspection report. This is not yet an IR operation because term metadata reads are host-level.",
  codomain: inspectionReportContract,
  run: (input: unknown): unknown => {
    const mc = input as ProgramObject;
    const report: Record<string, JsonValue> = {
      kind: "metroplat.program.inspection",
      verb: mc.verb,
      hasRunTerm: mc.runTerm !== undefined,
    };
    if (mc.domain !== undefined) report["domain"] = mc.domain;
    if (mc.codomain !== undefined) report["codomain"] = mc.codomain;
    if (mc.runTerm !== undefined) {
      try {
        const t = mc.runTerm as Tm;
        report["termClosed"] = isClosed(t);
        report["termSize"] = termSize(t);
        report["termUses"] = [...termUses(t)] as JsonValue;
      } catch {
        // runTerm present but structurally malformed — report hasRunTerm only
      }
    }
    return report;
  },
});

/** The realization module's operation family. */
export const realizationOperations: readonly Operation[] = Object.freeze([
  canonicalizeOperation,
  realizeOperation,
  inspectOperation,
]);
