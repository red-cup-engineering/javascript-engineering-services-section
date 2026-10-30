/**
 * Kinetic proofing of a JSNode derivation: which assay channels examined the source, whether each is
 * independent of the channel that wrote it, and which channel caught which defect.
 *
 * Lenticule mathematics, glossary term kinetic-proofing (ruled 2026-09-04): fidelity is bought by
 * "repeated, economically accountable challenge through structurally independent evidence";
 * "independence is evidential, not organizational"; "two passes of the same model on the same
 * evidence are one channel"; and "the system should record which channel caught which defect". The
 * Central Dogma of code fabrication adds that the provider is a ribosome: fidelity is set by the
 * order, so a channel the source writer already read is no challenge to it.
 *
 * A channel is identified by its method, its carrier (the model or deterministic procedure that ran
 * it) and the evidence it was given (a content address). Two checks with the same carrier and the
 * same evidence collapse to one channel. A carrier the market lot does not name cannot be shown to
 * differ from another, so it is taken as the same carrier: independence is claimed only on evidence.
 */
import { semanticId } from "@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address";

/** The carrier a market lot names, or the one a deterministic procedure is. */
export function carrierOfLot(lot) {
  const named = lot?.model ?? lot?.carrier ?? lot?.provider;
  // Market lot display fields are not authenticated identities. At minimum,
  // blank or boundary-whitespace names cannot establish a distinct carrier.
  return typeof named === "string" && named.length > 0 && named.trim() === named
    ? named : "unnamed-carrier";
}

/** One assay channel: method, carrier and the content address of the evidence it was given. */
export function assayChannel({ method, carrier, evidence }) {
  if (typeof method !== "string" || method.trim() !== method || !method ||
      typeof carrier !== "string" || carrier.trim() !== carrier || !carrier)
    throw new TypeError("an assay channel names a nonblank original method and carrier");
  const evidenceAddress = semanticId(evidence ?? null);
  return Object.freeze({ id: semanticId({ carrier, evidence: evidenceAddress }), method, carrier, evidence: evidenceAddress });
}

/** Channels with the same carrier and evidence are one channel, whatever their methods. */
export function distinctChannels(channels) {
  const byId = new Map();
  for (const channel of channels) {
    const held = byId.get(channel.id);
    byId.set(channel.id, held === undefined ? { ...channel, methods: [channel.method] } : { ...held, methods: [...held.methods, channel.method] });
  }
  return Object.freeze([...byId.values()].map((channel) => Object.freeze({ ...channel, methods: Object.freeze(channel.methods) })));
}

/**
 * Whether a checking channel is independent of the writer: a different channel (carrier or evidence
 * differs) whose checks the writer was not shown. Returns the reason either way.
 */
export function independenceFromWriter(channel, writer, { seenByWriter = false, sourceWriters } = {}) {
  // A synthetically concatenated market-lot label is a useful *display* but
  // is not the identity of every source-writing participant. Compare the
  // checking channel with ALL original source-writing channels.
  const writers = sourceWriters === undefined ? [writer] : sourceWriters;
  if (!Array.isArray(writers) || writers.length === 0 ||
      writers.some(item => typeof item?.id !== "string" || typeof item.carrier !== "string") ||
      typeof channel?.id !== "string" || typeof channel.carrier !== "string") {
    return Object.freeze({ independent: false, reason: "source writer identities not fully observed" });
  }
  if (seenByWriter) return Object.freeze({ independent: false, reason: "the writer was shown these checks" });
  if (writers.some(item => item.id === channel.id))
    return Object.freeze({ independent: false, reason: "same carrier on the same evidence as a source writer: one channel" });
  if (channel.carrier === "unnamed-carrier" || writers.some(item => item.carrier === "unnamed-carrier"))
    return Object.freeze({ independent: false, reason: "unnamed checker or source writer cannot establish distinct carriers" });
  return Object.freeze({ independent: true, reason: writers.some(item => item.carrier === channel.carrier)
    ? "same identified carrier on different evidence" : "different identified carrier" });
}

/** Which channel a pre-assay failure belongs to: a clause assay, an admitted example, or the composition itself. */
export function channelOfPreAssayFailure(failure) {
  const failing = String(failure ?? "").split("\n").filter((line) => /^\s*not ok \d+ - /u.test(line)).map((line) => line.replace(/^\s*not ok \d+ - /u, ""));
  if (failing.some((name) => name.includes(": clause assay "))) return "clause-assays";
  if (failing.some((name) => /: /u.test(name) && !name.startsWith("test/"))) return "admitted-examples";
  return "module-set-composition";
}

/**
 * The proofing record of one derivation. `workOrder` is the order the writer read; `assayLot` and
 * `writerLots` are the market lots of the clause-assay and source deliveries; `catches` lists the
 * defects caught, each `{ defect, method }`. Returns the channels, each with its independence from the
 * writer, the catches bound to channel ids, and how many distinct channels independent of the writer
 * examined the source.
 */
export function proofingOfDerivation({ workOrder, assayLot, writerLots = [], examples = [], catches = [] }) {
  const writerCarriers = [...new Set(writerLots.map(carrierOfLot))].sort();
  // Multiple actual writer lots must never disappear into a made-up composite
  // carrier identity when independence is checked. Missing market provenance
  // is an unknown writer, not a free pass for a differently named assay.
  const sourceWriters = (writerCarriers.length ? writerCarriers : ["unnamed-carrier"])
    .map(carrier => assayChannel({ method: "source-derivation", carrier, evidence: workOrder }));
  const writer = assayChannel({ method: "source-derivation",
    carrier: writerCarriers.length === 1 ? writerCarriers[0] : writerCarriers.join("+") || "unnamed-carrier",
    evidence: workOrder });
  const checks = [
    { channel: assayChannel({ method: "admitted-examples", carrier: "work-order-author", evidence: examples }), seenByWriter: true },
    // A clause-assay method can run without an attributed market lot. Keep
    // its real detection channel with unknown carrier; the absence of a lot
    // denies *independence*, not the fact that Node observed a failing case.
    { channel: assayChannel({ method: "clause-assays", carrier: carrierOfLot(assayLot), evidence: workOrder }), seenByWriter: false },
    { channel: assayChannel({ method: "module-set-composition", carrier: "node-test-runner", evidence: { method: "compose-and-run" } }), seenByWriter: false },
    { channel: assayChannel({ method: "delivery-admission", carrier: "jsnode-delivery-schema", evidence: { method: "admit-delivery" } }), seenByWriter: false },
    { channel: assayChannel({ method: "fold-check", carrier: "jsnode-misfold-reader", evidence: { method: "read-misfolds" } }), seenByWriter: false },
  ];
  const channels = checks.map(({ channel, seenByWriter }) => Object.freeze({
    ...channel, ...independenceFromWriter(channel, writer, { seenByWriter, sourceWriters }),
  }));
  const byMethod = new Map(channels.map((channel) => [channel.method, channel]));
  // R3: an observed failure without a known actual checking channel is not a
  // proofing receipt. Never preserve a deceptively nullable caughtBy edge.
  const bound = catches.map(({ defect, method }) => {
    if (typeof defect !== "string" || !defect.trim() || typeof method !== "string" ||
        !byMethod.has(method))
      throw new TypeError("kinetic proofing: every caught defect requires its original assay method and nonempty evidence");
    return Object.freeze({ defect: defect.slice(0, 600), method, caughtBy: byMethod.get(method).id });
  });
  const independent = distinctChannels(channels.filter((channel) => channel.independent && ["admitted-examples", "clause-assays"].includes(channel.method)));
  return Object.freeze({
    type: "JsnodeDerivationProofing", version: 1,
    writer, sourceWriters: Object.freeze(sourceWriters), channels: Object.freeze(channels),
    catches: Object.freeze(bound),
    independentBehavioralChannels: independent.length,
    // Equality/difference of declared lot names is a candidate structural
    // independence reading, not authenticated market provenance, separately
    // received behavioral correctness, or independent customer acceptance.
    sourceLotAuthentication: "unverified-market-lot-declarations",
    independentlyReceived: false,
  });
}
