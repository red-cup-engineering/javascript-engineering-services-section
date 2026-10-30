/**
 * The capability reading of a settled valuation.
 *
 * This module deliberately has no knowledge of a transport, implementation
 * family, or operation spelling.  A capability is a charged claim.  Sources
 * outside the capability algebra witness those claims; this fold is the only place where
 * their callable standing is read.
 */
import { chargeValue, joinKnowledgeValue, type ChargeValueName } from "../values/index.mts";
import { dK, dTop, type ChargedCell } from "../math/topology/settling-associated-sheaf.mts";
import { canonicalBytes, contentAddress } from "../identity/index.mts";
import type { Tm } from "@red-cup-engineering/relation-model-notation";
import type { JsonValue } from "../codecs/json/core.mts";

export interface EffectorDeclaration {
  readonly kind: "metroplat.capability.effector";
  /** A boundary declaration, never an executable closure. */
  readonly declaration: string;
}

export type CapabilityBody =
  | { readonly kind: "metroplat.capability.term"; readonly term: Tm }
  | EffectorDeclaration;

/**
 * The content of one capability claim, addressed by its language term.
 *
 * @metroplatSubject capability
 */
export interface CapabilityClaim {
  readonly kind: "metroplat.capability.claim";
  readonly address: Tm;
  readonly body: CapabilityBody;
  /** Derived program-contract standing, carried as serializable claim material. */
  readonly contract: JsonValue;
  readonly codecs: readonly string[];
  readonly reads: readonly Tm[];
  readonly writes: readonly Tm[];
}

/** One journal-admissible charge witness.  `carrier` stays outside the core. */
export interface CapabilityWitness<Carrier = unknown> {
  readonly kind: "metroplat.capability.witness";
  readonly claim: CapabilityClaim;
  readonly charge: ChargeValueName;
  readonly causes: readonly string[];
  readonly carrier: Carrier;
}

export interface CapabilityObstruction {
  readonly kind: "metroplat.capability.obstruction";
  readonly address: string;
  readonly charge: "contested";
  /** The nonzero local disagreement count: the finite obstruction price. */
  readonly price: number;
  readonly sources: readonly string[];
}

export interface CapabilityReading<Carrier = unknown> {
  readonly kind: "metroplat.capability.reading";
  /** The all-unknown valuation extended by the journal's knowledge join. */
  readonly valuation: Readonly<Record<string, ChargeValueName>>;
  /** dK of the valuation: held and contested claims are positively designated. */
  readonly designated: readonly {
    readonly address: string;
    readonly claim: CapabilityClaim;
    readonly charge: "held" | "contested";
    readonly carriers: readonly Carrier[];
  }[];
  /** dTop of the same valuation, never erased by the callable reading. */
  readonly obstructions: readonly CapabilityObstruction[];
  /** A topological order proven by read/write declarations. */
  readonly order: readonly string[];
}

export const capabilityAddress = (claim: CapabilityClaim): string => contentAddress(claim.address as unknown as JsonValue);

export function capabilityClaim(
  address: Tm,
  body: CapabilityBody,
  contract: JsonValue,
  codecs: readonly string[] = [],
  reads: readonly Tm[] = [],
  writes: readonly Tm[] = [],
): CapabilityClaim {
  return Object.freeze({
    kind: "metroplat.capability.claim" as const,
    address,
    body,
    contract,
    codecs: Object.freeze([...codecs]),
    reads: Object.freeze([...reads]),
    writes: Object.freeze([...writes]),
  });
}

export function capabilityWitness<Carrier>(
  claim: CapabilityClaim,
  charge: ChargeValueName,
  carrier: Carrier,
  causes: readonly string[] = [],
): CapabilityWitness<Carrier> {
  return Object.freeze({
    kind: "metroplat.capability.witness" as const,
    claim,
    charge,
    causes: Object.freeze([...causes]),
    carrier,
  });
}

function causalOrder(claims: readonly CapabilityClaim[]): { readonly order: readonly string[]; readonly cyclic: ReadonlySet<string> } {
  const addresses = new Map(claims.map((claim) => [capabilityAddress(claim), claim]));
  const writers = new Map<string, string[]>();
  for (const claim of claims) {
    const address = capabilityAddress(claim);
    for (const written of claim.writes) {
      const key = canonicalBytes(written as unknown as JsonValue);
      const at = writers.get(key) ?? [];
      at.push(address);
      writers.set(key, at);
    }
  }
  const prerequisites = new Map<string, Set<string>>();
  for (const [address, claim] of addresses) {
    const required = new Set<string>();
    for (const read of claim.reads) for (const writer of writers.get(canonicalBytes(read as unknown as JsonValue)) ?? []) if (writer !== address) required.add(writer);
    prerequisites.set(address, required);
  }
  const remaining = new Map([...prerequisites.entries()].map(([key, value]) => [key, new Set(value)]));
  const order: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()].filter(([, needs]) => needs.size === 0).map(([address]) => address).sort();
    if (ready.length === 0) break;
    for (const address of ready) {
      order.push(address);
      remaining.delete(address);
      for (const needs of remaining.values()) needs.delete(address);
    }
  }
  return Object.freeze({ order: Object.freeze(order), cyclic: new Set(remaining.keys()) });
}

/** Fold claim-charge witnesses by the FOUR knowledge join and read dK/dTop. */
export function readCapabilityWitnesses<Carrier>(witnesses: readonly CapabilityWitness<Carrier>[]): CapabilityReading<Carrier> {
  const byAddress = new Map<string, CapabilityWitness<Carrier>[]>();
  for (const witness of witnesses) {
    const address = capabilityAddress(witness.claim);
    const at = byAddress.get(address) ?? [];
    at.push(witness);
    byAddress.set(address, at);
  }
  const claims = [...byAddress.values()].map((entries) => entries[0]!.claim);
  const causality = causalOrder(claims);
  const valuation: Record<string, ChargeValueName> = {};
  const charged: ChargedCell[] = [];
  for (const [address, entries] of [...byAddress.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    let charge: ChargeValueName = "unknown";
    for (const entry of entries) charge = joinKnowledgeValue(chargeValue(charge), chargeValue(entry.charge)).name;
    if (causality.cyclic.has(address)) charge = "contested";
    valuation[address] = charge;
    charged.push(Object.freeze({ kind: "settlingAssociatedSheaf.chargedCell" as const, cell: address, charge }));
  }
  const positive = new Set(dK(charged).cells);
  const contested = new Set([...dTop(charged).cells, ...causality.cyclic]);
  const designated = [...byAddress.entries()]
    .filter(([address]) => positive.has(address))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([address, entries]) => Object.freeze({
      address,
      claim: entries[0]!.claim,
      charge: valuation[address] as "held" | "contested",
      carriers: Object.freeze(entries.map((entry) => entry.carrier)),
    }));
  const obstructions = [...contested].sort().map((address) => {
    const entries = byAddress.get(address) ?? [];
    return Object.freeze({
      kind: "metroplat.capability.obstruction" as const,
      address,
      charge: "contested" as const,
      price: entries.length + (causality.cyclic.has(address) ? 1 : 0),
      sources: Object.freeze(entries.map((entry) => capabilityAddress(entry.claim)).sort()),
    });
  });
  return Object.freeze({
    kind: "metroplat.capability.reading" as const,
    valuation: Object.freeze(valuation),
    designated: Object.freeze(designated),
    obstructions: Object.freeze(obstructions),
    order: causality.order,
  });
}
