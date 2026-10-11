import { decodeSemantic, semanticBytes } from "@red-cup-engineering/relation-model-notation-runtime";
import { decodeRelationalValue } from "@red-cup-engineering/relation-model-notation-runtime/relational-value";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
import { relationalWitnessJournalDocument } from "@lenticule-science/witness-journal-rdf-projection-service/client";

export const ACTOR = "urn:ame:software-program-synthesis-service";
export const SYNTHESIS_EFFECTS = Object.freeze([
  "provider-local-compute",
  "provider-local-witness-journal",
  "contracted-mission-provider-egress",
]);

function rmnId(value) {
  return identifyJsonSemanticContent({
    objectKind: "software-program-synthesis.witness-journal-record",
    value,
    witnessRoot: EMPTY_WITNESS_ROOT,
  }).token;
}
export function record(body) { return Object.freeze({ id: rmnId(body), ...body }); }
export function operationBytes(value) { return semanticBytes(relationalWitnessJournalDocument(value)); }
export function operationFromBytes(bytes) {
  const term = decodeSemantic(bytes);
  if (term?.[0] !== "ascribe" || term.length !== 3) throw new Error("program operation is not one typed relational RMN document");
  return decodeRelationalValue(term[1], term[2]);
}
export function exactOperation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "id"));
  return value.id === rmnId(body);
}
