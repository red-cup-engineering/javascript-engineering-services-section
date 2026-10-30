/** Journal-facing construction and verification of witnessed observations. */
import {
  addressJsonValue,
  addressSiteConstitution,
  canonicalBytes,
  addressPrimitiveArticulation,
  isIdentityWitness,
  type ArtifactRef,
  type ArtifactSource,
} from "../lib/identity/index.mts";
import { requireJsonValue, type JsonValue } from "../lib/codecs/json/core.mts";
import type { Tm, Ty } from "@red-cup-engineering/relation-model-notation";
import { isClosed, inferTy, checkTy } from "@red-cup-engineering/relation-model-notation-typing";

import { isCausalWitness } from "./judgment.mts";
import {
  addressWitnessCore,
  type WitnessCore,
  type WitnessRef,
} from "./witness.mts";

function check(term: Tm, type?: Ty): boolean {
  return isClosed(term) && (type === undefined ? inferTy([], term) !== null : checkTy([], term, type));
}

export interface JournalObservation {
  readonly kind: "metroplat.journal.observation";
  readonly seat: JsonValue;
  readonly claim: Tm;
  readonly address: Tm;
  readonly time: string;
  readonly causes: readonly string[];
  readonly payload?: JsonValue;
  /** Content addresses of non-journal artifacts whose availability this witness commits. */
  readonly referencedArtifacts?: readonly ArtifactRef[];
}

export interface JournalWitness {
  readonly kind: "metroplat.journal.witness";
  readonly id: WitnessRef;
  readonly bytes: string;
  readonly core: WitnessCore;
  readonly observation: JournalObservation;
  readonly sources: readonly ArtifactSource[];
}

function addressed(value: unknown) {
  const result = addressJsonValue(value);
  if (!isIdentityWitness(result)) {
    throw new TypeError(`${result.code} at ${result.path}: ${result.message}`);
  }
  return result.value;
}

function source(ref: ArtifactRef, canonicalText: string): ArtifactSource {
  return Object.freeze({ ref, canonicalText });
}

function sortedUnique<T extends string>(values: readonly T[]): readonly T[] {
  return Object.freeze([...new Set(values)].sort());
}

export function journalWitness(observation: JournalObservation): JournalWitness {
  if (observation.kind !== "metroplat.journal.observation") {
    throw new TypeError("journal observation has an unsupported kind");
  }
  if (observation.time.length === 0) throw new TypeError("journal observation time must be nonempty");
  if (!check(observation.claim)) throw new TypeError("journal observation claim is not a closed typed term");
  if (!check(observation.address)) throw new TypeError("journal observation address is not a closed typed term");

  const siteResult = addressSiteConstitution();
  if (!isIdentityWitness(siteResult)) throw new TypeError(siteResult.message);
  const site = siteResult.value;
  const token = addressed(Object.freeze({
    kind: "metroplat.journal.address-mark",
    version: 1,
    address: observation.address,
  }));
  const claim = addressed(Object.freeze({
    kind: "metroplat.journal.claim-mark",
    version: 1,
    claim: observation.claim,
    ...(observation.payload === undefined ? {} : { payload: observation.payload }),
  }));
  const boundary = addressed(Object.freeze({
    kind: "metroplat.journal.boundary-observation",
    version: 1,
    seat: observation.seat,
    observedAt: observation.time,
  }));
  const articulationResult = addressPrimitiveArticulation(Object.freeze({
    kind: "metroplat.primitive-articulation",
    version: 1,
    token: token.ref,
    claim: claim.ref,
  }));
  if (!isIdentityWitness(articulationResult)) throw new TypeError(articulationResult.message);
  const articulation = articulationResult.value;
  const artifactRefs = new Set(observation.referencedArtifacts ?? []);
  if (artifactRefs.size !== (observation.referencedArtifacts?.length ?? 0)) {
    throw new TypeError("journal observation repeats a referenced artifact");
  }
  const witnessResult = addressWitnessCore(Object.freeze({
    kind: "metroplat.witness-core",
    version: 1,
    site: site.ref,
    articulation: articulation.ref,
    causes: sortedUnique(observation.causes) as readonly WitnessRef[],
    referencedArtifacts: sortedUnique([boundary.ref, ...artifactRefs]),
    attestationRefs: Object.freeze([]),
    boundaryObservationRefs: Object.freeze([]),
  }));
  if (!isCausalWitness(witnessResult)) throw new TypeError(witnessResult.message);
  const witness = witnessResult.value;
  const sources = Object.freeze([
    source(site.ref, site.canonical.text),
    source(token.ref, token.canonical.text),
    source(claim.ref, claim.canonical.text),
    source(boundary.ref, boundary.canonical.text),
    source(articulation.ref, articulation.canonical.text),
    source(witness.ref, witness.canonical.text),
  ].sort((left, right) => left.ref.localeCompare(right.ref)));
  return Object.freeze({
    kind: "metroplat.journal.witness" as const,
    id: witness.ref,
    bytes: witness.canonical.text,
    core: witness.core,
    observation: Object.freeze({
      ...observation,
      causes: sortedUnique(observation.causes),
      ...(artifactRefs.size === 0 ? {} : { referencedArtifacts: sortedUnique([...artifactRefs]) }),
    }),
    sources,
  });
}

export function parseJournalWitness(value: unknown): JournalWitness {
  const record = requireJsonValue(value, "journal witness");
  if (record === null || Array.isArray(record) || typeof record !== "object") {
    throw new TypeError("journal witness must be an object");
  }
  const candidate = record as unknown as JournalWitness;
  if (candidate.kind !== "metroplat.journal.witness") throw new TypeError("unsupported journal witness kind");
  const expected = journalWitness(candidate.observation);
  if (
    candidate.id !== expected.id
    || candidate.bytes !== expected.bytes
    || canonicalBytes(candidate.core) !== canonicalBytes(expected.core)
    || canonicalBytes(candidate.sources) !== canonicalBytes(expected.sources)
  ) {
    throw new TypeError("journal witness does not match its exact observation and causal source material");
  }
  return expected;
}

export function payloadJson(value: unknown, context: string): JsonValue {
  return requireJsonValue(value, context);
}
