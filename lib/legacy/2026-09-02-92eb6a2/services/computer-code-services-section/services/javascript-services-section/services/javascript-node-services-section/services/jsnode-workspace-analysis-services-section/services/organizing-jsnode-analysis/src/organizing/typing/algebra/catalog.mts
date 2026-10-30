import { observeLabels, type LabeledSettledMemeInput, type Observation } from "@red-cup-engineering/computing/operating";
import type { UtteranceCarrier } from "@emsenn/relating";

import type { JsType } from "./type.mts";
import type { JsFn } from "./morphism.mts";
import { labelUtterances } from "./labels.mts";

export type SubtypeEdge = readonly [sub: string, sup: string];

export interface TypeCatalog {
  readonly kind: "javascript.type-catalog";
  readonly types: readonly JsType[];
  readonly functions: readonly JsFn[];
  readonly subtypes: readonly SubtypeEdge[];
  readonly utterances: readonly UtteranceCarrier[];
  readonly observation: Observation;
}

export function typeCatalog(input: {
  types?: readonly JsType[];
  functions?: readonly JsFn[];
  subtypes?: readonly SubtypeEdge[];
}): TypeCatalog {
  const types = Object.freeze([...(input.types ?? [])]);
  const functions = Object.freeze([...(input.functions ?? [])]);
  const subtypes = Object.freeze(
    (input.subtypes ?? []).map((e) => Object.freeze([e[0], e[1]] as const)),
  );
  const labels = catalogLabels(types, functions, subtypes);
  const utterances = labelUtterances(labels);
  return Object.freeze({
    kind: "javascript.type-catalog" as const,
    types,
    functions,
    subtypes,
    utterances,
    observation: observeLabels(labels),
  });
}

function catalogLabels(
  types: readonly JsType[],
  functions: readonly JsFn[],
  subtypes: readonly SubtypeEdge[],
): readonly LabeledSettledMemeInput[] {
  return [
    ...types.map((type): LabeledSettledMemeInput => ({
      id: `jsnode.type-catalog.type.${type.name}`,
      charge: "potential",
      predicate: "jsnode.type-catalog.has-type",
      object: type.name,
    })),
    ...functions.map((fn): LabeledSettledMemeInput => ({
      id: `jsnode.type-catalog.function.${fn.name}`,
      charge: "potential",
      predicate: "jsnode.type-catalog.has-function",
      object: fn.name,
    })),
    ...subtypes.map(([sub, sup]): LabeledSettledMemeInput => ({
      id: `jsnode.type-catalog.subtype.${sub}.${sup}`,
      charge: "potential",
      predicate: "jsnode.type-catalog.specializes",
      object: `${sub}<:${sup}`,
    })),
  ];
}

export function findType(cat: TypeCatalog, name: string): JsType | undefined {
  return cat.types.find((t) => t.name === name);
}

export function hasType(cat: TypeCatalog, name: string): boolean {
  return cat.types.some((t) => t.name === name);
}

// Direct (reflexive + one declared step) assignability: `a` is assignable to
// `b` when they are the same object or `a <: b` is a declared edge. The
// transitive closure is the topology's job.
export function directlyAssignable(cat: TypeCatalog, a: string, b: string): boolean {
  return a === b || cat.subtypes.some(([sub, sup]) => sub === a && sup === b);
}
