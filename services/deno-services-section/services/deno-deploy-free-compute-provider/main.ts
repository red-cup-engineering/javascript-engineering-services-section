const CONTRACT = "deno-deploy-free-compute/v1";
const MAX_BODY_BYTES = 6144;
const MAX_TEXT_BYTES = 4096;
export const MAX_AUTHORIZATION_AGE_SECONDS = 900;
const PBKDF2_ITERATIONS = 120_000;
const PBKDF2_OUTPUT_BITS = 256;
const PBKDF2_SALT = new TextEncoder().encode("harmonious-union/deno-deploy-free-compute/v1");
export const PUBLIC_KEY_SPKI_BASE64 = "MCowBQYDK2VwAyEA3NAgkxcTw69b22opxMwl+N3znr/MMH974zg/ywrBq04=";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export type SignatureVerifier = (request: Request, body: Uint8Array, nowMs: number) => Promise<boolean>;

function bytesFromBase64(value: string): Uint8Array {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

function bytesFromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url");
  const padding = "=".repeat((4 - value.length % 4) % 4);
  return bytesFromBase64(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return [...view].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", arrayBuffer(bytes)));
}

export async function signatureMessage(request: Request, body: Uint8Array, timestamp: string): Promise<Uint8Array> {
  const url = new URL(request.url);
  return encoder.encode(`${request.method}\n${url.pathname}\n${timestamp}\n${await sha256Hex(body)}`);
}

const publicKeyPromise = crypto.subtle.importKey(
  "spki",
  arrayBuffer(bytesFromBase64(PUBLIC_KEY_SPKI_BASE64)),
  { name: "Ed25519" },
  false,
  ["verify"],
);

export const verifyProductionSignature: SignatureVerifier = async (request, body, nowMs) => {
  const timestamp = request.headers.get("x-union-timestamp") ?? "";
  if (!/^[0-9]{10}$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (timestampSeconds > nowSeconds || nowSeconds - timestampSeconds > MAX_AUTHORIZATION_AGE_SECONDS) return false;
  const encodedSignature = request.headers.get("x-union-signature") ?? "";
  let signature: Uint8Array;
  try { signature = bytesFromBase64Url(encodedSignature); }
  catch { return false; }
  if (signature.byteLength !== 64) return false;
  return crypto.subtle.verify(
    { name: "Ed25519" },
    await publicKeyPromise,
    arrayBuffer(signature),
    arrayBuffer(await signatureMessage(request, body, timestamp)),
  );
};

function jsonResponse(status: number, document: Record<string, unknown>): Response {
  return new Response(JSON.stringify(document), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

function refusal(status: number, error: string, message: string): Response {
  return jsonResponse(status, { contract: CONTRACT, error, message });
}

function parseCanonicalText(body: Uint8Array): Uint8Array | Response {
  let source: string;
  try { source = decoder.decode(body); }
  catch { return refusal(400, "invalid-json", "body must be canonical UTF-8 JSON"); }
  let document: unknown;
  try { document = JSON.parse(source); }
  catch { return refusal(400, "invalid-json", "body must be canonical UTF-8 JSON"); }
  if (document === null || typeof document !== "object" || Array.isArray(document)) {
    return refusal(400, "invalid-fields", "body must contain exactly one text field");
  }
  const record = document as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || typeof record.text !== "string") {
    return refusal(400, "invalid-fields", "body must contain exactly one text field");
  }
  if (JSON.stringify({ text: record.text }) !== source) {
    return refusal(400, "noncanonical-json", "body must use the canonical JSON encoding");
  }
  const text = encoder.encode(record.text);
  if (text.byteLength > MAX_TEXT_BYTES) {
    return refusal(413, "text-too-large", `text exceeds ${MAX_TEXT_BYTES} UTF-8 bytes`);
  }
  return text;
}

async function compute(path: string, text: Uint8Array): Promise<Record<string, unknown>> {
  if (path === "/v1/sha256") {
    return { algorithm: "sha256", contract: CONTRACT, digestHex: await sha256Hex(text), inputBytes: text.byteLength };
  }
  const key = await crypto.subtle.importKey("raw", arrayBuffer(text), "PBKDF2", false, ["deriveBits"]);
  const output = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: PBKDF2_SALT, iterations: PBKDF2_ITERATIONS },
    key,
    PBKDF2_OUTPUT_BITS,
  );
  return {
    algorithm: "pbkdf2-hmac-sha256",
    contract: CONTRACT,
    digestHex: hex(output),
    inputBytes: text.byteLength,
    iterations: PBKDF2_ITERATIONS,
    outputBytes: PBKDF2_OUTPUT_BITS / 8,
    saltDomain: decoder.decode(PBKDF2_SALT),
  };
}

export function createHandler(
  { verifySignature = verifyProductionSignature, now = () => Date.now() }:
  { verifySignature?: SignatureVerifier; now?: () => number } = {},
): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    if (url.search !== "") return refusal(404, "not-found", "operation does not exist");
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(200, { contract: CONTRACT, planAdmission: "free_verified-required", state: "ephemeral", status: "ready" });
    }
    if (request.method !== "POST") return refusal(405, "method-not-allowed", "use GET /health or POST to one v1 operation");
    if (url.pathname !== "/v1/sha256" && url.pathname !== "/v1/pbkdf2") {
      return refusal(404, "not-found", "operation does not exist");
    }
    if ((request.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return refusal(415, "unsupported-media-type", "Content-Type must be application/json");
    }
    const rawLength = request.headers.get("content-length") ?? "";
    if (!/^[0-9]+$/.test(rawLength)) return refusal(411, "length-required", "Content-Length is required");
    const length = Number(rawLength);
    if (length > MAX_BODY_BYTES) return refusal(413, "body-too-large", `body exceeds ${MAX_BODY_BYTES} bytes`);
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength !== length) return refusal(400, "invalid-length", "Content-Length does not match body bytes");
    if (!await verifySignature(request, body, now())) return refusal(401, "invalid-signature", "a recent valid Union signature is required");
    const text = parseCanonicalText(body);
    if (text instanceof Response) return text;
    return jsonResponse(200, await compute(url.pathname, text));
  };
}

if (import.meta.main) Deno.serve(createHandler());
