import test from "node:test";
import assert from "node:assert/strict";
import { dataKindDirectory, serviceLogAddress } from "@red-cup-engineering/eavt-services-section/data-artifact-address";
import { hirerOf, placeDataPath, planServicesSectionNormalization } from "../scripts/plan-services-section-normalization.mjs";

const taxonomy = {
  custodyStems: [],
  contentTaxonomyPaths: [],
  notesDatedPathPattern: ".*",
  dataTrioNames: ["logs", "records", "state"],
  knownTopLevelNames: ["README.md", "package.json", ".gitignore", "content", "data", "src", "scripts", "test"],
  relocations: [
    { from: "records/", to: "data/records/service-records/", rule: "service-records-under-data", reason: "r" },
    { from: "content/requirements/", to: "data/records/service-records/requirements-management-service-records/", rule: "requirements-are-service-records", reason: "r" },
    { from: "data/schemas/", to: "data/records/schemas/", rule: "schemas-under-data-records", reason: "old data rule the law now owns" },
  ],
  unplaceable: [],
};
const plan = (entries, extra = {}) => planServicesSectionNormalization({ path: "services/demo-services-section", entries: ["scripts/a.mjs", ...entries], ...extra }, taxonomy).filter((item) => item.from !== "scripts/a.mjs");
const only = (entries, extra) => Object.fromEntries(plan(entries, extra).map((item) => [item.from, item]));
const hirer = "demo";

test("the hirer is the section's name without -services-section", () => {
  assert.equal(hirerOf("services/demo-services-section"), "demo");
  assert.equal(hirerOf("/x/y/credential-custody-service"), null);
  assert.equal(hirerOf("services-section"), null);
});

test("each tier's older <x>-<tier> directory maps to the law's directory for (tier, x)", () => {
  assert.equal(placeDataPath("data/records/custody-records/a/b.json").to, `${dataKindDirectory("", "record", "custody")}/a/b.json`);
  assert.equal(placeDataPath("data/records/custody-records/a/b.json").to, "data/records/service-records/custody-service-records/a/b.json");
  assert.equal(placeDataPath("data/state/clock-state/now.json").to, dataKindDirectory("", "state", "clock") + "/now.json");
  assert.equal(placeDataPath("data/state/clock-state/now.json").to, "data/state/clock-service-state/now.json");
  assert.equal(placeDataPath("data/logs/arrival-logs/2026-10-04/x.json").to, "data/logs/service-logs/arrival-service-logs/2026-10-04/x.json");
});

test("a bare <x>-service-<tier> directory under the tier root, or the law's half-way form, is completed", () => {
  assert.equal(placeDataPath("data/records/custody-service-records/a.json").to, "data/records/service-records/custody-service-records/a.json");
  assert.equal(placeDataPath("data/records/service-records/custody-records/a.json").to, "data/records/service-records/custody-service-records/a.json");
  assert.equal(placeDataPath("data/state/clock-service-state/a.json"), null);
});

test("paths the law already files are left alone", () => {
  for (const path of [
    "data/records/service-records/custody-service-records/a.json",
    "data/state/clock-service-state/a.json",
    serviceLogAddress({ root: "", hirer, service: "arrival", at: "2026-10-04" }).path,
  ]) assert.equal(placeDataPath(path, { hirer }), null, path);
});

test("a dated log file maps into the dated service-log layout", () => {
  const placed = placeDataPath("data/logs/arrival-logs/2026-10-04.jsonl", { hirer });
  assert.equal(placed.to, serviceLogAddress({ root: "", hirer, service: "arrival", at: "2026-10-04" }).path);
  assert.equal(placed.to, "data/logs/service-logs/arrival-service-logs/2026/10/04/2026-10-04-demo-arrival-service-log.jsonl");
  assert.equal(placeDataPath("data/logs/service-logs/arrival-service-logs/2026-10-04-extra.jsonl", { hirer }).to, "data/logs/service-logs/arrival-service-logs/2026/10/04/2026-10-04-demo-arrival-service-log.jsonl");
});

test("a log without a date in its name keeps its path under the law's directory", () => {
  assert.equal(placeDataPath("data/logs/arrival-logs/notes.jsonl", { hirer }).to, "data/logs/service-logs/arrival-service-logs/notes.jsonl");
  assert.equal(placeDataPath("data/logs/arrival-logs/2026-10-04.md", { hirer }).to, "data/logs/service-logs/arrival-service-logs/2026-10-04.md");
});

test("a dated log with no derivable hirer, or a service that is not a type name, is unplaceable", () => {
  assert.deepEqual(placeDataPath("data/logs/arrival-logs/2026-10-04.jsonl", { hirer: null }).to, null);
  assert.equal(placeDataPath("data/logs/arrival-logs/2026-10-04.jsonl", { hirer: null }).rule, "log-hirer-unknown");
  const digits = placeDataPath("data/logs/hashn-acquisition-20261024-logs/a.json");
  assert.equal(digits.to, null);
  assert.equal(digits.rule, "data-service-not-a-type-name");
});

test("data that fits no tier is unplaceable with its path, never moved", () => {
  const items = only(["data/custody/objects/a.json", "data/ledgers/exchanges/x.jsonl", "data/journals/j.jsonl", "data/builds/a/b.txt", "data/loose.json", "data/records/service-section.json", "data/logs/service-logs/orphan.jsonl", "data/records/history/2026/a.json"]);
  assert.equal(items["data/custody/objects/a.json"].rule, "data-fits-no-tier");
  assert.equal(items["data/ledgers/exchanges/x.jsonl"].rule, "data-fits-no-tier");
  assert.equal(items["data/journals/j.jsonl"].rule, "data-fits-no-tier");
  assert.equal(items["data/builds/a/b.txt"].rule, "data-fits-no-tier");
  assert.equal(items["data/loose.json"].rule, "data-fits-no-tier");
  assert.equal(items["data/records/service-section.json"].rule, "data-has-no-service-directory");
  assert.equal(items["data/logs/service-logs/orphan.jsonl"].rule, "data-has-no-service-directory");
  assert.equal(items["data/records/history/2026/a.json"].rule, "data-fits-no-service-directory");
  for (const item of Object.values(items)) assert.equal(item.to, null);
});

test("hash-named shards are reported, not renamed", () => {
  const items = only(["data/records/ledger-entry-records/sha-256/ab.jsonl", "data/state/clock-state/sha-256/00.jsonl"]);
  for (const item of Object.values(items)) { assert.equal(item.to, null); assert.equal(item.rule, "hash-sharded-not-renamed"); }
  assert.equal(plan(["data/records/ledger-entry-records/sha-256/ab.jsonl"]).length, 1);
});

test("the planner takes data destinations from the law, ignoring the Group's older data relocations", () => {
  const items = only(["data/records/custody-records/a.json", "data/schemas/x.schema.json", "data/records/service-records/requirements-management-service-records/ok.json"], {});
  assert.equal(items["data/records/custody-records/a.json"].to, "data/records/service-records/custody-service-records/a.json");
  assert.equal(items["data/records/custody-records/a.json"].rule, "eavt-data-law");
  assert.equal(items["data/schemas/x.schema.json"].rule, "data-fits-no-tier");
  assert.equal(items["data/records/service-records/requirements-management-service-records/ok.json"], undefined);
});

test("a taxonomy relocation into data/ is kept when the law files its destination and reported when it does not", () => {
  const items = only(["content/requirements/r.json", "records/node-a/card.json"]);
  assert.equal(items["content/requirements/r.json"].to, "data/records/service-records/requirements-management-service-records/r.json");
  assert.equal(items["content/requirements/r.json"].rule, "requirements-are-service-records");
  assert.equal(items["records/node-a/card.json"].to, null);
  assert.match(items["records/node-a/card.json"].reason, /service-records-under-data bound it for data\/records\/service-records\/node-a\/card.json/);
});

test("two paths bound for one destination, an occupied destination and a submodule are reported, not moved", () => {
  const items = Object.fromEntries(plan([
    "data/logs/arrival-logs/2026-10-04.jsonl", "data/logs/arrival-logs/2026-10-04-again.jsonl",
    "data/records/a-records/f.json", "data/records/service-records/a-service-records/f.json",
    "data/state/b-state/sub",
  ], { gitlinks: ["data/state/b-state/sub"] }).map((item) => [item.from, item]));
  assert.equal(items["data/logs/arrival-logs/2026-10-04.jsonl"].rule, "destination-collision");
  assert.equal(items["data/logs/arrival-logs/2026-10-04-again.jsonl"].rule, "destination-collision");
  assert.equal(items["data/records/a-records/f.json"].rule, "destination-occupied");
  assert.equal(items["data/state/b-state/sub"].rule, "gitlink-not-moved");
  assert.ok(Object.values(items).every((item) => item.to === null));
});
