import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { renderJsonSchemaModule } from "../scripts/transform-json-schema-to-typescript.mjs";

// This selected source is the actual, immutable Specification owner checkout.
// A separately installed module graph is required: no copied Requirement
// schema, locally hand-assembled Architecture record, shadow proof or Work.
const originalRoot = process.env.SPEC_ARCHITECTURE_SOURCE_DIR;
if (originalRoot) {
  test("actual Requirement → Specification → reviewed Architecture → generated Code preserves exact source cuts", async () => {
    const [specificationOwner, architectureOwner] = await Promise.all([
      import(pathToFileURL(join(originalRoot, "src/specification.mjs")).href),
      import(pathToFileURL(join(originalRoot, "src/architecture-description.mjs")).href),
    ]);
    const ownerRequire = createRequire(pathToFileURL(join(originalRoot, "package.json")).href);
    const { artifactId } = await import(pathToFileURL(
      ownerRequire.resolve("@red-cup-engineering/semiotic-eavt-services-section/identity")).href);
    const sourceSchema = JSON.parse(readFileSync(
      join(originalRoot, "data/records/schema/architecture-description.schema.json"), "utf8"));

    const requirement = {
      kind: "requirement", id: "fabrication-cycle",
      "met-when": [
        { cell: "fabrication-cycle:source", target: "held",
          says: "The Code maker retains the original approved source in every artifact." },
        { cell: "fabrication-cycle:recipient", target: "held",
          says: "A separate beneficiary receives and accepts the verified output." },
      ],
    };
    const review = {
      identity: {
        id: "fabrication-cycle-spec", title: "Source-bound fabrication candidate",
        seat: "independent-stage-review", carrier: "drafts/fabrication-cycle.md",
        authors: ["source-only-test-review"],
      },
      at: "2026-10-27T05:00:00.000Z", reviewedBy: "source-only-test-review",
      interpretations: [
        { cell: "fabrication-cycle:source", clauseId: "source-bound",
          keyword: "MUST", actor: "Original Code maker" },
        { cell: "fabrication-cycle:recipient", clauseId: "recipient-receiving",
          keyword: "MUST NOT", actor: "Original Code maker" },
      ],
    };
    const specification = specificationOwner.deriveSpecificationFromRequirementReview(requirement, review);
    const architectureReview = {
      identity: { id: "fabrication-cycle-architecture",
        title: "Source-owned fabrication", owner: "unadmitted-source-review" },
      sourceCut: { requirementRevision: artifactId(requirement),
        specificationRevision: artifactId(specification) },
      applicability: "Candidate software fabrication source, not an adopted 42010 certificate",
      system: { name: "Bounded code fabricator",
        description: "Generates source-carried JavaScript without granting execution" },
      supportingSources: [{
        id: "design-decision", locator: "urn:source-only-fixture:design-decision",
        revision: "source-1",
      }],
      stakeholders: [{
        id: "buyer", name: "Independent source-work beneficiary",
        concernIds: ["source-boundary"],
      }],
      concerns: [{
        id: "source-boundary", statement: "Source remains bound before generation",
        sourceIds: ["req", "spec"],
        requirementCellIds: ["fabrication-cycle:source"],
        specificationClauseIds: ["source-bound"],
      }],
      viewpoints: [{
        id: "native-code-boundary", name: "Original source and effect boundary",
        concernIds: ["source-boundary"], modelKinds: ["interface"],
        method: "Authored exact-source interface model",
      }],
      views: [{
        id: "code-view", name: "Source-qualified maker view",
        viewpointId: "native-code-boundary", modelIds: ["code-model"],
        sourceIds: ["spec"],
      }],
      models: [{
        id: "code-model", kind: "interface", concernIds: ["source-boundary"],
        sourceIds: ["spec"],
        content: "Only an independently qualified source cut can be provided to the native maker.",
      }],
      correspondences: [],
      decisions: [{
        id: "review-decision", statement: "Separate Code source preparation from Work execution",
        rationale: "Source signatures and byte identity cannot grant the customer's acceptance",
        alternatives: ["Self-authorizing delivery", "Refuse missing receiving"],
        concernIds: ["source-boundary"], sourceIds: ["design-decision"],
      }],
      openQuestions: [],
    };

    const source = { requirement, specification };
    const built = architectureOwner.deriveArchitectureDescriptionFromSpecificationReview({
      ...source, review: architectureReview,
    });
    const read = architectureOwner.validateArchitectureDescriptionAgainstSourceCut(built, source);
    assert.equal(read.valid, true, JSON.stringify(read.issues));
    const trace = architectureOwner.readRequirementArchitectureTrace(built, source);
    assert.deepEqual(trace.counts, { sourceCells: 2, authoredModelMapped: 1, untraced: 1 });
    assert.equal(trace.independentProof, false);
    assert.equal(trace.independentlyAcceptedCustomerWork, false);
    assert.equal(built.standard.conformance, "unassessed");

    // The actual maker emits executable immutable JavaScript from the
    // reviewed design AND its original runtime source schema, not a label
    // copied into an opaque claim of completed engineering.
    const entriesFor = design => [
      { exportName: "architectureSourceSchema", typeName: "ArchitectureSource",
        schema: sourceSchema },
      { exportName: "reviewedDesignValue", typeName: "ReviewedDesign",
        schema: { const: design } },
    ];
    const fabricate = design => renderJsonSchemaModule(entriesFor(design),
      { format: "javascript" });
    const code = fabricate(built);
    assert.equal(code, fabricate(built), "identical source cut reproduces the exact Code bytes");
    const module = await import("data:text/javascript;base64," +
      Buffer.from(code, "utf8").toString("base64"));
    assert.deepEqual(module.architectureSourceSchema, sourceSchema);
    assert.deepEqual(module.reviewedDesignValue.const, built);
    assert.equal(Object.isFrozen(module.reviewedDesignValue.const.models[0]), true);
    assert.equal(Object.isFrozen(module.reviewedDesignValue.const.concerns[0]), true);
    assert.throws(() => {
      module.reviewedDesignValue.const.standard.conformance = "proved";
    }, TypeError);
    assert.equal(module.reviewedDesignValue.const.standard.conformance, "unassessed");

    const revisedReview = structuredClone(architectureReview);
    revisedReview.models[0].content =
      "A newly authored original code source boundary with an altered refusal";
    const revised = architectureOwner.deriveArchitectureDescriptionFromSpecificationReview({
      ...source, review: revisedReview,
    });
    assert.notEqual(fabricate(revised), code, "changed design must change Code bytes");
    const impact = architectureOwner.readRequirementArchitectureImpact(
      { ...source, architecture: built }, { ...source, architecture: revised });
    assert.equal(impact.summary.regenerationCells, 1);
    assert.equal(impact.summary.requalificationOnlyCells, 1);
    assert.deepEqual(impact.affectedModels, ["code-model"]);
    assert.ok(impact.changes.some(row =>
      row.reasons.includes("architecture-model-content-changed")));
    assert.equal(impact.originalEffect, "none-read-only");

    // An old architecture review may not silently ride a revised buyer
    // requirement into a new "passing" generated module.
    const altered = structuredClone(requirement);
    altered["met-when"][0].says = "The customer changed the original source condition.";
    assert.throws(() =>
      architectureOwner.deriveArchitectureDescriptionFromSpecificationReview({
        requirement: altered, specification, review: architectureReview,
      }), /source cut refused/u);
    const forged = structuredClone(architectureReview);
    forged.decisions[0].sourceIds = ["req"];
    assert.throws(() =>
      architectureOwner.deriveArchitectureDescriptionFromSpecificationReview({
        ...source, review: forged,
      }), /every authored decision needs its own source/u);
  });
}
