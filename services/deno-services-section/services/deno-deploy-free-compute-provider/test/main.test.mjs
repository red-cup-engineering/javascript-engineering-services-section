import { createHandler, MAX_AUTHORIZATION_AGE_SECONDS, signatureMessage } from "../main.mjs";

function assert(condition, message = "assertion failed") {
  if (!condition) throw new Error(message);
}

async function body(response) {
  return await response.json();
}

function post(path, source, headers = {}) {
  return new Request(`https://assay.invalid${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": String(new TextEncoder().encode(source).byteLength), ...headers },
    body: source,
  });
}

const admitted = createHandler({ verifySignature: async () => true, now: () => 1_700_000_000_000 });

Deno.test("hosted-runner authorization remains short-lived but survives bounded admission", () => {
  assert(MAX_AUTHORIZATION_AGE_SECONDS === 900);
});

Deno.test("health is deterministic and names free plan admission", async () => {
  const first = await body(await admitted(new Request("https://assay.invalid/health")));
  const second = await body(await admitted(new Request("https://assay.invalid/health")));
  assert(JSON.stringify(first) === JSON.stringify(second));
  assert(first.planAdmission === "free_verified-required");
});

Deno.test("computes deterministic SHA-256", async () => {
  const result = await body(await admitted(post("/v1/sha256", '{"text":"cedar fog"}')));
  assert(result.digestHex === "d493968784e7c721a355127d4252ef04a000a28b4f6f7353e6e05bdd7ab6ae13");
  assert(result.inputBytes === 9);
});

Deno.test("computes provider-fixed PBKDF2", async () => {
  const result = await body(await admitted(post("/v1/pbkdf2", '{"text":"cedar fog"}')));
  assert(result.algorithm === "pbkdf2-hmac-sha256");
  assert(result.iterations === 120_000);
  assert(result.outputBytes === 32);
});

Deno.test("refuses noncanonical and duplicate JSON", async () => {
  for (const source of ['{ "text": "x" }', '{"text":"first","text":"second"}']) {
    const response = await admitted(post("/v1/sha256", source));
    assert(response.status === 400);
  }
});

Deno.test("refuses oversized text and bodies", async () => {
  const textResponse = await admitted(post("/v1/sha256", JSON.stringify({ text: "x".repeat(4097) })));
  assert(textResponse.status === 413);
  const bodyResponse = await admitted(new Request("https://assay.invalid/v1/sha256", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "6145" },
    body: "x",
  }));
  assert(bodyResponse.status === 413);
});

Deno.test("refuses invalid signatures before compute", async () => {
  const refusing = createHandler({ verifySignature: async () => false });
  const response = await refusing(post("/v1/pbkdf2", '{"text":"x"}'));
  assert(response.status === 401);
});

Deno.test("production signature format verifies Ed25519 messages", async () => {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const request = post("/v1/sha256", '{"text":"x"}');
  const bytes = new TextEncoder().encode('{"text":"x"}');
  const message = await signatureMessage(request, bytes, "1700000000");
  const signature = await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, new Uint8Array(message).buffer);
  assert(await crypto.subtle.verify({ name: "Ed25519" }, pair.publicKey, signature, new Uint8Array(message).buffer));
});

Deno.test("refuses query strings, unknown operations, and other methods", async () => {
  assert((await admitted(new Request("https://assay.invalid/health?x=1"))).status === 404);
  assert((await admitted(post("/v1/fetch", '{"text":"https://example.test"}'))).status === 404);
  assert((await admitted(new Request("https://assay.invalid/v1/sha256", { method: "PUT" }))).status === 405);
});
