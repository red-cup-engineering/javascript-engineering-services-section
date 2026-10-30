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
    "discord-steward-check-service",
    "discord-steward-invite-service",
    "discord-steward-run-service",
    "flickering-delve-service",
    "function-movement-service",
    "jsnode-observation-service",
    "sandbox-command-execution-service",
    "software-edit-language-service",
    "software-mission-action-record-parser-service",
    "software-mission-customer-induction-service",
    "software-mission-execution-service",
    "software-program-synthesis-service",
    "software-program-synthesis-solicitation-service",
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
