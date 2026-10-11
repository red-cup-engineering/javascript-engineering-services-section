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
import { semanticId } from "@red-cup-engineering/computer-content-engineering-services-section/semiotic-content-address";

/** The carrier a market lot names, or the one a deterministic procedure is. */
export function carrierOfLot(lot) {
  const named = lot?.model ?? lot?.carrier ?? lot?.provider;
  return typeof named === "string" && named.length > 0 ? named : "unnamed-carrier";
}

/** One assay channel: method, carrier and the content address of the evidence it was given. */
export function assayChannel({ method, carrier, evidence }) {
  if (typeof method !== "string" || typeof carrier !== "string") throw new TypeError("an assay channel names its method and carrier");
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
export function independenceFromWriter(channel, writer, { seenByWriter = false } = {}) {
  if (channel.id === writer.id) return Object.freeze({ independent: false, reason: "same carrier on the same evidence as the writer: one channel" });
  if (seenByWriter) return Object.freeze({ independent: false, reason: "the writer was shown these checks" });
  if (channel.carrier === writer.carrier && channel.carrier === "unnamed-carrier") {
    return Object.freeze({ independent: false, reason: "neither carrier is named, so they cannot be shown to differ" });
  }
  return Object.freeze({ independent: true, reason: channel.carrier === writer.carrier ? "same carrier on different evidence" : "different carrier" });
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
  const writerCarriers = [...new Set(writerLots.map(carrierOfLot))];
  const writer = assayChannel({ method: "source-derivation", carrier: writerCarriers.length === 1 ? writerCarriers[0] : writerCarriers.sort().join("+") || "unnamed-carrier", evidence: workOrder });
  const checks = [
    { channel: assayChannel({ method: "admitted-examples", carrier: "work-order-author", evidence: examples }), seenByWriter: true },
    ...(assayLot === undefined ? [] : [{ channel: assayChannel({ method: "clause-assays", carrier: carrierOfLot(assayLot), evidence: workOrder }), seenByWriter: false }]),
    { channel: assayChannel({ method: "module-set-composition", carrier: "node-test-runner", evidence: { method: "compose-and-run" } }), seenByWriter: false },
    { channel: assayChannel({ method: "delivery-admission", carrier: "jsnode-delivery-schema", evidence: { method: "admit-delivery" } }), seenByWriter: false },
    { channel: assayChannel({ method: "fold-check", carrier: "jsnode-misfold-reader", evidence: { method: "read-misfolds" } }), seenByWriter: false },
  ];
  const channels = checks.map(({ channel, seenByWriter }) => Object.freeze({ ...channel, ...independenceFromWriter(channel, writer, { seenByWriter }) }));
  const byMethod = new Map(channels.map((channel) => [channel.method, channel]));
  const bound = catches.map(({ defect, method }) => Object.freeze({ defect: String(defect).slice(0, 600), method, caughtBy: byMethod.get(method)?.id ?? null }));
  const independent = distinctChannels(channels.filter((channel) => channel.independent && ["admitted-examples", "clause-assays"].includes(channel.method)));
  return Object.freeze({
    type: "JsnodeDerivationProofing", version: 1,
    writer, channels: Object.freeze(channels), catches: Object.freeze(bound),
    independentBehavioralChannels: independent.length,
  });
}
