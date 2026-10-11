import { defineType } from "@red-cup-engineering/computer-data-engineering-services-section/type-system";

const established = (result) => {
  if (!result.ok) throw new TypeError(`deduplication type declaration refused: ${JSON.stringify(result.refusal)}`);
  return result.value;
};

const NI = { type: "string", pattern: "^ni:///sha-256;[A-Za-z0-9_-]+$" };

/** One executable behavior read from one file. Its `identity` is the content identity of its
 *  normalized callable form, so the semantic fingerprint and the identity are one value. */
export const behaviorType = established(defineType({
  id: "javascript-deduplication.behavior.v1",
  name: "Behavior",
  description: "One executable behavior at one locus, identified by the content identity of its normalized form.",
  parents: [],
  schema: {
    type: "object", additionalProperties: false,
    required: ["kind", "identity", "package", "file", "name", "line", "bytes"],
    properties: {
      kind: { const: "javascript-deduplication.behavior" },
      identity: NI,
      package: { type: "string", minLength: 1 },
      file: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      line: { type: "integer", minimum: 1 },
      bytes: { type: "integer", minimum: 0 },
    },
  },
}));

/** A statement that a behavior is implemented at a locus: subject the behavior identity,
 *  predicate `implemented-in`, object the locus, witness the scan receipt. Carried as an EAVT row
 *  `{ e: subject, a: predicate, v: object, t: witness }`. */
export const behaviorObservationType = established(defineType({
  id: "javascript-deduplication.behavior-observation.v1",
  name: "BehaviorObservation",
  description: "The statement that one behavior identity is implemented at one package file locus, witnessed by one scan.",
  parents: [],
  schema: {
    type: "object", additionalProperties: false,
    required: ["e", "a", "v", "t"],
    properties: {
      e: NI,
      a: { const: "javascript-deduplication.implemented-in" },
      v: { type: "object", additionalProperties: false, required: ["package", "file", "name", "line", "bytes", "fileIdentity"], properties: {
        package: { type: "string", minLength: 1 }, file: { type: "string", minLength: 1 }, name: { type: "string", minLength: 1 },
        line: { type: "integer", minimum: 1 }, bytes: { type: "integer", minimum: 0 }, fileIdentity: NI,
      } },
      t: { type: "object", additionalProperties: false, required: ["scan", "at"], properties: { scan: NI, at: { type: "string", format: "date-time" } } },
    },
  },
}));

/** A code work order for the fabrication line, derived from a candidate whose owner does not yet
 *  export the behavior: identity and seat, requirements, prohibitions, the operation's input and
 *  output schema derived from the callable form, examples, and the trace back to the candidate. */
export const migrationWorkOrderType = established(defineType({
  id: "javascript-deduplication.migration-work-order.v1",
  name: "MigrationWorkOrder",
  description: "The code work order that fabricates an owner operation for an ownerless duplication candidate.",
  parents: [],
  schema: {
    type: "object", additionalProperties: false,
    required: ["kind", "candidate", "seat", "operationName", "requirements", "prohibitions", "sites", "inputSchema", "outputSchema"],
    properties: {
      kind: { const: "javascript-deduplication.migration-work-order" },
      candidate: NI,
      seat: { type: "string", minLength: 1 },
      operationName: { type: "string", minLength: 1 },
      requirements: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
      prohibitions: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
      sites: { type: "array", minItems: 2, items: { type: "object", additionalProperties: false, required: ["package", "file", "name", "line"], properties: {
        package: { type: "string" }, file: { type: "string" }, name: { type: "string" }, line: { type: "integer", minimum: 1 } } } },
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
    },
  },
}));

