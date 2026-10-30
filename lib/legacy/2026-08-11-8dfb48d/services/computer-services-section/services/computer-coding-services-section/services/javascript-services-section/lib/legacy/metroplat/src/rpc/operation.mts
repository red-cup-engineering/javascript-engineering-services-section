/**
 * @packageDocumentation
 *
 * rpc — MetroPlat's canonical operation and execution system.
 *
 * Schema contracts provide the object half. This module adds the OPERATION half:
 * operations typed by domain/codomain objects, explicit immutable catalogs,
 * and composition as schema boundary compatibility. Derived program
 * contracts measure preservation separately from this constructor. The categorical role split is
 * objects->schemas, operations->running; the operation half imports the object half
 * (running already depends on schemas).
 *
 * Operation declarations are inert values. Applications explicitly assemble
 * them into an immutable `OperationCatalog`; importing a module never changes
 * the callable process surface.
 */
import type { JsonValue } from "../lib/codecs/json/core.mts";
import { contentAddress } from "../lib/identity/index.mts";
import { mark, utterance, type UtteranceObject } from "../lib/records/utterance/index.mts";
import { evaluateRunTerm } from "@red-cup-engineering/relation-model-notation-eval";
import {
  schemaFrom,
  type SchemaContract,
  type FromSchema,
} from "../lib/schema/contract.mts";
import { tm, type Tm } from "@red-cup-engineering/relation-model-notation";
import {
  auditSchemaOperation,
  schemaOperationsCompose,
} from "../lib/contracts/index.mts";
import { wireCodec } from "../lib/codecs/wire/index.mts";
import { bindOperationHandler, executeOperationHandler } from "./handler.mts";
import { isOperationHandlerResult, type OperationExecutionContext } from "./execution-context.mts";

/** Schema contract object accepted by the operation half. */
export type CategoryObject = SchemaContract<unknown>;

/** Serializable face of an operation; executable closures remain process-local. */
export const ProgramSchema = {
  $id: "metroplat/executing/program",
  type: "object",
  required: ["kind", "verb", "inputFormat", "outputFormat", "options"],
  properties: {
    kind: { const: "metroplat.program" },
    verb: { type: "string", minLength: 1 },
    inputFormat: { type: "string" },
    outputFormat: { type: "string" },
    options: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    description: { type: "string" },
    domain: { type: "string", minLength: 1 },
    codomain: { type: "string", minLength: 1 },
    relation: { enum: ["operation", "projection", "protocol", "boundary"] },
    effects: {
      type: "object",
      required: ["class", "replay", "coordination", "deterministic", "totality"],
      additionalProperties: false,
      properties: {
        class: { enum: ["pure", "host-read", "journal-write", "external"] },
        replay: { enum: ["safe", "idempotency-key", "coordinated"] },
        coordination: { enum: ["coordination-free", "coordination-required"] },
        deterministic: { enum: [true, "unmeasured"] },
        totality: { enum: ["schema-bounded", "partial", "unmeasured"] },
      },
    },
    runTerm: {},
  },
  title: "Program",
  description: "A serializable executable operation with its boundary formats, schemas, and optional RMN body.",
  additionalProperties: false,
} as const;

export const programSchemaContract = schemaFrom(ProgramSchema);

/** Serializable program face produced from `ProgramSchema`, with schema ids
 *  and optional `runTerm` present but the executable closure absent. */
type ProgramSchemaContractSchema = FromSchema<typeof ProgramSchema>;
export type ProgramObject = Omit<ProgramSchemaContractSchema, "runTerm"> & { readonly runTerm?: JsonValue; readonly effects?: OperationEffects };

/** Boundary helper for operation bodies that may run synchronously or await host IO. */
export type MaybePromise<T> = T | Promise<T>;

export type OperationRelation = "operation" | "projection" | "protocol" | "boundary";

export interface OperationEffects {
  readonly class: "pure" | "host-read" | "journal-write" | "external";
  readonly replay: "safe" | "idempotency-key" | "coordinated";
  readonly coordination: "coordination-free" | "coordination-required";
  readonly deterministic: true | "unmeasured";
  readonly totality: "schema-bounded" | "partial" | "unmeasured";
}

/** Review row classifying one registered operation as a schema-addressed operation,
 *  package projection, protocol boundary, or boundary, and recording whether a
 *  true operation is carried by RMN. */
export interface OperationIrAuditEntry {
  /** Runtime tag for an operation IR audit row. */
  readonly kind: "metroplat.action.ir-audit";
  /** Operation verb being audited. */
  readonly verb: string;
  /**
   * True schema-object arrows are operations; schema-addressed readouts are
   * projections; typed protocol envelopes are integration boundaries; admissions,
   * transports, and untyped host reads are boundaries.
   */
  readonly relation: "operation" | "projection" | "protocol" | "boundary";
  /**
   * Whether this operation carries its executable behavior as RMN instead of only
   * as a host-language closure.
   */
  readonly hasRunTerm: boolean;
  /** Domain schema id when one is admitted. */
  readonly domain?: string;
  /** Codomain schema id when one is admitted. */
  readonly codomain?: string;
  /** Computable reason a boundary operation is not required to carry RMN. */
  readonly reason?: string;
}

/** The specific way an operation is escaping the RMN schema-operation discipline. */
export type OperationRmnDebtKind =
  | "projection-with-schema-contract"
  | "rmn-boundary-without-schema-contract"
  | "schema-read-boundary-without-codomain";

/** Review row for operations whose classification hides RMN-worthy work. */
export interface OperationRmnDebtEntry {
  /** Runtime tag for an RMN debt audit row. */
  readonly kind: "metroplat.action.rmn-debt";
  /** Operation verb being audited. */
  readonly verb: string;
  /** Narrow debt class detected from the declared operation surface. */
  readonly debt: OperationRmnDebtKind;
  /** The operation relation assigned by `operationIrAudit`. */
  readonly relation: OperationIrAuditEntry["relation"];
  /** Whether the operation already carries an RMN body. */
  readonly hasRunTerm: boolean;
  /** Domain schema id when one is admitted. */
  readonly domain?: string;
  /** Codomain schema id when one is admitted. */
  readonly codomain?: string;
  /** Why this operation is suspicious rather than an ordinary boundary. */
  readonly reason: string;
  /** Concrete repair direction for the next registry/content pass. */
  readonly recommendation: string;
}

/** Decidable operation-composition report: schema boundary compatibility (SETTLED-4). */
export interface OperationCompositionReport {
  /** Runtime tag for the operation-level composition report. */
  readonly kind: "metroplat.action-composition";
  /** Producing operation verb. */
  readonly producer: string;
  /** Consuming operation verb. */
  readonly consumer: string;
  /** Produced schema/wire address, when declared. */
  readonly schema?: string;
  /** Whether the producer codomain and consumer domain are the same presented boundary. */
  readonly schemaCompatible: boolean;
  /** Whether both bodies are portable RMN terms and can be composed as behavior data. */
  readonly portableBodies: boolean;
  /** Whether this pair composes as relational material. */
  readonly ok: boolean;
}

/** An operation declaration at the MetroPlat boundary. */
export interface Operation {
  /** Runtime tag for operation declarations. */
  readonly kind: "metroplat.action";
  /** Content address of the semantic declaration; documentation text and handler closure are excluded. */
  readonly ref: string;
  /** Stable verb used by dispatch, CLI, HTTP, MCP, OpenAPI, and web forms. */
  readonly verb: string;
  /** Default wire codec used to decode boundary input. */
  readonly inputFormat: string;
  /** Default wire codec used to encode boundary output. */
  readonly outputFormat: string;
  /** Language-term dependencies used to derive causal mount order. */
  readonly reads: readonly Tm[];
  /** Language-term outputs written by this capability. */
  readonly writes: readonly Tm[];
  /** Named valued CLI/dispatch options this operation accepts. */
  readonly options: readonly string[];
  /** Derived effect and coordination classification used by dispatch. */
  readonly effects: OperationEffects;
  /** Short human-facing operation summary. */
  readonly summary?: string;
  /** Longer human-facing operation description. */
  readonly description?: string;
  /** SchemaContract consumed by a true operation. Undefined for raw admission boundaries. */
  readonly domain?: CategoryObject;
  /** SchemaContract produced by a true operation. Undefined for transport or untyped boundaries. */
  readonly codomain?: CategoryObject;
  /** Whether typed schema addresses name a portable operation body or a package projection. */
  readonly relation?: OperationRelation;
  /** Optional RMN body. SchemaContract-to-SchemaContract operations should carry this when possible. */
  readonly runTerm?: Tm;
}

/** Input to `operationKernel(...)`: the authored form before defaults are projected. */
export interface OperationSpec {
  /** Stable verb used by every projected boundary face. */
  readonly verb: string;
  /** Default input wire codec; defaults to `json`. */
  readonly inputFormat?: string;
  /** Default output wire codec; defaults to `json`. */
  readonly outputFormat?: string;
  readonly reads?: readonly Tm[];
  readonly writes?: readonly Tm[];
  /** Explicit boundary-effect declaration when generators cannot derive it. */
  readonly effects?: OperationEffects;
  /** Named valued CLI/dispatch options this operation accepts. */
  readonly options?: readonly string[];
  /** Short human-facing operation summary. */
  readonly summary?: string;
  /** Longer human-facing operation description. */
  readonly description?: string;
  /** SchemaContract consumed by this operation when it is a true operation. */
  readonly domain?: CategoryObject;
  /** SchemaContract produced by this operation when it is a true operation. */
  readonly codomain?: CategoryObject;
  /** Whether typed schema addresses name a portable operation body or a package projection. */
  readonly relation?: OperationRelation;
  /** RMN body for behavior-as-data. The executing wrapper can derive `run` from this. */
  readonly runTerm?: Tm;
  /** Host-language executable body. Required at the kernel layer. */
  readonly run?: (
    input: unknown,
    args: Record<string, unknown>,
    context?: OperationExecutionContext,
  ) => MaybePromise<unknown>;
}

function effectsOf(spec: OperationSpec): OperationEffects {
  if (spec.effects !== undefined) return Object.freeze({ ...spec.effects });
  const effectClass = spec.runTerm !== undefined ? "pure" as const
    : (spec.writes?.length ?? 0) > 0 ? "journal-write" as const
      : "host-read" as const;
  return Object.freeze({
    class: effectClass,
    replay: "safe" as const,
    coordination: "coordination-free" as const,
    deterministic: effectClass === "pure" ? true as const : "unmeasured" as const,
    totality: effectClass === "pure"
      ? spec.domain !== undefined && spec.codomain !== undefined ? "schema-bounded" as const : "partial" as const
      : "unmeasured" as const,
  });
}

/** One explicitly assembled, immutable operation catalog. */
export interface OperationCatalog {
  readonly kind: "metroplat.rpc.catalog";
  readonly operations: readonly Operation[];
  readonly byVerb: ReadonlyMap<string, Operation>;
  readonly byReference: ReadonlyMap<string, Operation>;
}

/** The schema objects actually carried by an operation family, uniquely by
 * address and in deterministic address order. Faces project this finite
 * category boundary instead of consulting ambient package state. */
export function schemasOfOperations(operations: readonly Operation[]): readonly CategoryObject[] {
  const schemas = new Map<string, CategoryObject>();
  const visit = (schema: CategoryObject): void => {
    const prior = schemas.get(schema.id);
    if (prior !== undefined) {
      if (prior !== schema && JSON.stringify(prior.schema) !== JSON.stringify(schema.schema)) {
        throw new TypeError(`operation schema universe: different contracts share address ${schema.id}`);
      }
      return;
    }
    schemas.set(schema.id, schema);
    for (const reference of schema.references) visit(reference);
  };
  for (const operation of operations) {
    for (const schema of [operation.domain, operation.codomain]) {
      if (schema !== undefined) visit(schema);
    }
  }
  return Object.freeze([...schemas.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

/** Assemble the callable category without ambient import-time registration. */
export function createOperationCatalog(operations: readonly Operation[]): OperationCatalog {
  const values = Object.freeze([...operations]);
  const byVerb = new Map<string, Operation>();
  const byReference = new Map<string, Operation>();
  for (const candidate of values) {
    if (byVerb.has(candidate.verb)) {
      throw new TypeError(`operation catalog: duplicate verb ${JSON.stringify(candidate.verb)}`);
    }
    if (byReference.has(candidate.ref)) {
      throw new TypeError(`operation catalog: duplicate declaration ${JSON.stringify(candidate.ref)}`);
    }
    byVerb.set(candidate.verb, candidate);
    byReference.set(candidate.ref, candidate);
  }
  return Object.freeze({
    kind: "metroplat.rpc.catalog" as const,
    operations: values,
    byVerb,
    byReference,
  });
}

/**
 * Construct the category-kernel face of an operation or boundary operation.
 *
 * SchemaContract objects are the only internal source of domain/codomain identity. This
 * function builds the carried operation record without changing process-global state.
 * Contract derivation reads that record downstream. It requires an executable
 * `run`; the public `src/rpc:operation` constructor supplies that `run` by
 * evaluating a `runTerm` when callers provide behavior as data.
 */
export function operationKernel(spec: OperationSpec): Operation {
  if (!spec.verb || spec.verb.trim() === "") throw new TypeError("operation: verb is required");
  const record = spec as unknown as Record<string, unknown>;
  if ("domainSchema" in record || "codomainSchema" in record) {
    throw new TypeError("operation: schema refs are projected from domain/codomain objects; pass SchemaContract objects");
  }
  if (spec.run === undefined) throw new TypeError(`operation ${spec.verb}: run is required at the kernel boundary`);
  const inName = spec.inputFormat ?? "json";
  const outName = spec.outputFormat ?? "json";
  const effects = effectsOf(spec);
  const declaration = Object.freeze({
    kind: "metroplat.rpc.operation-declaration" as const,
    verb: spec.verb,
    inputFormat: inName,
    outputFormat: outName,
    reads: Object.freeze([...(spec.reads ?? [])]),
    writes: Object.freeze([...(spec.writes ?? [])]),
    options: Object.freeze([...(spec.options ?? [])]),
    effects,
    ...(spec.domain === undefined ? {} : { domain: spec.domain.id }),
    ...(spec.codomain === undefined ? {} : { codomain: spec.codomain.id }),
    ...(spec.relation === undefined ? {} : { relation: spec.relation }),
    body: spec.runTerm === undefined
      ? Object.freeze({ kind: "host" as const, declaration: spec.verb })
      : Object.freeze({ kind: "rmn" as const, term: spec.runTerm }),
  });
  const value = Object.freeze({
    kind: "metroplat.action" as const,
    ref: contentAddress(declaration as unknown as JsonValue),
    verb: spec.verb,
    inputFormat: inName,
    outputFormat: outName,
    reads: Object.freeze([...(spec.reads ?? [])]),
    writes: Object.freeze([...(spec.writes ?? [])]),
    options: Object.freeze([...(spec.options ?? [])]),
    effects,
    ...(spec.summary === undefined ? {} : { summary: spec.summary }),
    ...(spec.description === undefined ? {} : { description: spec.description }),
    ...(spec.domain === undefined ? {} : { domain: spec.domain }),
    ...(spec.codomain === undefined ? {} : { codomain: spec.codomain }),
    ...(spec.relation === undefined ? {} : { relation: spec.relation }),
    ...(spec.runTerm === undefined ? {} : { runTerm: spec.runTerm }),
  }) satisfies Operation;
  bindOperationHandler(value, spec.run);
  return value;
}

/** Rebind host arguments without exposing either operation's executable handler. */
export function withOperationArguments(
  unbound: Operation,
  defaults: Readonly<Record<string, unknown>>,
): Operation {
  return operation({
    verb: unbound.verb,
    inputFormat: unbound.inputFormat,
    outputFormat: unbound.outputFormat,
    reads: unbound.reads,
    writes: unbound.writes,
    options: unbound.options,
    effects: unbound.effects,
    ...(unbound.summary === undefined ? {} : { summary: unbound.summary }),
    ...(unbound.description === undefined ? {} : { description: unbound.description }),
    ...(unbound.domain === undefined ? {} : { domain: unbound.domain }),
    ...(unbound.codomain === undefined ? {} : { codomain: unbound.codomain }),
    ...(unbound.relation === undefined ? {} : { relation: unbound.relation }),
    ...(unbound.runTerm === undefined ? {} : { runTerm: unbound.runTerm }),
    run: (input, arguments_, context) => executeOperationHandler(unbound, input, { ...defaults, ...arguments_ }, context),
  });
}

/** Report whether `consumer ∘ producer` is an admissible operation composition. */
export function operationCompositionReport(producer: Operation, consumer: Operation): OperationCompositionReport {
  const schemaCompatible = schemaOperationsCompose(
    {
      id: producer.verb,
      ...(producer.domain === undefined ? {} : { domain: producer.domain.id }),
      ...(producer.codomain === undefined ? {} : { codomain: producer.codomain.id }),
      hasPortableBody: producer.runTerm !== undefined,
    },
    {
      id: consumer.verb,
      ...(consumer.domain === undefined ? {} : { domain: consumer.domain.id }),
      ...(consumer.codomain === undefined ? {} : { codomain: consumer.codomain.id }),
      hasPortableBody: consumer.runTerm !== undefined,
    },
  );
  return Object.freeze({
    kind: "metroplat.action-composition" as const,
    producer: producer.verb,
    consumer: consumer.verb,
    ...(producer.codomain === undefined ? {} : { schema: producer.codomain.id }),
    schemaCompatible,
    portableBodies: producer.runTerm !== undefined && consumer.runTerm !== undefined,
    ok: schemaCompatible,
  });
}

/** Two operations compose when their schema boundary composes (SETTLED-4). */
export function composes(producer: Operation, consumer: Operation): boolean {
  return operationCompositionReport(producer, consumer).ok;
}

/**
 * Classify operations for the IR migration.
 *
 * SchemaContract-to-SchemaContract operations should be carried as `runTerm`; package
 * projections may have schema addresses while still using host-language readout
 * code; boundary operations are admissions, codecs, or transports. This is
 * intentionally computed from declared material addresses plus the operation's
 * relation classification, not from a curated verb list.
 *
 * This is the small review surface for the package's "behavior as data" rule:
 * if both sides have schema identities and the operation is not marked as a
 * projection, the operation is a operation and should be inspectable as RMN. If
 * either side is missing, the operation is a boundary and the `reason` explains why
 * the RMN gate does not apply.
 */
export function operationIrAudit(operations: readonly Operation[]): readonly OperationIrAuditEntry[] {
  return Object.freeze(operations.map((operation): OperationIrAuditEntry => {
    const domain = operation.domain?.id;
    const codomain = operation.codomain?.id;
    const audit = auditSchemaOperation({
      id: operation.verb,
      ...(domain === undefined ? {} : { domain }),
      ...(codomain === undefined ? {} : { codomain }),
      hasPortableBody: operation.runTerm !== undefined,
    });
    // A boundary read may have no schema-domain object while still being an
    // explicit package projection. Relation is authored architectural intent;
    // schema completeness governs portability debt, not whether the declared
    // projection/protocol role disappears from the audit.
    const relation = operation.relation === "projection"
      ? "projection" as const
      : operation.relation === "protocol"
        ? "protocol" as const
        : operation.relation === "boundary"
          ? "boundary" as const
        : audit.relation;
    return Object.freeze({
      kind: "metroplat.action.ir-audit" as const,
      verb: operation.verb,
      relation,
      hasRunTerm: operation.runTerm !== undefined,
      ...(domain === undefined ? {} : { domain }),
      ...(codomain === undefined ? {} : { codomain }),
      ...(relation === "projection" ? { reason: "package projection" }
        : relation === "protocol" ? { reason: "protocol boundary" }
          : operation.relation === "boundary" ? { reason: "declared effect boundary" }
            : audit.reason === undefined ? {} : { reason: audit.reason }),
    });
  }));
}

/**
 * The remaining schema operations whose executable body is still free TS.
 *
 * A non-empty result is useful CI/doc evidence: the package has at least one
 * true schema-object operation whose body is not yet carried as serializable
 * RMN data.
 */
export function nonportableOperations(operations: readonly Operation[]): readonly OperationIrAuditEntry[] {
  return Object.freeze(operationIrAudit(operations).filter((entry) =>
    entry.relation === "operation" && !entry.hasRunTerm));
}

function rmnDebtEntry(
  entry: OperationIrAuditEntry,
  debt: OperationRmnDebtKind,
  reason: string,
  recommendation: string,
): OperationRmnDebtEntry {
  return Object.freeze({
    kind: "metroplat.action.rmn-debt" as const,
    verb: entry.verb,
    debt,
    relation: entry.relation,
    hasRunTerm: entry.hasRunTerm,
    ...(entry.domain === undefined ? {} : { domain: entry.domain }),
    ...(entry.codomain === undefined ? {} : { codomain: entry.codomain }),
    reason,
    recommendation,
  });
}

/**
 * Actions whose classification hides likely RMN work.
 *
 * `nonportableOperations(...)` answers the strict gate: true schema operations must not
 * be implemented only as TypeScript closures. This report is the adjacent debt
 * surface for subtler failures: projection labels that cover complete
 * schema-object transformations, RMN bodies that lack a complete schema
 * boundary, and read-style schema boundaries that have not declared the
 * schema they read out.
 */
export function operationRmnDebt(operations: readonly Operation[]): readonly OperationRmnDebtEntry[] {
  const debts: OperationRmnDebtEntry[] = [];
  for (const entry of operationIrAudit(operations)) {
    const hasDomain = entry.domain !== undefined;
    const hasCodomain = entry.codomain !== undefined;
    if (entry.relation === "projection" && hasDomain && hasCodomain && !entry.hasRunTerm) {
      debts.push(rmnDebtEntry(
        entry,
        "projection-with-schema-contract",
        "schema-to-schema projection has no RMN body",
        "split host admission/projection from the pure schema operation, or document a package-projection exemption",
      ));
    }
    if (entry.relation === "boundary" && entry.hasRunTerm && (!hasDomain || !hasCodomain)) {
      debts.push(rmnDebtEntry(
        entry,
        "rmn-boundary-without-schema-contract",
        "RMN body is present but the operation lacks a complete schema boundary",
        "declare the missing schema contract or split the boundary admission from the RMN operation",
      ));
    }
    if (entry.relation === "boundary" && hasDomain && !hasCodomain && !entry.hasRunTerm && entry.verb.startsWith("read-")) {
      debts.push(rmnDebtEntry(
        entry,
        "schema-read-boundary-without-codomain",
        "read-style operation consumes a schema but does not declare the schema it reads out",
        "promote the readout to a codomain schema with RMN when the output shape is stable",
      ));
    }
  }
  return Object.freeze(debts);
}

/**
 * The serializable schema-backed program object for an operation.
 *
 * This is the shape that durable logs can store: the executable closure is
 * excluded, while the typed domain/codomain ids and optional IR `runTerm` remain
 * as data. Dispatch can still execute the original operation, but this object is
 * the reviewable face: docs, ledgers, MCP resources, and the `inspect` operation can
 * read it without closing over host process state.
 *
 * @example
 * ```ts
 * import { operations } from "@red-cup-engineering/metroplat";
 *
 * const serializable = operations.programObject(someAction);
 * Object.hasOwn(serializable, "run"); // false
 * ```
 */
export function programObject(operation: Operation): ProgramObject {
  const domain = operation.domain?.id;
  const codomain = operation.codomain?.id;
  return Object.freeze({
    kind: "metroplat.program" as const,
    verb: operation.verb,
    inputFormat: operation.inputFormat,
    outputFormat: operation.outputFormat,
    options: [...operation.options],
    effects: operation.effects,
    ...(operation.summary === undefined ? {} : { summary: operation.summary }),
    ...(operation.description === undefined ? {} : { description: operation.description }),
    ...(domain === undefined ? {} : { domain }),
    ...(codomain === undefined ? {} : { codomain }),
    ...(operation.relation === undefined ? {} : { relation: operation.relation }),
    ...(operation.runTerm === undefined ? {} : { runTerm: operation.runTerm }),
  });
}

// Executable operation constructor and composition.
function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value && typeof (value as { then?: unknown }).then === "function";
}

function assertInput(spec: OperationSpec, input: unknown): unknown {
  return spec.domain?.assert(input, `operation ${spec.verb} input`) ?? input;
}

function assertOutput(spec: OperationSpec, output: unknown): unknown {
  return spec.codomain?.assert(output, `operation ${spec.verb} output`) ?? output;
}

function assertHandlerOutput(spec: OperationSpec, output: unknown): unknown {
  if (!isOperationHandlerResult(output)) return assertOutput(spec, output);
  return Object.freeze({ ...output, value: assertOutput(spec, output.value) });
}

/**
 * Construct an operation at the executing boundary.
 *
 * This wrapper is the public constructor for runnable operations. It validates the
 * verb and wire codec names, then delegates to the presentation/operation kernel. When `runTerm`
 * is supplied without `run`, the executable body is the evaluator applied to that
 * term; this keeps pure presentation operations inspectable as data while preserving the
 * ordinary `run(input, args)` dispatch contract. Declared domain/codomain schema contracts
 * are enforced here as the operation's runtime pre/post boundary: raw admissions can
 * omit a domain, but true presentation operations must consume and produce their schema objects.
 */
export function operation(spec: OperationSpec): Operation {
  if (!spec.verb || spec.verb.trim() === "") throw new TypeError("operation: verb is required");
  const record = spec as unknown as Record<string, unknown>;
  if ("domainSchema" in record || "codomainSchema" in record) {
    throw new TypeError("operation: schema refs are projected from domain/codomain objects; pass SchemaContract objects");
  }
  if (spec.run === undefined && spec.runTerm === undefined) throw new TypeError(`operation ${spec.verb}: run or runTerm is required`);
  const inName = spec.inputFormat ?? "json";
  const outName = spec.outputFormat ?? "json";
  wireCodec(inName);
  wireCodec(outName);
  const body = spec.run ?? ((input: unknown): unknown =>
    evaluateRunTerm(spec.runTerm as NonNullable<typeof spec.runTerm>, input as JsonValue));
  const run = (
    input: unknown,
    args: Record<string, unknown>,
    context?: OperationExecutionContext,
  ): unknown | Promise<unknown> => {
    const admitted = assertInput(spec, input);
    const output = body(admitted, args, context);
    return isPromiseLike(output) ? output.then((value) => assertHandlerOutput(spec, value)) : assertHandlerOutput(spec, output);
  };
  return operationKernel({ ...spec, inputFormat: inName, outputFormat: outName, run });
}

/** Type guard: a value is an operation presentation. */
export function isOperation(value: unknown): value is Operation {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "metroplat.action";
}

/** A relational fact as an utterance: token mark = {subject, object}, claim mark = predicate. */
export function fact(subject: JsonValue, predicate: string, object: JsonValue): UtteranceObject {
  return utterance(mark({ subject, object }), mark(predicate));
}

/**
 * Compose two IR-backed operations as `consumer ∘ producer`.
 *
 * Composition is allowed only when the schema boundary composes (the producer's
 * codomain is the consumer's domain — SETTLED-4). Both inputs must have `runTerm`
 * bodies, because the composed operation must remain a serializable term rather
 * than a hidden TypeScript closure. Semantic confidence in a composite comes from
 * the behavioral oracle (catalog-verify), not from a declared entailment.
 */
export function compose(producer: Operation, consumer: Operation, verb: string): Operation {
  const report = operationCompositionReport(producer, consumer);
  if (!report.schemaCompatible) {
    throw new TypeError(`compose: ${producer.verb}.codomain ≠ ${consumer.verb}.domain`);
  }
  if (producer.runTerm === undefined) throw new TypeError(`compose: ${producer.verb} has no runTerm`);
  if (consumer.runTerm === undefined) throw new TypeError(`compose: ${consumer.verb} has no runTerm`);
  return operation({
    verb,
    inputFormat: producer.inputFormat,
    outputFormat: consumer.outputFormat,
    ...(producer.domain === undefined ? {} : { domain: producer.domain }),
    ...(consumer.codomain === undefined ? {} : { codomain: consumer.codomain }),
    runTerm: tm.app(consumer.runTerm, producer.runTerm),
  });
}

/** The utterance facts an operation carries about itself - the leg's content. */
export function operationUtterances(act: Operation): readonly UtteranceObject[] {
  const term = `metroplat.action.${act.verb}`;
  const facts: UtteranceObject[] = [
    fact(term, "metroplat.action.has-verb", act.verb),
    fact(term, "metroplat.action.accepts-codec", act.inputFormat),
    fact(term, "metroplat.action.emits-codec", act.outputFormat),
  ];
  if (act.summary !== undefined) facts.push(fact(term, "metroplat.action.summary", act.summary));
  if (act.description !== undefined) facts.push(fact(term, "metroplat.action.description", act.description));
  if (act.domain !== undefined) facts.push(fact(term, "metroplat.action.domain", act.domain.id));
  if (act.codomain !== undefined) facts.push(fact(term, "metroplat.action.codomain", act.codomain.id));
  if (act.runTerm !== undefined) facts.push(fact(term, "metroplat.action.run-term", act.runTerm));
  return Object.freeze(facts);
}
