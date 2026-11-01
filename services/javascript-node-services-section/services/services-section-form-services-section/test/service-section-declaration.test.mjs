import test from "node:test";
import assert from "node:assert/strict";
import { cell, coincides } from "@red-cup-engineering/signcraft/cell";
import {
  SERVICE_SECTION_VOCABULARY as vocabulary,
  admitServiceSectionProjection,
  extendServiceSection,
  readServiceSection,
} from "../src/service-section.mjs";
import { hypotheticalServiceSection, subjects } from "./fixtures/service-section.mjs";

const sourceWitness = () => ({
  kind: "hypothetical-operation-derivation",
  resource: "urn:example:operation-source",
  revision: "fixture-revision-2",
});

const programDeclaration = fields => ({
  role: "program", subject: subjects.program, fields, witness: sourceWitness(),
});

test("projection admission retains source bindings before a consumer can interpret them", () => {
  const document = structuredClone(hypotheticalServiceSection());
  document.cells = [];
  const offer = { kind: "hypothetical-offer-mark", coordinates: ["original", 1] };
  const specification = { document, bindings: [{ operation: "fixture/derive", offer }] };
  const received = admitServiceSectionProjection(specification);
  const before = JSON.stringify(received);

  document.source.revision = "later-revision";
  offer.coordinates[0] = "changed";
  specification.bindings.length = 0;
  assert.equal(JSON.stringify(received), before);
  assert.deepEqual(received.document.cells, [], "admission must not fabricate the yet-to-be-projected program");

  let calls = 0;
  const binding = { operation: "fixture/derive" };
  Object.defineProperty(binding, "offer", {
    enumerable: true,
    get() { calls += 1; return subjects.offer; },
  });
  assert.throws(() => admitServiceSectionProjection({
    document: hypotheticalServiceSection(), bindings: [binding],
  }), TypeError);
  assert.equal(calls, 0, "reading a projection must not execute a caller's binding accessor");
});

test("an operation declaration joins original opposition without replacing either source", () => {
  const document = hypotheticalServiceSection();
  const postcondition = "urn:example:assertion:summary-with-observation-lineage";
  const objection = { kind: "hypothetical-counterexample", input: "fixture-input-7" };
  document.cells.push(cell(subjects.program, vocabulary.postcondition, postcondition, { against: [objection] }));
  const before = JSON.stringify(document);
  const declaration = programDeclaration({ postcondition: [postcondition] });
  const result = extendServiceSection(document, [declaration]);
  const reading = result.hull.offers[0].programs[0].program.fields.postcondition[0];

  assert.equal(reading.reading, "stable");
  assert.equal(reading.cell.for.length, 2, "original authorship and the new derivation are independent witnesses");
  assert.ok(reading.cell.for.some(witness => coincides(witness, declaration.witness)));
  assert.deepEqual(reading.cell.against, [objection]);
  assert.ok(result.contests.includes(reading));
  assert.deepEqual(result.document.source, document.source);
  assert.equal(JSON.stringify(document), before, "the original source document is not rewritten");
});

test("replaying a telling is idempotent while distinct testimony retains a distinct witness", () => {
  const document = hypotheticalServiceSection();
  const declaration = programDeclaration({ preservationObligation: ["urn:example:obligation:independent-review"] });
  const once = extendServiceSection(document, [declaration]);
  const replay = extendServiceSection(once.document, [structuredClone(declaration)]);
  assert.equal(replay.snapshot, once.snapshot);
  assert.equal(replay.sourceCells, once.sourceCells);
  assert.deepEqual(replay.document.cells, once.document.cells);

  const independent = structuredClone(declaration);
  independent.witness.resource = "urn:example:independent-operation-observer";
  const corroborated = extendServiceSection(once.document, [independent]);
  const claim = corroborated.hull.offers[0].programs[0].program.fields.preservationObligation
    .find(entry => entry.cell.object === "urn:example:obligation:independent-review");
  assert.equal(claim.cell.for.length, 2);
  assert.notEqual(corroborated.sourceCells, once.sourceCells);
});

test("adding program fields does not manufacture a user, kernel, or successful evidence", () => {
  const document = hypotheticalServiceSection();
  document.cells = document.cells.filter(at =>
    !(at.subject === subjects.offer && at.predicate === vocabulary.user) &&
    !(at.subject === subjects.section && at.predicate === vocabulary.kernel));
  const result = extendServiceSection(document, [programDeclaration({
    move: ["urn:example:move:source-derived-summary"],
  })]);

  assert.deepEqual(result.hull.offers[0].offer.fields.user, []);
  assert.deepEqual(result.kernels, []);
  assert.deepEqual(result.governance[0].bindings, []);
  assert.deepEqual(result.hull.offers[0].programs[0].program.fields.evidence, []);
  assert.ok(result.missing.some(missing => missing.role === "offer" && missing.predicate === vocabulary.user));
  assert.ok(result.missing.some(missing => missing.role === "section" && missing.predicate === vocabulary.kernel));
  assert.equal(result.document.cells.some(at => at.predicate === vocabulary.evidence), false);
});

test("an embedded failed receipt remains attributed data and cannot become a preservation claim", () => {
  const receipt = {
    kind: "hypothetical-program-receipt", contract: subjects.program,
    reading: "denied", obstructions: ["fixture output lacks observation lineage"],
  };
  const result = extendServiceSection(hypotheticalServiceSection(), [programDeclaration({ evidence: [receipt] })]);
  const evidence = result.hull.offers[0].programs[0].program.fields.evidence[0];
  assert.equal(evidence.reading, "potential", "the producer witnesses the existence of this attributed receipt");
  assert.equal(evidence.cell.object.reading, "denied", "the receipt's adverse meaning is retained");
  assert.deepEqual(evidence.cell.object.obstructions, receipt.obstructions);
  assert.equal(Object.hasOwn(result, "preserved"), false);
  assert.equal(Object.hasOwn(result, "approved"), false);
});

test("the augmented source cut owns nested declaration values and derivation witnesses", () => {
  const document = structuredClone(hypotheticalServiceSection());
  const declaration = programDeclaration({ move: [{ kind: "hypothetical-sen-move", operands: [1, 2] }] });
  declaration.witness.derivation = { originalContract: "urn:example:contract:before" };
  const result = extendServiceSection(document, [declaration]);
  const before = JSON.stringify(result);
  document.source.revision = "changed-after-admission";
  document.cells.length = 0;
  declaration.subject = "urn:example:program:mutated";
  declaration.fields.move[0].operands[0] = 900;
  declaration.witness.derivation.originalContract = "urn:example:contract:after";
  assert.equal(JSON.stringify(result), before);
  assert.deepEqual(readServiceSection(result.document), result);
});

test("a declaration cannot supply unknown profile fields, scalar values, or implicit witnesses", () => {
  const document = hypotheticalServiceSection();
  assert.throws(() => extendServiceSection(document, [programDeclaration({ approved: [true] })]), TypeError);
  assert.throws(() => extendServiceSection(document, [programDeclaration({ postcondition: "promised" })]), TypeError);
  const unwitnessed = programDeclaration({ postcondition: ["promised"] });
  delete unwitnessed.witness;
  assert.throws(() => extendServiceSection(document, [unwitnessed]), TypeError);
  assert.throws(() => extendServiceSection(document, [{ ...programDeclaration({}), role: "administrator" }]), TypeError);
  assert.throws(() => extendServiceSection(document, [{ ...programDeclaration({}), accepted: true }]), TypeError);
});

test("declaration and field accessors are refused before any producer code runs", () => {
  const document = hypotheticalServiceSection();
  let executions = 0;
  const accessor = () => { executions += 1; return ["urn:example:assertion:unsafe"]; };
  const declarationGetter = programDeclaration({});
  Object.defineProperty(declarationGetter, "witness", { get: accessor });
  assert.throws(() => extendServiceSection(document, [declarationGetter]), TypeError);

  const fieldGetter = programDeclaration({});
  Object.defineProperty(fieldGetter.fields, "postcondition", { enumerable: true, get: accessor });
  assert.throws(() => extendServiceSection(document, [fieldGetter]), TypeError);

  const inherited = programDeclaration({});
  inherited.fields = Object.create({ get postcondition() { return accessor(); } });
  assert.throws(() => extendServiceSection(document, [inherited]), TypeError);
  assert.equal(executions, 0);
});

test("a plural field cannot execute an indexed getter during native claim construction", () => {
  const document = hypotheticalServiceSection();
  let executions = 0;
  const values = [];
  Object.defineProperty(values, "0", {
    enumerable: true,
    get() { executions += 1; return "urn:example:assertion:unsafe"; },
  });
  assert.throws(() => extendServiceSection(document, [programDeclaration({ postcondition: values })]), TypeError);
  assert.equal(executions, 0, "plural source data is admitted before iteration reads its coordinates");
});

test("a declaration list cannot execute an indexed getter before declaration admission", () => {
  const document = hypotheticalServiceSection();
  let executions = 0;
  const declarations = [];
  Object.defineProperty(declarations, "0", {
    enumerable: true,
    get() { executions += 1; return programDeclaration({ postcondition: ["urn:example:assertion:unsafe"] }); },
  });
  assert.throws(() => extendServiceSection(document, declarations), TypeError);
  assert.equal(executions, 0, "the outer list is received data too");
});
