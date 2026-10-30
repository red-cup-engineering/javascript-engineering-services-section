import { fabricateLocalCapCell } from "./fabricate-local-capcell.mjs";

const OPERATION = "fabricate-capcell-manifest";
const CONTRACT_REVISION = "package-neutral-v1";
const ACTOR = "urn:ame:capcell-manifest-fabrication-service";
const ACCOUNT = "eip155:5615610:0x85e13494678eca8edf90cc0131bb0e5947bc9ce1";
const ACTION = "https://capcell-manifest-fabrication.actions.561.group/invoke";
const offer = {"@context": "https://www.w3.org/ns/activitystreams", type: "Offer", id: "https://capcell-manifest-fabrication.actions.561.group/offers/current", actor: ACTOR, object: {type: "Service", operation: OPERATION, action: ACTION}, price: {protocol: "x402", asset: "USD", amount: "0", network: "eip155:5615610", payTo: ACCOUNT}};

function json(body, status = 200, contentType = "application/json") { return new Response(JSON.stringify(body), {status, headers: {"content-type": contentType, "access-control-allow-origin": "*", "cache-control": "no-store"}}); }
export default {async fetch(request) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") return json({ok: true, actor: ACTOR, account: ACCOUNT, operation: OPERATION, contractRevision: CONTRACT_REVISION});
  if (request.method === "GET" && url.pathname === "/actor") return json({"@context": "https://www.w3.org/ns/activitystreams", id: ACTOR, type: "Service", inbox: `${url.origin}/inbox`, outbox: `${url.origin}/outbox`}, 200, "application/activity+json");
  if (request.method === "GET" && url.pathname === "/outbox") return json({"@context": "https://www.w3.org/ns/activitystreams", type: "OrderedCollection", totalItems: 1, orderedItems: [offer]}, 200, "application/activity+json");
  if (request.method === "GET" && url.pathname === "/offers/current") return json(offer, 200, "application/activity+json");
  if (request.method === "POST" && (url.pathname === "/invoke" || url.pathname === "/inbox")) {
    try {
      const input = await request.json();
      const bundle = fabricateLocalCapCell(input.specification, input.evidence ?? {});
      return json({type: "CapCellManifestFabricationReceipt", operation: OPERATION, contractRevision: CONTRACT_REVISION, specification: bundle.specification, specificationId: bundle.specificationIdentity.id, manifest: bundle.manifest});
    } catch (error) { return json({type: "CapCellManifestFabricationRefusal", operation: OPERATION, reason: error?.message ?? String(error)}, 400); }
  }
  return json({type: "CapCellManifestFabricationRefusal", operation: OPERATION, reason: "not-found"}, 404);
}};
