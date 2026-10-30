const CONTRACT = "jsnode-function-movement-cloud/v1";
const MAX_BODY_BYTES = 48_000;
const MAX_SOURCE_BYTES = 16_000;
const MAX_FUNCTION_BYTES = 8_000;
export const MAX_AUTHORIZATION_AGE_SECONDS = 900;
export const PUBLIC_KEY_SPKI_BASE64 = "MCowBQYDK2VwAyEA3NAgkxcTw69b22opxMwl+N3znr/MMH974zg/ywrBq04=";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export type SignatureVerifier = (request: Request, body: Uint8Array, nowMs: number) => Promise<boolean>;

function hex(bytes: ArrayBuffer | Uint8Array): string { const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); return [...view].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
async function digest(text: string): Promise<string> { return `sha256:${hex(await crypto.subtle.digest("SHA-256", encoder.encode(text)))}`; }
async function bodyDigest(body: Uint8Array): Promise<string> { return hex(await crypto.subtle.digest("SHA-256", new Uint8Array(body).buffer as ArrayBuffer)); }

export async function signatureMessage(request: Request, body: Uint8Array, timestamp: string): Promise<Uint8Array> {
  return encoder.encode(`${request.method}\n${new URL(request.url).pathname}\n${timestamp}\n${await bodyDigest(body)}`);
}

function bytesFromBase64(value: string): Uint8Array { const decoded = atob(value); const bytes = new Uint8Array(decoded.length); for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index); return bytes; }
function bytesFromBase64Url(value: string): Uint8Array { if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url"); const padding = "=".repeat((4 - value.length % 4) % 4); return bytesFromBase64(value.replaceAll("-", "+").replaceAll("_", "/") + padding); }
const publicKeyPromise = crypto.subtle.importKey("spki", bytesFromBase64(PUBLIC_KEY_SPKI_BASE64).buffer as ArrayBuffer, { name: "Ed25519" }, false, ["verify"]);
export const verifyProductionSignature: SignatureVerifier = async (request, body, nowMs) => {
  const timestamp = request.headers.get("x-union-timestamp") ?? ""; if (!/^[0-9]{10}$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp), nowSeconds = Math.floor(nowMs / 1000); if (timestampSeconds > nowSeconds || nowSeconds - timestampSeconds > MAX_AUTHORIZATION_AGE_SECONDS) return false;
  let signature: Uint8Array; try { signature = bytesFromBase64Url(request.headers.get("x-union-signature") ?? ""); } catch { return false; }
  if (signature.byteLength !== 64) return false;
  return crypto.subtle.verify({ name: "Ed25519" }, await publicKeyPromise, signature.buffer as ArrayBuffer, (await signatureMessage(request, body, timestamp)).buffer as ArrayBuffer);
};

function response(status: number, value: Record<string, unknown>): Response { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } }); }
function refusal(status: number, error: string, message: string): Response { return response(status, { contract: CONTRACT, error, message }); }
function stringField(record: Record<string, unknown>, name: string, maxBytes: number): string | Response {
  if (typeof record[name] !== "string" || !record[name]) return refusal(400, "invalid-fields", `${name} must be a non-empty string`);
  if (encoder.encode(record[name] as string).byteLength > maxBytes) return refusal(413, "field-too-large", `${name} exceeds ${maxBytes} UTF-8 bytes`);
  return record[name] as string;
}

export async function materializeMovement(input: { sourceText: string; targetText: string; functionName: string; functionSource: string; targetMarker: string }): Promise<Record<string, unknown>> {
  if (!input.sourceText.includes(input.functionSource)) throw new Error("source function is not exact");
  if (!input.targetText.includes(input.targetMarker)) throw new Error("target marker is not exact");
  if (!new RegExp(`\\b${input.functionName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\b`).test(input.functionSource)) throw new Error("function source does not contain function name");
  const sourceText = input.sourceText.replace(input.functionSource, "");
  const targetText = input.targetText.replace(input.targetMarker, `${input.targetMarker}\n\n${input.functionSource}`);
  return { contract: CONTRACT, sourceText, targetText, sourceDigest: await digest(sourceText), targetDigest: await digest(targetText), providerWorkspace: "ephemeral", persisted: false };
}

function parse(body: Uint8Array): Record<string, string> | Response {
  let source: string; try { source = decoder.decode(body); } catch { return refusal(400, "invalid-json", "body must be canonical UTF-8 JSON"); }
  let value: unknown; try { value = JSON.parse(source); } catch { return refusal(400, "invalid-json", "body must be canonical UTF-8 JSON"); }
  if (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(value) !== source) return refusal(400, "noncanonical-json", "body must be canonical JSON");
  const record = value as Record<string, unknown>, fields = ["sourceText", "targetText", "functionName", "functionSource", "targetMarker"];
  if (Object.keys(record).length !== fields.length || fields.some((field) => !(field in record))) return refusal(400, "invalid-fields", "exact movement fields are required");
  const parsed: Record<string, string> = {};
  for (const field of fields) { const result = stringField(record, field, field.includes("Text") ? MAX_SOURCE_BYTES : MAX_FUNCTION_BYTES); if (result instanceof Response) return result; parsed[field] = result; }
  if (parsed.sourceText === parsed.targetText) return refusal(400, "same-source-target", "source and target bytes must be distinct");
  return parsed;
}

export function createHandler({ verifySignature = verifyProductionSignature, now = () => Date.now() }: { verifySignature?: SignatureVerifier; now?: () => number } = {}): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health" && !url.search) return response(200, { contract: CONTRACT, state: "ephemeral", status: "ready", persisted: false });
    if (request.method !== "POST" || url.pathname !== "/v1/prepare-function-movement" || url.search) return refusal(404, "not-found", "operation does not exist");
    const body = new Uint8Array(await request.arrayBuffer()), length = Number(request.headers.get("content-length") ?? "-1");
    if (body.byteLength > MAX_BODY_BYTES || length !== body.byteLength) return refusal(413, "body-too-large", "body length is outside the admitted bound");
    if ((request.headers.get("content-type") ?? "").split(";", 1)[0].trim() !== "application/json") return refusal(415, "unsupported-media-type", "Content-Type must be application/json");
    if (!await verifySignature(request, body, now())) return refusal(401, "invalid-signature", "a recent valid Union signature is required");
    const parsed = parse(body); if (parsed instanceof Response) return parsed;
    try { return response(200, await materializeMovement(parsed as unknown as { sourceText: string; targetText: string; functionName: string; functionSource: string; targetMarker: string })); } catch (error) { return refusal(422, "movement-refused", error instanceof Error ? error.message : String(error)); }
  };
}

if (import.meta.main) Deno.serve(createHandler());
