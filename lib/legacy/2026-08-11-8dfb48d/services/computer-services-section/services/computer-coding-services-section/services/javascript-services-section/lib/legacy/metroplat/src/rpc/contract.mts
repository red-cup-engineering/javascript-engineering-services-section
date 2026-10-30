/**
 * A program contract is derived from an operation's minimal generators and
 * measured evidence. It is never authored as a second description of the
 * operation.
 *
 * The domain and codomain schemas supply the executable pre/post predicates;
 * the term body and read/write terms supply the move and effects; settlement
 * classification supplies the convergence and coordination regime; Lean
 * declarations name the governing laws; replayable behavioral receipts carry
 * evidence about whether this operation presently preserves its postcondition.
 */
import { contentAddress } from "../lib/identity/index.mts";
import { evaluateRunTerm } from "@red-cup-engineering/relation-model-notation-eval";
import { inhabitants } from "../lib/schema/inhabit.mts";
import { schemaFrom } from "../lib/schema/contract.mts";
import { chargeValue, chargeValueNames, joinKnowledgeValue, type ChargeValueName } from "../lib/values/index.mts";
import type { JsonValue } from "../lib/codecs/json/core.mts";
import { operationConvergenceSignature, type OperationConvergenceSignature } from "./convergence.mts";
import type { Operation } from "./operation.mts";

export interface ProgramLawCitation {
  readonly kind: "metroplat.lean.formalization-claim";
  readonly theorem: string;
  readonly source?: string;
  readonly theoremMaturity?: string;
  readonly obligations: readonly string[];
  readonly mediaType: "application/vnd.metroplat.lean.formalization-claim+json";
}

function lawCitation(input: Omit<ProgramLawCitation, "kind" | "mediaType">): ProgramLawCitation {
  return Object.freeze({
    kind: "metroplat.lean.formalization-claim" as const,
    ...input,
    obligations: Object.freeze([...input.obligations]),
    mediaType: "application/vnd.metroplat.lean.formalization-claim+json" as const,
  });
}

export interface ProgramContractBoundary {
  readonly kind: "schema" | "wire";
  readonly id: string;
  readonly predicate: "validate-input" | "validate-output" | "decode-input" | "encode-output";
}

export interface DerivedProgramContract {
  readonly kind: "metroplat.program.contract";
  readonly id: string;
  readonly operation: string;
  readonly precondition: ProgramContractBoundary;
  readonly postcondition: ProgramContractBoundary;
  readonly move: {
    readonly kind: "rmn-term" | "host-boundary";
    readonly digest?: string;
    readonly deterministic: true | "unmeasured";
    readonly totality: "schema-bounded" | "partial" | "unmeasured";
    readonly reads: readonly JsonValue[];
    readonly writes: readonly JsonValue[];
  };
  readonly settlement: OperationConvergenceSignature;
  readonly coordination: {
    readonly h1Vanishes: boolean;
    readonly mode: "coordination-free" | "coordination-required";
  };
  readonly laws: readonly ProgramLawCitation[];
}

export interface ProgramContractEvidence {
  readonly kind: "metroplat.program.contract.evidence";
  readonly contract: string;
  readonly source: "behavioral-oracle" | "unmeasured-boundary";
  readonly charge: ChargeValueName;
  readonly seed: number;
  readonly requestedSamples: number;
  readonly samples: number;
  readonly rejectedProposals: number;
  readonly conformant: number;
  readonly obstructions: readonly string[];
}

export const programContractEvidenceSchema = {
  $id: "metroplat/program-contract/evidence",
  title: "ProgramContractEvidence",
  description: "One replayable measurement contributing FOUR evidence to a derived program contract.",
  type: "object",
  required: ["kind", "contract", "source", "charge", "seed", "requestedSamples", "samples", "rejectedProposals", "conformant", "obstructions"],
  additionalProperties: false,
  properties: {
    kind: { const: "metroplat.program.contract.evidence" },
    contract: { type: "string", minLength: 1 },
    source: { enum: ["behavioral-oracle", "unmeasured-boundary"] },
    charge: { enum: chargeValueNames },
    seed: { type: "integer" },
    requestedSamples: { type: "integer", minimum: 1 },
    samples: { type: "integer", minimum: 0 },
    rejectedProposals: { type: "integer", minimum: 0 },
    conformant: { type: "integer", minimum: 0 },
    obstructions: { type: "array", items: { type: "string" } },
  },
} as const;

export const programContractEvidenceContract = schemaFrom(programContractEvidenceSchema);

export interface ProgramContractStanding {
  readonly kind: "metroplat.program.contract.standing";
  readonly contract: DerivedProgramContract;
  readonly charge: ChargeValueName;
  readonly price: number;
  readonly evidence: readonly ProgramContractEvidence[];
}

export function isProgramContractStanding(value: unknown): value is ProgramContractStanding {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (value as { readonly kind?: unknown }).kind === "metroplat.program.contract.standing";
}

function boundary(operation: Operation, side: "domain" | "codomain"): ProgramContractBoundary {
  const schema = side === "domain" ? operation.domain : operation.codomain;
  const wire = side === "domain" ? operation.inputFormat : operation.outputFormat;
  return Object.freeze(schema === undefined
    ? {
        kind: "wire" as const,
        id: `wire:${wire}`,
        predicate: side === "domain" ? "decode-input" as const : "encode-output" as const,
      }
    : {
        kind: "schema" as const,
        id: schema.id,
        predicate: side === "domain" ? "validate-input" as const : "validate-output" as const,
      });
}

function laws(settlement: OperationConvergenceSignature): readonly ProgramLawCitation[] {
  const result: ProgramLawCitation[] = [
    lawCitation({
      theorem: "Obsmetrologia.Computing.keratinousHoareProgram_derives_hoare_program",
      source: "Obsmetrologia/Computing/HoareProgram.lean",
      theoremMaturity: "proved",
      obligations: ["contract-shape"],
    }),
    lawCitation({
      theorem: "Obsmetrologia.Computing.keratinousHoareProgram_least_compatible_state",
      source: "Obsmetrologia/Computing/HoareProgram.lean",
      theoremMaturity: "proved",
      obligations: ["least-compatible-state"],
    }),
    lawCitation({
      theorem: "Obsmetrologia.CRDT.calm_monotone_coordination_free",
      source: "Obsmetrologia/Cohomology/CRDTCohomologicalCALM.lean",
      theoremMaturity: "proved",
      obligations: ["coordination"],
    }),
  ];
  if (settlement.regime === "strict-finite") {
    result.push(lawCitation({
      theorem: "Obsmetrologia.Charge.strict_finite",
      source: "Obsmetrologia/Closure/Ordinal/Finite.lean",
      theoremMaturity: "proved",
      obligations: ["finite-settlement"],
    }));
  }
  return Object.freeze(result);
}

/** Derive the stable contract from the operation; no contract fields are accepted as input. */
export function deriveProgramContract(operation: Operation): DerivedProgramContract {
  const precondition = boundary(operation, "domain");
  const postcondition = boundary(operation, "codomain");
  const settlement = operationConvergenceSignature(operation);
  const h1Vanishes = operation.effects.coordination === "coordination-free";
  const body = operation.runTerm === undefined ? undefined : operation.runTerm as unknown as JsonValue;
  const generator = Object.freeze({
    operation: operation.verb,
    precondition,
    postcondition,
    move: Object.freeze({
      kind: body === undefined ? "host-boundary" as const : "rmn-term" as const,
      ...(body === undefined ? {} : { digest: contentAddress(body) }),
      deterministic: operation.effects.deterministic,
      totality: operation.effects.totality,
      reads: Object.freeze(operation.reads.map((term) => term as unknown as JsonValue)),
      writes: Object.freeze(operation.writes.map((term) => term as unknown as JsonValue)),
    }),
    settlement,
    coordination: Object.freeze({
      h1Vanishes,
      mode: operation.effects.coordination,
    }),
    laws: laws(settlement),
  });
  return Object.freeze({
    kind: "metroplat.program.contract" as const,
    id: contentAddress(generator as unknown as JsonValue),
    ...generator,
  });
}

/** Measure one operation without invoking host effects. */
export function measureProgramContract(
  operation: Operation,
  options: { readonly samples?: number; readonly seed?: number } = {},
): ProgramContractEvidence {
  const contract = deriveProgramContract(operation);
  const requestedSamples = options.samples === undefined ? 3 : Math.max(1, Math.min(32, Math.floor(options.samples)));
  const seed = options.seed ?? 1;
  if (operation.runTerm === undefined || operation.domain === undefined || operation.codomain === undefined) {
    return programContractEvidenceContract.assert(Object.freeze({
      kind: "metroplat.program.contract.evidence" as const,
      contract: contract.id,
      source: "unmeasured-boundary" as const,
      charge: "unknown" as const,
      seed,
      requestedSamples,
      samples: 0,
      rejectedProposals: 0,
      conformant: 0,
      obstructions: Object.freeze([]),
    }), "unmeasured program contract evidence") as ProgramContractEvidence;
  }

  const generated = inhabitants(operation.domain.schema as JsonValue, operation.domain.validate, requestedSamples, { seed });
  const obstructions = [...generated.obstructions];
  let conformant = 0;
  let behavioralFailure = false;
  for (const input of generated.values) {
    try {
      const output = evaluateRunTerm(operation.runTerm, input);
      if (operation.codomain.validate(output)) conformant += 1;
      else {
        behavioralFailure = true;
        obstructions.push(`codomain refused output: ${operation.codomain.errors(output).slice(0, 2).join("; ")}`);
      }
    } catch (error) {
      behavioralFailure = true;
      obstructions.push(`move failed on admitted input: ${error instanceof Error ? error.message.slice(0, 200) : String(error)}`);
    }
  }
  const charge: ChargeValueName = behavioralFailure ? "denied"
    : generated.values.length === 0 ? "unknown"
      : conformant === generated.values.length ? "held" : "denied";
  return programContractEvidenceContract.assert(Object.freeze({
    kind: "metroplat.program.contract.evidence" as const,
    contract: contract.id,
    source: "behavioral-oracle" as const,
    charge,
    seed,
    requestedSamples,
    samples: generated.values.length,
    rejectedProposals: generated.rejected,
    conformant,
    obstructions: Object.freeze(obstructions.slice(0, 8)),
  }), `program contract evidence for ${operation.verb}`) as ProgramContractEvidence;
}

/** Fold independently produced evidence through FOUR's knowledge join. */
export function readProgramContractStanding(
  operation: Operation,
  evidence: readonly ProgramContractEvidence[] = [measureProgramContract(operation)],
): ProgramContractStanding {
  const contract = deriveProgramContract(operation);
  const relevant = evidence.filter((receipt) => receipt.contract === contract.id);
  let charge: ChargeValueName = "unknown";
  for (const receipt of relevant) charge = joinKnowledgeValue(chargeValue(charge), chargeValue(receipt.charge)).name;
  return Object.freeze({
    kind: "metroplat.program.contract.standing" as const,
    contract,
    charge,
    price: relevant.reduce((sum, receipt) => sum + receipt.obstructions.length, 0),
    evidence: Object.freeze([...relevant]),
  });
}
