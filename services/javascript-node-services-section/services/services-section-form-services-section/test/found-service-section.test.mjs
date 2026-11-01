import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { cell } from "@red-cup-engineering/signcraft/cell";
import { foundServicesSection } from "../scripts/found-services-section.mjs";
import { readServicesSectionTree } from "../scripts/read-services-section-tree.mjs";
import { readServiceSection, SERVICE_SECTION_VOCABULARY as vocabulary } from "../src/service-section.mjs";
import { hypotheticalServiceSection, purpose, subjects } from "./fixtures/service-section.mjs";
import { installSectionLaw } from "./section-law-fixture.mjs";

const sectionPath = "services/public-services-section/services/hypothetical-observation-services-section";
const recordPath = "data/records/service-section.json";

async function foundingRequest(t) {
  const root = await mkdtemp(resolve(tmpdir(), "found-native-service-section-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await installSectionLaw(root);
  return {
    root,
    path: sectionPath,
    name: "hypothetical-observation-services-section",
    packageDescription: "A hypothetical fixture for native Service Section founding.",
  };
}

async function placeRecord(request, text) {
  const path = resolve(request.root, request.path, recordPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  return path;
}

test("founding persists the native document and the existing tree reads the same missing and contested source", async t => {
  const request = await foundingRequest(t);
  const document = hypotheticalServiceSection();
  document.cells.push(cell(subjects.section, vocabulary.purpose, purpose,
    { against: [{ kind: "hypothetical-test-objection", revision: "2" }] }));
  document.cells = document.cells.filter(at => !(at.subject === subjects.calibration && at.predicate === vocabulary.setting));
  const result = await foundServicesSection({ ...request, serviceSection: document });
  const text = await readFile(resolve(request.root, request.path, recordPath), "utf8");
  const persisted = JSON.parse(text);

  assert.equal(text.split("\n").length, 2, "the native record is directly consumable as one NDJSON line");
  assert.deepEqual(persisted, readServiceSection(document).document);
  assert.deepEqual(result.created.slice().sort(), ["README.md", "package.json", recordPath].sort());
  assert.deepEqual(result.skipped, []);
  assert.deepEqual(result.serviceSection, readServiceSection(persisted));
  assert.equal(result.serviceSection.contests.length, 1);
  assert.deepEqual(result.serviceSection.missing,
    [{ role: "calibration", subject: subjects.calibration, predicate: vocabulary.setting }]);
  assert.deepEqual(result.serviceSection.hull.offers[0].programs[0].program.fields.evidence, []);
  const tree = await readServicesSectionTree({ root: request.root });
  const received = tree.sections.find(section => section.form.path === request.path);
  assert.deepEqual(received.serviceSection, result.serviceSection);
});

test("omitting the document preserves directory-only founding without inventing a Section", async t => {
  const request = await foundingRequest(t);
  const result = await foundServicesSection(request);
  assert.deepEqual(result.created.slice().sort(), ["README.md", "package.json"]);
  assert.deepEqual(result.skipped, []);
  assert.equal(Object.hasOwn(result, "serviceSection"), false);
  assert.equal(existsSync(resolve(request.root, request.path, recordPath)), false);
});

test("existing source wins over a different valid request and unrelated files retain their bytes", async t => {
  const request = await foundingRequest(t);
  const existing = hypotheticalServiceSection();
  await foundServicesSection({ ...request, serviceSection: existing });
  const record = resolve(request.root, request.path, recordPath);
  const before = await readFile(record, "utf8");
  const readme = resolve(request.root, request.path, "README.md");
  const unrelated = resolve(request.root, request.path, "data/records/unrelated.json");
  await mkdir(dirname(unrelated), { recursive: true });
  await writeFile(unrelated, '{"fixture":"preserve this unrelated source"}\n');
  await writeFile(readme, "# A separately edited README\n");
  const requested = hypotheticalServiceSection();
  requested.source.revision = "requested-but-not-written";
  requested.cells.push(cell(subjects.section, vocabulary.context, "urn:example:different-context",
    { for: [{ kind: "hypothetical-test-authorship", revision: "2" }] }));

  const result = await foundServicesSection({ ...request, serviceSection: requested });
  assert.deepEqual(result.created, []);
  assert.deepEqual(result.skipped.slice().sort(), ["README.md", "package.json", recordPath].sort());
  assert.equal(await readFile(record, "utf8"), before);
  assert.equal(await readFile(readme, "utf8"), "# A separately edited README\n");
  assert.equal(await readFile(unrelated, "utf8"), '{"fixture":"preserve this unrelated source"}\n');
  assert.deepEqual(result.serviceSection, readServiceSection(JSON.parse(before)));
  assert.notEqual(result.serviceSection.snapshot, readServiceSection(requested).snapshot);
  assert.equal(result.serviceSection.document.source.revision, existing.source.revision);
});

test("an existing document is read and returned even when the optional input is absent", async t => {
  const request = await foundingRequest(t);
  const document = hypotheticalServiceSection();
  const bytes = JSON.stringify(document, null, 2) + "\n";
  const record = await placeRecord(request, bytes);
  const result = await foundServicesSection(request);
  assert.deepEqual(result.created.slice().sort(), ["README.md", "package.json"]);
  assert.deepEqual(result.skipped, [recordPath]);
  assert.equal(await readFile(record, "utf8"), bytes, "existing formatting is not rewritten");
  assert.deepEqual(result.serviceSection, readServiceSection(document));
});

test("invalid supplied native documents fail before any section or parent mutation", async t => {
  const request = await foundingRequest(t);
  const parentReadme = resolve(request.root, "services/public-services-section/README.md");
  await mkdir(dirname(parentReadme), { recursive: true });
  await writeFile(parentReadme, "# Existing parent\n");
  const unrepresentedProgram = hypotheticalServiceSection();
  unrepresentedProgram.cells = unrepresentedProgram.cells.filter(at => at.subject !== subjects.program);
  for (const serviceSection of [null, undefined, unrepresentedProgram]) {
    await assert.rejects(foundServicesSection({ ...request, serviceSection,
      parentReadmeSentence: "This must not be appended.", brand: "Hypothetical fixture" }), TypeError);
    assert.equal(existsSync(resolve(request.root, request.path)), false);
    assert.equal(await readFile(parentReadme, "utf8"), "# Existing parent\n");
  }
});

test("a malformed supplied document is refused even when a valid existing document would win", async t => {
  const request = await foundingRequest(t);
  const bytes = JSON.stringify(hypotheticalServiceSection()) + "\n";
  const record = await placeRecord(request, bytes);
  await assert.rejects(foundServicesSection({ ...request, serviceSection: null }), TypeError);
  assert.equal(await readFile(record, "utf8"), bytes);
  assert.equal(existsSync(resolve(request.root, request.path, "README.md")), false);
  assert.equal(existsSync(resolve(request.root, request.path, "package.json")), false);
});

test("malformed existing source refuses before founding writes instead of being replaced", async t => {
  const request = await foundingRequest(t);
  const parentReadme = resolve(request.root, "services/public-services-section/README.md");
  await mkdir(dirname(parentReadme), { recursive: true });
  await writeFile(parentReadme, "# Existing parent\n");
  for (const malformed of ["{", "null", Buffer.from([0x7b, 0xff, 0x7d])]) {
    const record = await placeRecord(request, malformed);
    await assert.rejects(foundServicesSection({ ...request, serviceSection: hypotheticalServiceSection(),
      parentReadmeSentence: "This must not be appended.", brand: "Hypothetical fixture" }));
    assert.deepEqual(await readFile(record), Buffer.from(malformed));
    assert.equal(existsSync(resolve(request.root, request.path, "README.md")), false);
    assert.equal(existsSync(resolve(request.root, request.path, "package.json")), false);
    assert.equal(existsSync(resolve(request.root, request.path, "data/records/service-records")), false);
    assert.equal(await readFile(parentReadme, "utf8"), "# Existing parent\n");
  }
});

test("the optional native document cannot execute an accessor before filesystem effects", async t => {
  const request = await foundingRequest(t);
  let calls = 0;
  Object.defineProperty(request, "serviceSection", { get() { calls += 1; return hypotheticalServiceSection(); } });
  await assert.rejects(foundServicesSection(request), /serviceSection must be a supplied data document/u);
  assert.equal(calls, 0);
  assert.equal(existsSync(resolve(request.root, request.path)), false);
});
