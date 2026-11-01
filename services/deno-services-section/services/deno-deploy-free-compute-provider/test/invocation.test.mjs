import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { findFreeVerifiedOrganization } from "../src/plan-admission.mjs";

test("settlement key signs the canonical invocation envelope", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const body = Buffer.from('{"text":"cedar fog"}');
  const timestamp = "1700000000";
  const message = Buffer.from(`POST\n/v1/sha256\n${timestamp}\n${createHash("sha256").update(body).digest("hex")}`);
  const signature = sign(null, message, privateKey);
  assert.equal(verify(null, message, publicKey, signature), true);
  assert.equal(signature.length, 64);
});

test("explicitly provisioned deployment key matches the published application key", { skip: !process.env.DENO_DEPLOY_SIGNING_PRIVATE_KEY_FILE }, () => {
  const privateKey = createPrivateKey(readFileSync(process.env.DENO_DEPLOY_SIGNING_PRIVATE_KEY_FILE));
  const expected = createPublicKey(privateKey).export({ type: "spki", format: "der" }).toString("base64");
  const source = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
  assert.equal(source.includes(`PUBLIC_KEY_SPKI_BASE64 = ${JSON.stringify(expected)}`), true);
});

test("admits only one exact free_verified organization", () => {
  assert.deepEqual(findFreeVerifiedOrganization([{ slug: "union", plan: "free_verified" }], "union"), {
    admitted: true,
    plan: "free_verified",
  });
  assert.deepEqual(findFreeVerifiedOrganization([{ slug: "union", plan: "pro" }], "union"), {
    admitted: false,
    reason: "free-verified-plan-required",
    observedPlan: "pro",
  });
  assert.deepEqual(findFreeVerifiedOrganization([], "union"), {
    admitted: false,
    reason: "exact-organization-required",
  });
});
