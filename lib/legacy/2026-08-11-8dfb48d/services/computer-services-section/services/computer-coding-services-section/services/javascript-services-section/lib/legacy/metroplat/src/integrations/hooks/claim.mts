import { jsonToTerm } from "@red-cup-engineering/relation-model-notation-json-codec";
import type { Tm } from "@red-cup-engineering/relation-model-notation";
import type { JsonValue } from "../../lib/codecs/json/core.mts";

export interface HookEventClaimInput {
  readonly harness: string;
  readonly hookEventName: string;
  readonly toolName?: string;
}

export function hookEventClaimTerm(input: HookEventClaimInput): Tm {
  return jsonToTerm(Object.freeze({
    kind: "metroplat.hook.claim",
    version: 1,
    harness: input.harness,
    hookEventName: input.hookEventName,
    ...(input.toolName === undefined ? {} : { toolName: input.toolName }),
  }) as JsonValue);
}
