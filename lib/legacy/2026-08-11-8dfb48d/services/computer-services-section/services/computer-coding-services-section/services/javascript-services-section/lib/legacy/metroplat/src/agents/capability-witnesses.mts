/** Agent-operation capability declarations. */
/** Capability witnesses supplied by application and integration sources.
 *
 * The executable carrier is deliberately kept here, above runtime.  Runtime
 * receives only the claim, its FOUR charge, and causal declarations.
 */
import { tm } from "@red-cup-engineering/relation-model-notation";
import {
  capabilityClaim,
  capabilityWitness,
  readCapabilityWitnesses,
  type CapabilityReading,
  type CapabilityWitness,
} from "../lib/capability/claims.mts";
import type { Operation } from "../rpc/index.mts";
import { readProgramContractStanding, type ProgramContractEvidence } from "../rpc/contract.mts";

export function capabilityWitnessForOperation(
  operation: Operation,
  causes: readonly string[] = [],
  contractEvidence?: readonly ProgramContractEvidence[],
): CapabilityWitness<Operation> {
  const address = tm.mark(operation.verb);
  const body = operation.runTerm === undefined
    ? Object.freeze({ kind: "metroplat.capability.effector" as const, declaration: operation.verb })
    : Object.freeze({ kind: "metroplat.capability.term" as const, term: operation.runTerm });
  return capabilityWitness(
    capabilityClaim(
      address,
      body,
      readProgramContractStanding(operation, contractEvidence) as unknown as import("../lib/codecs/json/core.mts").JsonValue,
      Object.freeze([operation.inputFormat, operation.outputFormat]),
      operation.reads,
      operation.writes,
    ),
    "held",
    operation,
    causes,
  );
}

export function capabilityWitnessesForOperations(
  operations: readonly Operation[],
  contractEvidence?: readonly ProgramContractEvidence[],
): readonly CapabilityWitness<Operation>[] {
  return Object.freeze(operations.map((operation) => capabilityWitnessForOperation(operation, [], contractEvidence)));
}

/** The exact current callable face, read from the settlement rather than a registry. */
export function callableOperationsFromWitnesses(witnesses: readonly CapabilityWitness<Operation>[]): {
  readonly reading: CapabilityReading<Operation>;
  readonly operations: readonly Operation[];
} {
  const reading = readCapabilityWitnesses(witnesses);
  const designated = new Set(reading.designated.map((entry) => entry.address));
  const operations = witnesses
    .filter((witness) => designated.has((reading.designated.find((entry) => entry.claim === witness.claim)?.address) ?? ""))
    .map((witness) => witness.carrier);
  return Object.freeze({ reading, operations: Object.freeze(operations) });
}
