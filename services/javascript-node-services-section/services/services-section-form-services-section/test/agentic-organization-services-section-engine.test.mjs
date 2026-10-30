import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { catalog } from "../apps/agentic-organization-services-section-engine/src/cli.mjs";
import manifest from "../package.json" with { type: "json" };

const engine = fileURLToPath(new URL("../apps/agentic-organization-services-section-engine/src/cli.mjs", import.meta.url));

test("the engine is the section's one command, and every verb is a script's own operation", () => {
  assert.deepEqual(manifest.bin, { [catalog.name]: "apps/agentic-organization-services-section-engine/src/cli.mjs" });
  assert.deepEqual(Object.keys(catalog.operations).sort(), [
    "apply-services-section-normalization",
    "check-services-section-form-conformance",
    "derive-services-section-path",
    "fold-directory-entries-into-services-section-form",
    "found-services-section",
    "measure-services-section-fitness",
    "plan-services-section-normalization",
    "read-service-section",
    "read-services-section-tree",
  ]);
  for (const [verb, definition] of Object.entries(catalog.operations)) {
    assert.equal(typeof definition.operation, "function", verb);
    assert.equal(typeof definition.inputSchema, "object", verb);
  }
});

test("a verb reads one request per line and answers one value per line", () => {
  const request = { name: "widget-engineering-services-section", sections: ["engineering-services-section"] };
  const run = spawnSync(process.execPath, [engine, "derive-services-section-path"], { input: `${JSON.stringify(request)}\n`, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout.trim()).value ?? JSON.parse(run.stdout.trim()), {
    name: "widget-engineering-services-section",
    custody: "engineering",
    parent: "engineering-services-section",
    chain: ["engineering-services-section", "widget-engineering-services-section"],
    path: "services/engineering-services-section/services/widget-engineering-services-section",
  });
});

test("an unknown verb is refused", () => {
  const run = spawnSync(process.execPath, [engine, "invent-services-section"], { input: "", encoding: "utf8" });
  assert.equal(run.status, 2);
});
