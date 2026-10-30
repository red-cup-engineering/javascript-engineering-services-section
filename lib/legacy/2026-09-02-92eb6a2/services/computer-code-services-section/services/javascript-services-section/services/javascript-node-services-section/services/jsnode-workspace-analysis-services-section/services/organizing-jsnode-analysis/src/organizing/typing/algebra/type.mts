import { observeLabels, type Observation } from "@red-cup-engineering/computing/operating";
import type { UtteranceCarrier } from "@emsenn/relating";
import { labelUtterances } from "./labels.mts";

export const TYPE_KINDS = Object.freeze([
  "class",
  "interface",
  "type-alias",
  "primitive",
] as const);
export type TypeKind = typeof TYPE_KINDS[number];

export interface JsType {
  readonly name: string;
  readonly kind: TypeKind;
  readonly utterances: readonly UtteranceCarrier[];
  readonly observation: Observation;
}

export function jsType(name: string, kind: TypeKind = "type-alias"): JsType {
  if (!name) throw new TypeError("jsType: name is required");
  const labels = Object.freeze([
    {
      id: `jsnode.type.${name}`,
      charge: "potential" as const,
      predicate: "jsnode.type.has-kind",
      object: kind,
    },
  ]);
  const utterances = labelUtterances(labels);
  return Object.freeze({
    name,
    kind,
    utterances,
    observation: observeLabels(labels),
  });
}

// Objects are equal when they denote the same name. Two declarations of the
// same name with different kinds are a collision, not two objects.
export function sameType(a: JsType, b: JsType): boolean {
  return a.name === b.name;
}
