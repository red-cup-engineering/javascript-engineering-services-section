import { canonical, requireJsonValue } from "@emsenn/relating";
import { mark, utterance, type UtteranceCarrier } from "@emsenn/relating";
import {
  observeLabels,
  type LabeledSettledMemeInput,
  type Observation,
} from "@red-cup-engineering/computing/operating";

export type { Observation, UtteranceCarrier };

export function jsNodeFact(subject: unknown, predicate: string, object: unknown): UtteranceCarrier {
  return utterance(mark({ subject, object }), mark(predicate));
}

export function jsNodeObservation(utterances: readonly UtteranceCarrier[]): Observation {
  return observeLabels(utterances.map(utteranceObservationLabel));
}

function utteranceObservationLabel(uttered: UtteranceCarrier, index: number): LabeledSettledMemeInput {
  const tokenValue = uttered.token.mark.value;
  const claimValue = uttered.claim.mark.value;
  const object =
    tokenValue !== null &&
    typeof tokenValue === "object" &&
    !Array.isArray(tokenValue) &&
    "object" in tokenValue
      ? (tokenValue as { readonly object: unknown }).object
      : tokenValue;
  return {
    id: `jsnode.utterance.${index}.${canonical(requireJsonValue(tokenValue, "utterance token"))}`,
    charge: "potential",
    predicate: String(claimValue),
    object: canonical(requireJsonValue(object, "utterance object")),
  };
}
