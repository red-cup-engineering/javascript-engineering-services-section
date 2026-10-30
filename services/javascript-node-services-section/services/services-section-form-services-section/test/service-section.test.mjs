import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";
import { cell, coincides } from "@red-cup-engineering/signcraft/cell";
import {
  SERVICE_SECTION_KIND,
  SERVICE_SECTION_VOCABULARY as vocabulary,
  SERVICE_SECTION_PROFILE as profile,
  readServiceSection,
} from "../src/service-section.mjs";
import { hypotheticalServiceSection, purpose, subjects } from "./fixtures/service-section.mjs";
import { operationDefinition } from "../scripts/read-service-section.mjs";

test("one native source section exposes the user-value hull, Hoare program and calibrated Huidu kernel", () => {
  const result = readServiceSection(hypotheticalServiceSection());
  assert.equal(result.document.kind, SERVICE_SECTION_KIND);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.contests, []);
  assert.equal(result.hull.offers.length, 1);
  const offer = result.hull.offers[0];
  for (const name of ["provider", "user", "outcome", "valueMeasure", "valueAllocation", "program"])
    assert.equal(offer.offer.fields[name].length, 1, name + " remains a sourced claim");
  assert.equal(offer.programs.length, 1);
  const program = offer.programs[0].program;
  for (const name of ["precondition", "move", "postcondition", "preservationObligation"])
    assert.equal(program.fields[name].length, 1, name + " is represented separately");
  assert.deepEqual(program.fields.evidence, [], "a represented contract does not invent proof or execution evidence");
  assert.equal(result.kernels.length, 1);
  const kernel = result.kernels[0];
  assert.equal(kernel.programs[0].program, program, "the hull and kernel read the same program in one source cut");
  assert.equal(kernel.kernel.fields.purpose.length, 1);
  assert.equal(kernel.kernel.fields.invariant.length, 1);
  assert.equal(result.governance.length, 1);
  assert.equal(result.governance[0].offer, subjects.offer);
  assert.equal(result.governance[0].program, subjects.program);
  assert.equal(result.governance[0].bindings[0].kernel, subjects.kernel);
  assert.equal(result.governance[0].bindings[0].link, kernel.kernel.fields.governs[0]);
  const calibration = kernel.calibrations[0].calibration;
  for (const name of ["axis", "admissibleRegion", "setting", "revisit"])
    assert.equal(calibration.fields[name].length, 1, name + " remains explicit");
  for (const [role, fields] of Object.entries(profile))
    assert.ok(fields.every(field => typeof field.required === "boolean"), role + " declares field presence obligations");
  assert.equal(Object.hasOwn(result, "approved"), false);
  assert.equal(Object.hasOwn(result, "status"), false);
  assert.equal(Object.hasOwn(result, "sourceAuthority"), false);
  assert.equal(Object.hasOwn(result, "observationCutoff"), false);
});

test("specialized section purpose retains general support and local opposition without turning stable into approval", () => {
  const document = hypotheticalServiceSection();
  const objection = { kind: "test-fixture-objection", revision: "2" };
  document.cells.push(cell(subjects.section, vocabulary.purpose, purpose, { against: [objection] }));
  const result = readServiceSection(document);
  const entry = result.section.fields.purpose[0];
  assert.equal(entry.reading, "stable");
  assert.equal(entry.cell.for.length, 1);
  assert.deepEqual(entry.cell.against, [objection]);
  assert.deepEqual(entry.sources.map(source => source.token).sort(), [subjects.section, subjects.template].sort());
  assert.deepEqual(entry.contested.for, [subjects.template]);
  assert.deepEqual(entry.contested.against, [subjects.section]);
  assert.ok(result.sourceSection.entries.includes(entry));
  assert.ok(result.contests.includes(entry));
  assert.equal(result.missing.some(item => item.predicate === vocabulary.purpose), false);
  assert.equal(Object.hasOwn(entry, "approved"), false);
});

test("an absent required declaration differs from an explicit unknown claim", () => {
  const document = hypotheticalServiceSection();
  document.cells = document.cells.filter(at => !(at.subject === subjects.calibration && at.predicate === vocabulary.setting));
  const absent = readServiceSection(document);
  assert.deepEqual(absent.kernels[0].calibrations[0].calibration.fields.setting, []);
  assert.deepEqual(absent.missing, [{ role: "calibration", subject: subjects.calibration, predicate: vocabulary.setting }]);

  document.cells.push(cell(subjects.calibration, vocabulary.setting, "urn:example:setting:unmeasured"));
  const unknown = readServiceSection(document);
  const entry = unknown.kernels[0].calibrations[0].calibration.fields.setting[0];
  assert.equal(entry.reading, "absurd");
  assert.deepEqual(entry.cell.for, []);
  assert.deepEqual(entry.cell.against, []);
  assert.deepEqual(unknown.missing, [], "represented unknown is not absent and does not become positive testimony");
});

test("the complete source section crosses native page boundaries without dropping claims", () => {
  const document = hypotheticalServiceSection();
  const extra = Array.from({ length: 141 }, (_, index) =>
    cell(subjects.section, "urn:example:extra-predicate:" + index, index, { for: ["hypothetical-pagination-fixture"] }));
  document.cells.push(...extra);
  const result = readServiceSection(document);
  assert.equal(result.sourceSection.pages.length, 2);
  assert.equal(result.sourceSection.pages[0].entries.length, 128);
  assert.equal(result.sourceSection.pages.at(-1).next, null);
  assert.equal(result.sourceSection.entries.length, result.sourceSection.pages[0].total);
  for (const at of extra)
    assert.equal(result.sourceSection.entries.filter(entry => coincides(entry.cell.predicate, at.predicate)).length, 1);
  for (const page of result.sourceSection.pages) {
    assert.equal(page.snapshot, result.snapshot);
    assert.equal(page.sourceCells, result.sourceCells);
  }
});

test("the admitted snapshot and nested witnesses survive mutations to the source wire aliases", () => {
  const document = JSON.parse(JSON.stringify(hypotheticalServiceSection()));
  const result = readServiceSection(document);
  const before = JSON.stringify(result);
  document.source.revision = "changed-after-read";
  const originalPurpose = document.cells.find(at => at.subject === subjects.template && at.predicate === vocabulary.purpose);
  originalPurpose.object.description = "A different purpose supplied after the read.";
  originalPurpose.for[0].revision = "changed-after-read";
  assert.equal(JSON.stringify(result), before);
  assert.equal(result.document.source.revision, "1");
  assert.equal(result.section.fields.purpose[0].cell.object.description, purpose.description);
  const later = readServiceSection(document);
  assert.notEqual(later.snapshot, result.snapshot);
  assert.notEqual(later.sourceCells, result.sourceCells);
});

test("linked programs need an actually represented source token rather than a fabricated empty section", () => {
  const document = hypotheticalServiceSection();
  document.cells = document.cells.filter(at => at.subject !== subjects.program);
  assert.throws(() => readServiceSection(document), /not a token of this frame/u);
});

test("native cells with unwitnessed asserted truth cannot become admitted service claims", () => {
  const document = hypotheticalServiceSection();
  document.cells.push(cell(subjects.section, vocabulary.evidence, "urn:example:invented:success", { value: "potential" }));
  assert.throws(() => readServiceSection(document), /value must be witnessed/u);
});

test("two described offers remain distinct even when they share one program", () => {
  const document = hypotheticalServiceSection();
  const second = "urn:example:offer:second-temperature-summary";
  document.cells.push(cell(subjects.section, vocabulary.offers, second, { for: ["hypothetical-second-offer"] }));
  document.cells.push(cell(second, "specializes", subjects.offer, { for: ["hypothetical-offer-classification"] }));
  const result = readServiceSection(document);
  assert.equal(result.hull.offers.length, 2);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.hull.offers.map(item => item.offer.subject).sort(), [subjects.offer, second].sort());
  assert.equal(result.hull.offers[0].programs[0].program, result.hull.offers[1].programs[0].program);
});

test("own and inherited accessors are refused before executing received source code", () => {
  let executed = 0;
  const getter = () => { executed += 1; return "urn:example:unsafe-source"; };
  const inherited = hypotheticalServiceSection();
  inherited.source = Object.create({ get resource() { return getter(); }, revision: "1" });
  assert.throws(() => readServiceSection(inherited), /plain data prototype/u);

  const own = hypotheticalServiceSection();
  own.source = { get resource() { return getter(); }, revision: "1" };
  assert.throws(() => readServiceSection(own), /own declared data fields/u);

  const envelope = hypotheticalServiceSection();
  Object.defineProperty(envelope, "source", { get: getter });
  assert.throws(() => readServiceSection(envelope), /own declared data fields/u);

  const incomplete = hypotheticalServiceSection();
  delete incomplete.source.revision;
  assert.throws(() => readServiceSection(incomplete), /own declared data fields/u);
  assert.equal(executed, 0, "data admission must not invoke a producer's getter");
});

test("the kernel's control program can govern a distinct offered program through its original claim", () => {
  const document = hypotheticalServiceSection();
  const controller = "urn:example:program:adjust-measurement-tolerance";
  document.cells = document.cells.filter(at => !(at.subject === subjects.kernel && at.predicate === vocabulary.program));
  const told = (subject, predicate, object) => cell(subject, predicate, object, { for: ["hypothetical-controller-fixture"] });
  document.cells.push(
    told(subjects.kernel, vocabulary.program, controller),
    told(controller, vocabulary.precondition, "urn:example:assertion:calibration-review-triggered"),
    told(controller, vocabulary.move, "urn:example:move:adjust-tolerance-within-region"),
    told(controller, vocabulary.postcondition, "urn:example:assertion:calibration-setting-recorded"),
    told(controller, vocabulary.preservationObligation, "urn:example:obligation:retain-offered-program-invariants"),
  );
  const result = readServiceSection(document);
  assert.deepEqual(result.missing, []);
  assert.equal(result.kernels[0].programs[0].program.subject, controller);
  assert.equal(result.hull.offers[0].programs[0].program.subject, subjects.program);
  assert.equal(result.governance[0].bindings.length, 1);
  assert.equal(result.governance[0].bindings[0].link, result.kernels[0].kernel.fields.governs[0]);
  assert.equal(result.governance[0].bindings[0].link.cell.object, subjects.program);

  // A declared governance relationship to some other program does not prove
  // that this offer is governed merely because all required fields exist.
  document.cells = document.cells.filter(at => !(at.subject === subjects.kernel && at.predicate === vocabulary.governs));
  document.cells.push(told(subjects.kernel, vocabulary.governs, controller));
  const unbound = readServiceSection(document);
  assert.deepEqual(unbound.missing, []);
  assert.deepEqual(unbound.governance[0].bindings, []);
  assert.equal(unbound.governance[0].program, subjects.program);
});

test("opposing and absent governance claims remain visible without authorizing a program", () => {
  const document = hypotheticalServiceSection();
  document.cells.push(cell(subjects.kernel, vocabulary.governs, subjects.program,
    { against: ["hypothetical-governance-objection"] }));
  const contested = readServiceSection(document);
  const binding = contested.governance[0].bindings[0];
  assert.equal(binding.link.reading, "stable");
  assert.deepEqual(binding.link.cell.against, ["hypothetical-governance-objection"]);
  assert.ok(contested.contests.includes(binding.link));
  assert.equal(Object.hasOwn(binding, "approved"), false);

  document.cells = document.cells.filter(at => !(at.subject === subjects.kernel && at.predicate === vocabulary.governs));
  const absent = readServiceSection(document);
  assert.deepEqual(absent.governance[0].bindings, []);
  assert.deepEqual(absent.missing, [{ role: "kernel", subject: subjects.kernel, predicate: vocabulary.governs }]);
});

test("the shared NDJSON command emits the same native reading and its existing typed refusal", async () => {
  const document = hypotheticalServiceSection();
  const invoke = async input => {
    const output = [];
    const disposition = await runJavascriptNodeOperation(
      { ...operationDefinition, operation: readServiceSection }, {
        arguments: [],
        standardInput: Readable.from([input]),
        standardOutput: new Writable({
          write(chunk, encoding, callback) { output.push(chunk.toString()); callback(); },
        }),
      });
    return { disposition, output: output.join("") };
  };
  const completed = await invoke(JSON.stringify(document) + "\n");
  assert.deepEqual(completed.disposition, { exitCode: 0, processed: 1, refused: 0 });
  assert.deepEqual(JSON.parse(completed.output), JSON.parse(JSON.stringify(readServiceSection(document))));

  const refused = await invoke("{}\n");
  assert.deepEqual(refused.disposition, { exitCode: 2, processed: 1, refused: 1 });
  const refusal = JSON.parse(refused.output);
  assert.equal(refusal.ok, false);
  assert.equal(refusal.refusal.reason, "InvalidInput");
});

test("the package reads its actual source-bound service description with the exact implementation and operation contracts", () => {
  const text = readFileSync(new URL("../data/records/service-section.json", import.meta.url), "utf8");
  assert.equal(text.endsWith("\n"), true);
  assert.equal(text.trimEnd().includes("\n"), false, "the published source record is directly consumable as one NDJSON command input");
  const document = JSON.parse(text);
  const result = readServiceSection(document);
  const repository = "https://github.com/red-cup-engineering/agentic-organization-services-section-engineering-services-section";
  // Git's existing blob identity binds each authored declaration to bytes.
  // This is source-qualification orchestration, not a new production codec.
  const sourceAt = path => {
    const bytes = readFileSync(new URL("../" + path, import.meta.url));
    const blob = createHash("sha1").update(Buffer.from("blob " + bytes.length + "\0")).update(bytes).digest("hex");
    return { resource: repository + "/blob/main/" + path, revision: "git-blob:sha1:" + blob };
  };
  assert.deepEqual(document.source, sourceAt("content/text/documents/articles/specifications/service-section-v1.md"),
    "changing the specification requires regenerating the source-bound record");
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.contests, []);
  assert.equal(result.hull.offers.length, 1);
  assert.equal(result.kernels.length, 1);
  assert.equal(result.governance.length, 1);
  assert.equal(result.governance[0].bindings.length, 1);

  const { offer, programs } = result.hull.offers[0];
  const program = programs[0].program;
  assert.equal(offer.fields.provider[0].cell.object.package, "@red-cup-engineering/agentic-organization-services-section-engineering-services-section");
  assert.equal(offer.fields.user[0].cell.object.kind, "parameterized-role");
  assert.equal(offer.fields.user[0].cell.object.role, "services-section-reader");
  assert.equal(offer.fields.valueAllocation[0].cell.object.kind, "declared-attribution-rule");
  const move = program.fields.move[0].cell.object;
  assert.equal(move.function, "readServiceSection");
  assert.deepEqual(move.source, sourceAt("src/service-section.mjs"),
    "changing the program requires regenerating its exact source binding");
  const precondition = program.fields.precondition[0].cell.object;
  const postcondition = program.fields.postcondition[0].cell.object;
  assert.deepEqual(precondition.schema, operationDefinition.inputSchema);
  assert.deepEqual(postcondition.schema, operationDefinition.outputSchema);
  assert.deepEqual(precondition.source, sourceAt("scripts/read-service-section.mjs"));
  assert.deepEqual(postcondition.source, sourceAt("scripts/read-service-section.mjs"));
  assert.equal(program.fields.preservationObligation[0].cell.object.requiresEvidence, true);

  const kernel = result.kernels[0];
  assert.equal(kernel.programs[0].program, program);
  assert.equal(result.governance[0].program, program.subject);
  assert.equal(result.governance[0].bindings[0].link, kernel.kernel.fields.governs[0]);
  const calibration = kernel.calibrations[0].calibration;
  assert.equal(calibration.fields.axis[0].cell.object, "evidence-handling");
  assert.deepEqual(calibration.fields.admissibleRegion[0].cell.object,
    ["retain-source-claims", "separately-labelled-inference"]);
  assert.equal(calibration.fields.setting[0].cell.object, "retain-source-claims");
  assert.equal(calibration.fields.revisit[0].cell.object.kind, "source-revision-or-counterexample-trigger");
  const requirements = result.section.fields.evidence.map(entry => entry.cell.object);
  assert.deepEqual(requirements.map(requirement => requirement.id).sort(),
    Array.from({ length: 12 }, (_, index) => `SS-SCI-${String(index + 1).padStart(2, "0")}`));
  for (const requirement of requirements) {
    assert.equal(requirement.kind, "source-derived-engineering-requirement");
    assert.equal(requirement.status, "declared-requirement");
    assert.deepEqual(requirement.source, document.source);
    assert.ok(requirement.profileFields.length > 0);
    assert.ok(requirement.scientificSources.length > 0);
    assert.ok(requirement.acceptanceCase.length > 0);
  }
  assert.equal(result.section.fields.evidence.every(entry =>
    entry.cell.for.some(witness => witness.kind === "source-bound-engineering-requirement-derivation" &&
      coincides(witness.revision, document.source.revision))), true);
  for (const role of [offer, program, kernel.kernel, calibration])
    assert.deepEqual(role.fields.evidence, []);
  assert.equal(Object.hasOwn(result, "approved"), false,
    "a declared requirement does not establish preservation, execution, acceptance or sale");
});
