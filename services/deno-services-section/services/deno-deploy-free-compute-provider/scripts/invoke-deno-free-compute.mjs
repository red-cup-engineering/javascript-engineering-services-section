#!/usr/bin/env node
import { createPrivateKey, sign } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { findFreeVerifiedOrganization } from "../src/plan-admission.mjs";
import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

const runFile = promisify(execFile);

async function assertFreeVerified(phase) {
  if (!process.env.DENO_DEPLOY_TOKEN) throw new Error("DENO_DEPLOY_TOKEN is required for plan admission");
  const slug = process.env.DENO_DEPLOY_ORG_SLUG;
  if (!slug) throw new Error("DENO_DEPLOY_ORG_SLUG is required for plan admission");
  const { stdout } = await runFile(process.env.DENO_BIN ?? "deno", [
    "deploy", "orgs", "list", "--json", "--non-interactive",
  ]);
  const decision = findFreeVerifiedOrganization(JSON.parse(stdout), slug);
  if (!decision.admitted) throw new Error(`${phase} invocation refused: ${decision.reason}`);
}

const [baseUrl, operation, text, ...extra] = process.argv.slice(2);
if (!baseUrl || !["sha256", "pbkdf2"].includes(operation) || text === undefined || extra.length) {
  throw new Error("usage: invoke-deno-free-compute HTTPS_BASE_URL sha256|pbkdf2 TEXT");
}
const endpoint = new URL(`/v1/${operation}`, baseUrl);
if (endpoint.protocol !== "https:") throw new Error("Deno compute endpoint must use HTTPS");
const textBytes = Buffer.from(text, "utf8");
if (textBytes.length > 4096) throw new Error("text exceeds 4096 UTF-8 bytes");
const body = Buffer.from(JSON.stringify({ text }), "utf8");
if (body.length > 6144) throw new Error("body exceeds 6144 bytes");
const timestamp = String(Math.floor(Date.now() / 1000));
const message = Buffer.from(`POST\n${endpoint.pathname}\n${timestamp}\n${sha256Hex(body)}`, "utf8");
const keyPath = process.env.DENO_FREE_COMPUTE_SIGNING_KEY
  ?? fileURLToPath(new URL("../data/request-signing-private.pem", import.meta.url));
const privateKey = createPrivateKey(await readFile(keyPath));
const signature = sign(null, message, privateKey).toString("base64url");
await assertFreeVerified("preflight");
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "content-length": String(body.length),
    "x-union-timestamp": timestamp,
    "x-union-signature": signature,
  },
  body,
});
const result = await response.json();
if (!response.ok) throw new Error(`Deno compute refused with ${response.status}: ${result.error ?? "unknown"}`);
await assertFreeVerified("postflight");
process.stdout.write(`${JSON.stringify(result)}\n`);
