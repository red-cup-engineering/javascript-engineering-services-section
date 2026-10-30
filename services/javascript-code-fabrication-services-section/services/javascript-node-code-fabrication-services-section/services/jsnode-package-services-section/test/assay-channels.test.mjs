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

test("each source-writing lot is compared separately; a compound name cannot counterfeit independence", () => {
  const candidates = [
    { assay: "model-a", expected: 0, reason: /same carrier on the same evidence/u },
    { assay: "model-b", expected: 0, reason: /same carrier on the same evidence/u },
    { assay: "model-c", expected: 1, reason: /different identified carrier/u },
  ];
  for (const { assay, expected, reason } of candidates) {
    const proofing = proofingOfDerivation({
      workOrder: order,
      assayLot: { id: "assay", model: assay },
      writerLots: [{ id: "source-1", model: "model-a" }, { id: "source-2", model: "model-b" }],
      examples: order.examples,
    });
    assert.equal(proofing.sourceWriters.length, 2);
    assert.deepEqual(proofing.sourceWriters.map(item => item.carrier), ["model-a", "model-b"]);
    assert.equal(proofing.independentBehavioralChannels, expected);
    assert.match(proofing.channels.find(item => item.method === "clause-assays").reason, reason);
    assert.equal(proofing.independentlyReceived, false);
    assert.equal(proofing.sourceLotAuthentication, "unverified-market-lot-declarations");
  }
});

test("unknown writer and unknown checker origins cannot create an independent proofing channel", () => {
  const cases = [
    { writerLots: [], assayLot: { model: "named-assayer" } },
    { writerLots: [{ id: "unknown-writer" }], assayLot: { model: "named-assayer" } },
    { writerLots: [{ id: "named-writer", model: "model-a" }, { id: "unknown-writer" }], assayLot: { model: "model-c" } },
    { writerLots: [{ id: "named-writer", model: "model-a" }], assayLot: { id: "unknown-assayer" } },
  ];
  for (const { writerLots, assayLot } of cases) {
    const result = proofingOfDerivation({ workOrder: order, writerLots, assayLot, examples: order.examples });
    assert.equal(result.independentBehavioralChannels, 0, JSON.stringify({ writerLots, assayLot }));
    assert.match(result.channels.find(item => item.method === "clause-assays").reason,
      /unnamed checker or source writer/u);
  }
  const unknown = assayChannel({ method: "source-derivation", carrier: "unnamed-carrier", evidence: order });
  const named = assayChannel({ method: "clause-assays", carrier: "model-c", evidence: order });
  assert.equal(independenceFromWriter(named, unknown).independent, false);
  assert.equal(independenceFromWriter(unknown, named).independent, false);
  assert.equal(independenceFromWriter(named, named, { sourceWriters: [] }).independent, false);
});

test("every reported defect has an actual named checking channel, or the proofing record refuses", () => {
  const base = { workOrder: order, writerLots: [{ model: "writer" }],
    assayLot: { model: "assayer" }, examples: order.examples };
  for (const catchRecord of [
    { defect: "a failure", method: "nonexistent-review" },
    { defect: "a failure", method: null },
    { defect: "", method: "fold-check" },
    { defect: null, method: "delivery-admission" },
  ]) {
    assert.throws(() => proofingOfDerivation({ ...base, catches: [catchRecord] }),
      /every caught defect requires/u);
  }
  const valid = proofingOfDerivation({ ...base, catches: [
    { defect: "one confirmed misfold", method: "fold-check" },
    { defect: "incomplete TAP", method: "module-set-composition" },
  ] });
  assert.equal(valid.catches.length, 2);
  assert.ok(valid.catches.every(item => typeof item.caughtBy === "string" && item.caughtBy.length > 0));
  for (const item of valid.catches)
    assert.equal(item.caughtBy, valid.channels.find(channel => channel.method === item.method).id);
});

test("finite original writer/checker truth table retains same-evidence and seen-by-writer refusals", () => {
  const carriers = ["model-a", "model-b", "unnamed-carrier"];
  for (const writerCarrier of carriers) {
    for (const checkerCarrier of carriers) {
      for (const hasNewEvidence of [false, true]) {
        for (const seenByWriter of [false, true]) {
          const writer = assayChannel({ method: "source-derivation", carrier: writerCarrier, evidence: order });
          const checker = assayChannel({ method: "clause-assays", carrier: checkerCarrier,
            evidence: hasNewEvidence ? { original: order, additional: "independent case" } : order });
          const outcome = independenceFromWriter(checker, writer, { seenByWriter });
          const expected = !seenByWriter && writerCarrier !== "unnamed-carrier" &&
            checkerCarrier !== "unnamed-carrier" &&
            (writerCarrier !== checkerCarrier || hasNewEvidence);
          assert.equal(outcome.independent, expected, JSON.stringify({
            writerCarrier, checkerCarrier, hasNewEvidence, seenByWriter,
          }));
        }
      }
    }
  }
});

test("blank or boundary-whitespace market lot names cannot claim separate provenance", () => {
  for (const model of ["  ", "model-a ", " model-a", "\t"]) {
    assert.equal(carrierOfLot({ model }), "unnamed-carrier");
    const proofing = proofingOfDerivation({ workOrder: order,
      writerLots: [{ model }], assayLot: { model: "model-b" } });
    assert.equal(proofing.independentBehavioralChannels, 0);
  }
  for (const sample of [
    { method: "", carrier: "a" },
    { method: "assay ", carrier: "a" },
    { method: "assay", carrier: " " },
    { method: "assay", carrier: " b" },
  ]) assert.throws(() => assayChannel({ ...sample, evidence: order }),
    /nonblank original method and carrier/u);
});

test("a missing clause-assay market lot retains its real detection method without making it independent", () => {
  const result = proofingOfDerivation({ workOrder: order, writerLots: [], assayLot: undefined,
    examples: order.examples,
    catches: [{ defect: "not ok 1 - operation: clause assay negative", method: "clause-assays" }],
  });
  const channel = result.channels.find(item => item.method === "clause-assays");
  assert.ok(channel);
  assert.equal(channel.carrier, "unnamed-carrier");
  assert.equal(channel.independent, false);
  assert.equal(result.independentBehavioralChannels, 0);
  assert.equal(result.catches[0].caughtBy, channel.id);
});
