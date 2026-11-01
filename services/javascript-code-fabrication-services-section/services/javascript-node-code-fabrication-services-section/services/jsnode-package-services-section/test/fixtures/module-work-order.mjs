const span = { type: "ArtifactFabricationSourceSpan", startLine: 1, endLine: 1 };
export function moduleWorkOrder(inputSchema = { type: "integer" }, input = 2, outputSchema = { type: "integer" }, output = 2) {
  return {
    type: "ArtifactFabricationSpecificationCandidate", version: 2,
    source: { type: "ArtifactFabricationSource", version: 1,
      identity: { type: "ArtifactFabricationSourceIdentity", id: "planner-assay" },
      provenance: { type: "ArtifactFabricationSourceProvenance", locator: "test:planner", digest: "sha256:" + "0".repeat(64), sourceSpan: span } },
    artifact: { type: "FabricatedArtifactIdentity", version: 1, id: "planner-assay", kind: "jsnode-modules" },
    claims: [{ type: "ArtifactFabricationClaim", version: 1, id: "fixture-contract", kind: "parameter",
      statement: "The fixture selects identity as its authored meaning; it asserts no dependency installation or external behavior",
      status: "derived", quantity: null, sourceSpan: span,
      basis: { type: "ArtifactFabricationDerivedBasis", premises: [{ type: "ArtifactFabricationPremise", kind: "requirement", ref: "identity" }],
        derivation: "This is the explicitly authored test contract, not a claim that a generated implementation exists." } }],
    requirements: [{ type: "ArtifactFabricationRequirement", version: 2, id: "identity", statement: "Preserve the supplied value", parameters: [], claimIds: ["fixture-contract"], sourceSpan: span }],
    prohibitions: [], openQuestions: [],
    constraints: ["law", "standard"].map(kind => ({ type: "ArtifactFabricationConstraint", version: 2, id: kind, kind, authority: "test", revision: "1", locator: "test:planner", applicability: "Identity", statement: "Preserve value", parameters: [], claimIds: ["fixture-contract"], sourceSpan: span })),
    projections: [{ type: "ArtifactFabricationProjection", version: 1, id: "jsnode-modules", target: "@red-cup-engineering/jsnode-package-services-section/derive-jsnode-package-from-closure", sourceSpan: span,
      configuration: { operations: [{ name: "identity", description: "Preserve value", module: "src/identity.mjs", exportName: "identity", inputSchema, outputSchema }], examples: [{ name: "number", operation: "identity", input, output }], dependencies: {} } }],
    acceptanceObligations: [{ type: "ArtifactFabricationAcceptanceObligation", version: 2, id: "example", kind: "test", statement: "Preserve example", parameters: [], claimIds: ["fixture-contract"], sourceSpan: span }],
    traceability: [{ type: "ArtifactFabricationTrace", version: 1, requirementId: "identity", constraintIds: ["law", "standard"], projectionIds: ["jsnode-modules"], acceptanceObligationIds: ["example"] }],
  };
}
