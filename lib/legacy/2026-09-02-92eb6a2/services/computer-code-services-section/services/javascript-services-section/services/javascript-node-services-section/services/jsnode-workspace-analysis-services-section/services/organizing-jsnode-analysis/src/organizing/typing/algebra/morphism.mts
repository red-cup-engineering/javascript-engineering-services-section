import { type Morphism } from "@red-cup-engineering/computing/categorifying";
import {
  observeLabels,
  type Observation,
  type ObservationArena,
  type LabeledSettledMemeInput,
} from "@red-cup-engineering/computing/operating";
import type { UtteranceCarrier } from "@emsenn/relating";
import { labelUtterances } from "./labels.mts";

export interface JsFn {
  readonly name: string;
  readonly domain: readonly string[];
  readonly codomain?: string;
  readonly utterances: readonly UtteranceCarrier[];
  readonly observation: Observation;
  readonly morphism: Morphism;
}

export function jsFn(input: {
  name: string;
  domain?: readonly string[];
  codomain?: string;
}): JsFn {
  if (!input.name) throw new TypeError("jsFn: name is required");
  const domain = Object.freeze([...(input.domain ?? [])]);
  const labels = functionLabels(input.name, domain, input.codomain);
  const utterances = labelUtterances(labels);
  const observation = observeLabels(labels);
  const carrier = functionMorphism(input.name, domain, input.codomain);
  return Object.freeze(
    input.codomain === undefined
      ? { name: input.name, domain, utterances, observation, morphism: carrier }
      : { name: input.name, domain, codomain: input.codomain, utterances, observation, morphism: carrier },
  );
}

function functionLabels(
  name: string,
  domain: readonly string[],
  codomain: string | undefined,
): readonly LabeledSettledMemeInput[] {
  const subject = `jsnode.function.${name}`;
  return [
    { id: subject, charge: "potential", predicate: "jsnode.function.exists", object: name },
    ...domain.map((typeName, index): LabeledSettledMemeInput => ({
      id: `${subject}.domain.${index}`,
      charge: "potential",
      predicate: "jsnode.function.has-domain",
      object: typeName,
    })),
    ...(codomain === undefined ? [] : [{
      id: `${subject}.codomain`,
      charge: "potential" as const,
      predicate: "jsnode.function.has-codomain",
      object: codomain,
    }]),
  ];
}

// Operadic composability: `inner`'s codomain exactly fills `outer`'s slot-th
// input. (Assignability widening is a topology concern; the algebra composes on
// exact names only.)
export function composableAt(outer: JsFn, slot: number, inner: JsFn): boolean {
  return (
    inner.codomain !== undefined &&
    slot >= 0 &&
    slot < outer.domain.length &&
    outer.domain[slot] === inner.codomain
  );
}

// Operadic substitution: plug `inner` into `outer`'s slot, splicing inner's
// domain into that position; the result's codomain is `outer`'s, unchanged.
export function composeAt(outer: JsFn, slot: number, inner: JsFn): JsFn {
  if (!composableAt(outer, slot, inner)) {
    throw new TypeError(
      `composeAt: ${inner.name} (codomain ${inner.codomain ?? "∅"}) does not fill slot ${slot} of ${outer.name}`,
    );
  }
  const domain = [
    ...outer.domain.slice(0, slot),
    ...inner.domain,
    ...outer.domain.slice(slot + 1),
  ];
  const name = `${outer.name}∘${slot}:${inner.name}`;
  return jsFn(
    outer.codomain === undefined
      ? { name, domain }
      : { name, domain, codomain: outer.codomain },
  );
}

function functionMorphism(name: string, domain: readonly string[], codomain: string | undefined): Morphism {
  const source = functionTypeArena(`${name}.domain`, domain);
  const target = functionTypeArena(`${name}.codomain`, codomain === undefined ? [] : [codomain]);
  const [targetPosition] = target.positions;
  return Object.freeze({
    kind: "computing.morphism" as const,
    name,
    domain: source,
    codomain: target,
    graph: Object.freeze(
      targetPosition === undefined
        ? []
        : source.positions.map((from) => Object.freeze({ from, to: targetPosition })),
    ),
  });
}

function functionTypeArena(scope: string, types: readonly string[]): ObservationArena {
  return observeLabels(
    types.map((typeName, index): LabeledSettledMemeInput => ({
      id: `jsnode.function.${scope}.${index}.${typeName}`,
      charge: "potential",
      predicate: "jsnode.function.type-slot",
      object: typeName,
    })),
  ).arena;
}
