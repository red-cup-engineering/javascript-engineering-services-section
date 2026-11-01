import test from "node:test";
import assert from "node:assert/strict";
import { isOpaqueName, planServicesSectionNormalization } from "../scripts/plan-services-section-normalization.mjs";

const taxonomy = {
  custodyStems: [],
  contentTaxonomyPaths: [],
  notesDatedPathPattern: ".*",
  dataTrioNames: ["logs", "records", "state"],
  knownTopLevelNames: ["README.md", "package.json", "package-lock.json", ".gitignore", "content", "data", "src", "scripts", "apps", "test", "publications", "services", "lib", "node_modules"],
  relocations: [
    { from: "records/", to: "data/records/service-records/", rule: "service-records-under-data", reason: "service records live at data/records/service-records/" },
    { from: "schemas/", to: "data/records/schemas/", rule: "schemas-under-data-records", reason: "schemas live at data/records/schemas/" },
    { from: "content/requirements/", to: "data/records/service-records/requirements-management-service-records/", rule: "requirements-are-service-records", reason: "requirement records are the requirement-management service's records" },
  ],
  unplaceable: [
    { from: "content/text/documents/articles/specifications/", rule: "specifications-have-the-ietf-form-and-live-in-engineering", reason: "not a specification in IETF form; its owner reclassifies it" },
  ],
};

const plan = (entries) => planServicesSectionNormalization({ path: "services/internal-services-section", entries }, taxonomy);
const byFrom = (items) => Object.fromEntries(items.map((item) => [`${item.rule}:${item.from}`, item.to]));

test("the law's relocations derive each destination, keeping the rest of the path", () => {
  const items = byFrom(plan(["README.md", "records/node-a/agent-card.json", "schemas/office.schema.json", "content/requirements/no-sqlite-flatfiles-only.json"]));
  assert.equal(items["service-records-under-data:records/node-a/agent-card.json"], undefined, "a destination with no <service> directory is the data law's to refuse");
  assert.equal(items["data-fits-no-service-directory:records/node-a/agent-card.json"], null);
  assert.equal(items["schemas-under-data-records:schemas/office.schema.json"], undefined, "data/records/schemas/ is no tier directory of the data law");
  assert.equal(items["data-fits-no-service-directory:schemas/office.schema.json"], null);
  assert.equal(items["requirements-are-service-records:content/requirements/no-sqlite-flatfiles-only.json"], "data/records/service-records/requirements-management-service-records/no-sqlite-flatfiles-only.json");
});

test("strays, data outside logs/records/state, and tests without code are owed to their owners", () => {
  const items = byFrom(plan(["README.md", "vendor/causeway/index.mjs", "data/custody/objects/a.json", "data/logs/arrival-logs/2026-10-04.jsonl", "test/thing.test.mjs"]));
  assert.equal(items["stray-top-level:vendor/causeway/index.mjs"], null);
  assert.equal(items["data-fits-no-tier:data/custody/objects/a.json"], null);
  assert.equal(items["tests-live-with-their-code:test/thing.test.mjs"], null);
  assert.equal(items["eavt-data-law:data/logs/arrival-logs/2026-10-04.jsonl"], "data/logs/service-logs/arrival-service-logs/2026/10/04/2026-10-04-internal-arrival-service-log.jsonl");
});

test("a test beside the code it tests stays", () => {
  assert.deepEqual(plan(["scripts/run-x.mjs", "test/run-x.test.mjs"]), []);
});

test("unplaceable prefixes and opaque names are reported without a destination", () => {
  const items = byFrom(plan(["content/text/documents/articles/specifications/2026-10-24-go-to-market.md", "inference-receiving/210e74fb395292a84628a7822376a5bf/attempt-0.json"]));
  assert.equal(items["specifications-have-the-ietf-form-and-live-in-engineering:content/text/documents/articles/specifications/2026-10-24-go-to-market.md"], null);
  assert.equal(items["stray-top-level:inference-receiving/210e74fb395292a84628a7822376a5bf/attempt-0.json"], null);
  assert.equal(items["named-not-hashed:inference-receiving/210e74fb395292a84628a7822376a5bf/attempt-0.json"], null);
});

test("opaque names are hashes and tokens, not words", () => {
  for (const name of ["210e74fb395292a84628a7822376a5bf", "pdkfOD_NkJ5jzl5zS55_yWOk", "43.jsonl".replace("43", "a3f9c2d4e5b6a7980112")]) assert.equal(isOpaqueName(name), true, name);
  for (const name of ["agent-card.json", "attempt-0.json", "2026-10-04.jsonl", "services-section-form.schema.json", "README.md"]) assert.equal(isOpaqueName(name), false, name);
});
