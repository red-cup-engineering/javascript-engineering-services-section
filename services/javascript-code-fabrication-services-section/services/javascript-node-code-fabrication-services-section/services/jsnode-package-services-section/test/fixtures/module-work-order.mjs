const span = { type: "ArtifactFabricationSourceSpan", startLine: 1, endLine: 1 };
export function moduleWorkOrder(inputSchema = { type: "integer" }, input = 2, outputSchema = { type: "integer" }, output = 2) {
  return {
    type: "ArtifactFabricationSpecificationCandidate", version: 1,
    source: { type: "ArtifactFabricationSource", version: 1,
      identity: { type: "ArtifactFabricationSourceIdentity", id: "planner-assay" },
      provenance: { type: "ArtifactFabricationSourceProvenance", locator: "test:planner", digest: "sha256:" + "0".repeat(64), sourceSpan: span } },
    artifact: { type: "FabricatedArtifactIdentity", version: 1, id: "planner-assay", kind: "jsnode-modules" },
    requirements: [{ type: "ArtifactFabricationRequirement", version: 1, id: "identity", statement: "Preserve the supplied value", sourceSpan: span }],
    prohibitions: [], openQuestions: [],
    constraints: ["law", "standard"].map(kind => ({ type: "ArtifactFabricationConstraint", version: 1, id: kind, kind, authority: "test", revision: "1", locator: "test:planner", applicability: "Identity", statement: "Preserve value", sourceSpan: span })),
    projections: [{ type: "ArtifactFabricationProjection", version: 1, id: "jsnode-modules", target: "@red-cup-engineering/jsnode-package-services-section/derive-jsnode-package-from-closure", sourceSpan: span,
      configuration: { operations: [{ name: "identity", description: "Preserve value", module: "src/identity.mjs", exportName: "identity", inputSchema, outputSchema }], examples: [{ name: "number", operation: "identity", input, output }], dependencies: {} } }],
    acceptanceObligations: [{ type: "ArtifactFabricationAcceptanceObligation", version: 1, id: "example", kind: "test", statement: "Preserve example", sourceSpan: span }],
    traceability: [{ type: "ArtifactFabricationTrace", version: 1, requirementId: "identity", constraintIds: ["law", "standard"], projectionIds: ["jsnode-modules"], acceptanceObligationIds: ["example"] }],
  };
}
