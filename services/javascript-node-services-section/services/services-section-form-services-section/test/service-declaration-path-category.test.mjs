import test from "node:test";
import assert from "node:assert/strict";
import { cell } from "@red-cup-engineering/signcraft/cell";
import {
  SERVICE_DECLARATION_PATH_KIND,
  SERVICE_SECTION_VOCABULARY as vocabulary,
  readServiceSection,
  identityServiceDeclarationPath,
  offerServiceDeclarationPath,
  composeServiceDeclarationPaths,
} from "../src/service-section.mjs";
import { hypotheticalServiceSection, subjects } from "./fixtures/service-section.mjs";

const native = () => readServiceSection(hypotheticalServiceSection());
const offerPath = (reading, domain, codomain) =>
  offerServiceDeclarationPath(reading, {
    offer: subjects.offer, program: subjects.program, domain, codomain,
  });

test("source-owned offer/program identity and opposing evidence survive strict path selection", () => {
  const doc = hypotheticalServiceSection();
  doc.cells.push(cell(subjects.offer, vocabulary.program, subjects.program, {
    against: [{ kind: "hypothetical-source-objection", revision: "2" }],
  }));
  const reading = readServiceSection(doc);
  const path = offerPath(reading, "urn:interface:raw", "urn:interface:summary");
  assert.equal(path.kind, SERVICE_DECLARATION_PATH_KIND);
  assert.equal(path.standing, "syntactic-only");
  assert.equal(path.steps.length, 1);
  assert.equal(path.steps[0].offer, subjects.offer);
  assert.equal(path.steps[0].program, subjects.program);
  assert.equal(path.steps[0].source.revision, reading.document.source.revision);
  assert.deepEqual(path.steps[0].snapshot, reading.snapshot);
  assert.equal(path.steps[0].offerLink.for.length, 1);
  assert.equal(path.steps[0].programLink.for.length, 1);
  assert.equal(path.steps[0].programLink.against.length, 1);
  assert.equal(Object.hasOwn(path, "approved"), false);
  assert.equal(Object.hasOwn(path, "executed"), false);
  assert.equal(Object.hasOwn(path, "receipt"), false);
});

test("strict identity and associativity for three source-declared program paths", () => {
  const reading = native();
  const a = { kind: "hypothetical-interface", state: "a", remaining: 3 };
  const b = { kind: "hypothetical-interface", state: "b", remaining: 2 };
  const c = { kind: "hypothetical-interface", state: "c", remaining: 1 };
  const d = { kind: "hypothetical-interface", state: "d", remaining: 0 };
  const f = offerPath(reading, a, b);
  const g = offerPath(reading, b, c);
  const h = offerPath(reading, c, d);
  assert.deepEqual(composeServiceDeclarationPaths(identityServiceDeclarationPath(a), f), f);
  assert.deepEqual(composeServiceDeclarationPaths(f, identityServiceDeclarationPath(b)), f);
  assert.deepEqual(
    composeServiceDeclarationPaths(composeServiceDeclarationPaths(f, g), h),
    composeServiceDeclarationPaths(f, composeServiceDeclarationPaths(g, h)),
  );
  assert.equal(composeServiceDeclarationPaths(f, g).steps.length, 2);
});

test("local budget feasibility is not invented as a globally composable service section", () => {
  const reading = native();
  const localFull = { kind: "hypothetical-resource-interface", budget: { pool: "shared", remaining: 1 } };
  const spent = { kind: "hypothetical-resource-interface", budget: { pool: "shared", remaining: 0 } };
  const first = offerPath(reading, localFull, spent);
  const second = offerPath(reading, localFull, spent);
  // Both locally start with the same resource, but the first has exhausted it.
  assert.throws(() => composeServiceDeclarationPaths(first, second), /mismatched intermediate interface/u);
  // The path reader is not a budget model: an upstream owner must verify that
  // a declared residual state really follows from the claimed executable step.
  assert.equal(first.standing, "syntactic-only");
});

test("source/link absence, interface mismatch and extra wire fields are refused", () => {
  const reading = native();
  assert.throws(() => offerServiceDeclarationPath(reading, {
    offer: "urn:foreign:offer", program: subjects.program,
    domain: "urn:a", codomain: "urn:b",
  }), /existing offered-program link/u);
  assert.throws(() => offerServiceDeclarationPath(reading, {
    offer: subjects.offer, program: subjects.program,
    domain: "urn:a", codomain: "urn:b", approved: true,
  }), /declared data fields/u);

  const doc = hypotheticalServiceSection();
  doc.cells = doc.cells.filter(at =>
    !(at.subject === subjects.offer && at.predicate === vocabulary.program));
  const missing = readServiceSection(doc);
  assert.throws(() => offerPath(missing, "urn:a", "urn:b"), /existing offered-program link/u);

  const first = offerPath(reading, "urn:a", "urn:b");
  const second = offerPath(reading, "urn:c", "urn:d");
  assert.throws(() => composeServiceDeclarationPaths(first, second), /mismatched intermediate interface/u);
  assert.throws(() => composeServiceDeclarationPaths(
    { ...first, approved: true }, second), /declared data fields/u);
});

test("source input mutations after admission cannot rewrite retained interface state", () => {
  const input = { kind: "hypothetical-resource-interface", remaining: 2 };
  const identity = identityServiceDeclarationPath(input);
  input.remaining = 5;
  assert.equal(identity.domain.remaining, 2);
  assert.equal(identity.codomain.remaining, 2);
  assert.throws(() => identityServiceDeclarationPath(undefined), /explicit interface Mark/u);
});
