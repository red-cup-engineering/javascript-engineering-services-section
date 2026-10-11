import test from "node:test";
import assert from "node:assert/strict";
import { assayChannel, carrierOfLot, channelOfPreAssayFailure, distinctChannels, independenceFromWriter, proofingOfDerivation } from "../src/assay-channels.mjs";

// Kinetic proofing (Lenticule glossary term, ruled 2026-09-04): independence is evidential, not
// organizational; two passes of the same model on the same evidence are one channel; the system
// records which channel caught which defect.

const order = { requirements: ["R1 adds"], examples: [{ name: "one", input: 1, output: 2 }] };

test("two passes of the same model on the same evidence are one channel", () => {
  const first = assayChannel({ method: "clause-assays", carrier: "model-a", evidence: order });
  const second = assayChannel({ method: "review", carrier: "model-a", evidence: order });
  assert.equal(first.id, second.id);
  const merged = distinctChannels([first, second]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].methods, ["clause-assays", "review"]);
});

test("the same model on different evidence, or another model on the same evidence, is another channel", () => {
  const base = assayChannel({ method: "clause-assays", carrier: "model-a", evidence: order });
  assert.notEqual(assayChannel({ method: "clause-assays", carrier: "model-a", evidence: { other: true } }).id, base.id);
  assert.notEqual(assayChannel({ method: "clause-assays", carrier: "model-b", evidence: order }).id, base.id);
});

test("a check is independent of the writer only on evidence: a different channel the writer was not shown", () => {
  const writer = assayChannel({ method: "source-derivation", carrier: "model-a", evidence: order });
  assert.equal(independenceFromWriter(assayChannel({ method: "clause-assays", carrier: "model-a", evidence: order }), writer).independent, false);
  assert.equal(independenceFromWriter(assayChannel({ method: "clause-assays", carrier: "model-b", evidence: order }), writer).independent, true);
  assert.equal(independenceFromWriter(assayChannel({ method: "admitted-examples", carrier: "work-order-author", evidence: order.examples }), writer, { seenByWriter: true }).independent, false);
  const unnamed = assayChannel({ method: "source-derivation", carrier: carrierOfLot({ id: "lot-1" }), evidence: order });
  assert.equal(independenceFromWriter(assayChannel({ method: "clause-assays", carrier: carrierOfLot({ id: "lot-2" }), evidence: { other: 1 } }), unnamed).independent, false,
    "lots that name no carrier cannot be shown to differ");
});

test("a derivation whose tests and source came from one model on one order has no independent behavioral channel", () => {
  const proofing = proofingOfDerivation({ workOrder: order, assayLot: { id: "1", model: "model-a" }, writerLots: [{ id: "2", model: "model-a" }], examples: order.examples });
  assert.equal(proofing.independentBehavioralChannels, 0);
  const independent = proofingOfDerivation({ workOrder: order, assayLot: { id: "1", model: "model-b" }, writerLots: [{ id: "2", model: "model-a" }], examples: order.examples });
  assert.equal(independent.independentBehavioralChannels, 1);
});

test("each caught defect is bound to the channel that caught it", () => {
  const failure = ["TAP version 13", "# Subtest: add: clause assay rejects strings", "not ok 2 - add: clause assay rejects strings"].join("\n");
  assert.equal(channelOfPreAssayFailure(failure), "clause-assays");
  assert.equal(channelOfPreAssayFailure("not ok 1 - add: one"), "admitted-examples");
  assert.equal(channelOfPreAssayFailure("SyntaxError: Unexpected token"), "module-set-composition");
  const proofing = proofingOfDerivation({
    workOrder: order, assayLot: { id: "1", model: "model-b" }, writerLots: [{ id: "2", model: "model-a" }], examples: order.examples,
    catches: [{ defect: failure, method: channelOfPreAssayFailure(failure) }, { defect: "the module carries a shebang", method: "delivery-admission" }],
  });
  const clause = proofing.channels.find(channel => channel.method === "clause-assays");
  assert.equal(proofing.catches[0].caughtBy, clause.id);
  assert.equal(proofing.catches[1].caughtBy, proofing.channels.find(channel => channel.method === "delivery-admission").id);
});
