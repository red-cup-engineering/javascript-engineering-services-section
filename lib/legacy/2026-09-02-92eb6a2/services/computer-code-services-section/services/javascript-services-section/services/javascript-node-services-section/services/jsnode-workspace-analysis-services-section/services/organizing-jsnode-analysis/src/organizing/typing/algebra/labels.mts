import type { LabeledSettledMemeInput } from "@red-cup-engineering/computing/operating";
import { mark, utterance, type UtteranceCarrier } from "@emsenn/relating";

export function labelUtterances(labels: readonly LabeledSettledMemeInput[]): readonly UtteranceCarrier[] {
  return Object.freeze(labels.map((label) =>
    utterance(mark({ subject: label.id, object: label.object }), mark(label.predicate))
  ));
}
