import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { discoverJsnodeServices } from "../src/discover-services.mjs";

const sectionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("fresh discovery resolves every admitted JSNode actuator", () => {
  const result = discoverJsnodeServices(sectionRoot);
  assert.deepEqual(result.refusals, []);
  assert.deepEqual(result.services.map(({ nodeId }) => nodeId), [
    "consumer-dependency-closure-installation-service",
    "deno-services-section",
    "discord-steward-check-service",
    "discord-steward-invite-service",
    "discord-steward-run-service",
    "flickering-delve-service",
    "function-movement-service",
    "javascript-node-services-section",
    "npm-services-section",
    "pnpm-services-section",
    "sandbox-command-execution-service",
    "software-edit-language-service",
    "software-mission-action-record-parser-service",
    "software-mission-customer-induction-service",
    "software-mission-execution-service",
    "software-program-synthesis-service",
    "software-program-synthesis-solicitation-service",
    "transform-javascript-script-to-skill-service",
    "transform-json-schema-to-typescript-service",
  ]);
});

test("JavaScript Node section owns the live JSNode services", () => {
  const nodeSectionRoot = join(sectionRoot, "services", "javascript-node-services-section");
  const result = discoverJsnodeServices(nodeSectionRoot);
  assert.deepEqual(result.refusals, []);
  assert.deepEqual(result.services.map(({ nodeId }) => nodeId), [
    "jsnode-observation-service",
    "jsnode-packaging-services-section",
  ]);
});

test("pnpm workspace section owns workspace fabrication", () => {
  const workspaceSectionRoot = join(sectionRoot, "services", "pnpm-services-section", "services", "pnpm-workspace-services-section");
  const result = discoverJsnodeServices(workspaceSectionRoot);
  assert.deepEqual(result.refusals, []);
  assert.deepEqual(result.services.map(({ nodeId }) => nodeId), [
    "pnpm-workspace-fabrication-service",
  ]);
});

test("Deno section owns every live Deno runtime service", () => {
  const denoSectionRoot = join(sectionRoot, "services", "deno-services-section");
  const result = discoverJsnodeServices(denoSectionRoot);
  assert.deepEqual(result.refusals, []);
  assert.deepEqual(result.services.map(({ nodeId }) => nodeId), [
    "deno-deploy-free-compute-provider",
    "jsnode-function-movement-cloud-provider",
  ]);
});

test("refuses a service whose package declares no name", () => {
  const root = mkdtempSync(join(tmpdir(), "jsnode-discovery-"));
  try {
    const service = join(root, "services", "unnamed");
    mkdirSync(service, { recursive: true });
    writeFileSync(join(service, "package.json"), JSON.stringify({ version: "1.0.0" }));
    assert.equal(discoverJsnodeServices(root).refusals[0].reason, "package must declare a name");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
