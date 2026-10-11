const CONTRACT = "jsnode-function-movement-cloud/v1";
const MAX_BODY_BYTES = 48_000;
const MAX_SOURCE_BYTES = 16_000;
const MAX_FUNCTION_BYTES = 8_000;
export const MAX_AUTHORIZATION_AGE_SECONDS = 900;
export const PUBLIC_KEY_SPKI_BASE64 = "MCowBQYDK2VwAyEA3NAgkxcTw69b22opxMwl+N3znr/MMH974zg/ywrBq04=";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function hex(bytes) { const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); return [...view].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function digest(text) { return `sha256:${hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)))}`; }
async function bodyDigest(body) { return hex(await crypto.subtle.digest("SHA-256", new Uint8Array(body).buffer)); }

export async function signatureMessage(request, body, timestamp) {
  return encoder.encode(`${request.method}\n${new URL(request.url).pathname}\n${timestamp}\n${await bodyDigest(body)}`);
}

function bytesFromBase64(value) { const decoded = atob(value); const bytes = new Uint8Array(decoded.length); for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index); return bytes; }
function bytesFromBase64Url(value) { if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url"); const padding = "=".repeat((4 - value.length % 4) % 4); return bytesFromBase64(value.replaceAll("-", "+").replaceAll("_", "/") + padding); }
const publicKeyPromise = crypto.subtle.importKey("spki", bytesFromBase64(PUBLIC_KEY_SPKI_BASE64).buffer, { name: "Ed25519" }, false, ["verify"]);
export const verifyProductionSignature = async (request, body, nowMs) => {
  const timestamp = request.headers.get("x-union-timestamp") ?? ""; if (!/^[0-9]{10}$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp), nowSeconds = Math.floor(nowMs / 1000); if (timestampSeconds > nowSeconds || nowSeconds - timestampSeconds > MAX_AUTHORIZATION_AGE_SECONDS) return false;
  let signature; try { signature = bytesFromBase64Url(request.headers.get("x-union-signature") ?? ""); } catch { return false; }
  if (signature.byteLength !== 64) return false;
  return crypto.subtle.verify({ name: "Ed25519" }, await publicKeyPromise, signature.buffer, (await signatureMessage(request, body, timestamp)).buffer);
};

function response(status, value) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
function refusal(status, error, message) { return response(status, { contract: CONTRACT, error, message }); }
function stringField(record, name, maxBytes) {
  if (typeof record[name] !== "string" || !record[name]) return refusal(400, "invalid-fields", `${name} must be a non-empty string`);
  if (encoder.encode(record[name]).byteLength > maxBytes) return refusal(413, "field-too-large", `${name} exceeds ${maxBytes} UTF-8 bytes`);
  return record[name];
}

export async function materializeMovement(input) {
  if (!input.sourceText.includes(input.functionSource)) throw new Error("source function is not exact");
  if (!input.targetText.includes(input.targetMarker)) throw new Error("target marker is not exact");
  if (!new RegExp(`\\b${input.functionName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`).test(input.functionSource)) throw new Error("function source does not contain function name");
  const sourceText = input.sourceText.replace(input.functionSource, "");
  const targetText = input.targetText.replace(input.targetMarker, `${input.targetMarker}\n\n${input.functionSource}`);
  return { contract: CONTRACT, sourceText, targetText, sourceDigest: await digest(sourceText), targetDigest: await digest(targetText), providerWorkspace: "ephemeral", persisted: false };
}

function parse(body) {
  let source; try { source = decoder.decode(body); } catch { return refusal(400, "invalid-json", "body must be canonical UTF-8 JSON"); }
  let value; try { value = JSON.parse(source); } catch { return refusal(400, "invalid-json", "body must be canonical UTF-8 JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(value) !== source) return refusal(400, "noncanonical-json", "body must be canonical JSON");
  const record = value, fields = ["sourceText", "targetText", "functionName", "functionSource", "targetMarker"];
  if (Object.keys(record).length !== fields.length || fields.some((field) => !(field in record))) return refusal(400, "invalid-fields", "exact movement fields are required");
  const parsed = {};
  for (const field of fields) { const result = stringField(record, field, field.includes("Text") ? MAX_SOURCE_BYTES : MAX_FUNCTION_BYTES); if (result instanceof Response) return result; parsed[field] = result; }
  if (parsed.sourceText === parsed.targetText) return refusal(400, "same-source-target", "source and target bytes must be distinct");
  return parsed;
}

export function createHandler({ verifySignature = verifyProductionSignature, now = () => Date.now() } = {}) {
  return async (request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health" && !url.search) return response(200, { contract: CONTRACT, state: "ephemeral", status: "ready", persisted: false });
    if (request.method !== "POST" || url.pathname !== "/v1/prepare-function-movement" || url.search) return refusal(404, "not-found", "operation does not exist");
    const body = new Uint8Array(await request.arrayBuffer()), length = Number(request.headers.get("content-length") ?? "-1");
    if (body.byteLength > MAX_BODY_BYTES || length !== body.byteLength) return refusal(413, "body-too-large", "body length is outside the admitted bound");
    if ((request.headers.get("content-type") ?? "").split(";", 1)[0].trim() !== "application/json") return refusal(415, "unsupported-media-type", "Content-Type must be application/json");
    if (!await verifySignature(request, body, now())) return refusal(401, "invalid-signature", "a recent valid Union signature is required");
    const parsed = parse(body); if (parsed instanceof Response) return parsed;
    try { return response(200, await materializeMovement(parsed)); } catch (error) { return refusal(422, "movement-refused", error instanceof Error ? error.message : String(error)); }
  };
}

if (import.meta.main) Deno.serve(createHandler());
