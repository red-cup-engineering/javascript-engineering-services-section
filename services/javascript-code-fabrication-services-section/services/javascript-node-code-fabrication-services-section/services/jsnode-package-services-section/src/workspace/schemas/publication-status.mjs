/**
 * @packageDocumentation
 *
 * schemas/publication-status - schema contracts for release artifact proof.
 *
 * Export and bin surfaces are descriptor commitments. A publication-status proof
 * is the later schema-contracted proof that witnesses those commitments against emitted
 * artifacts such as `dist/` files and executable service entrypoints.
 */

import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";
import { packageSurfaceContract } from "./package-surface.mjs";

export const publicationArtifactTargetSchema = {
  $id: "metroplat/publication-status/artifact-target",
  type: "object",
  required: ["kind", "face", "name", "obligation", "target", "exists"],
  properties: {
    kind: { const: "metroplat.publication-status.artifact-target" },
    face: { enum: ["export", "bin"] },
    name: { type: "string", minLength: 1 },
    obligation: { enum: ["import", "types", "bin"] },
    target: { type: "string", minLength: 1 },
    mode: { type: "string", minLength: 1 },
    exists: { type: "boolean" },
    executable: { type: "boolean" },
  },
  title: "Publication artifact target",
  description: "One public package commitment checked against an emitted artifact target.",
  additionalProperties: false,
};

export const publicationStatusProofSchema = {
  $id: "metroplat/publication-status/proof",
  type: "object",
  required: ["kind", "source", "packageName", "surface", "targets", "missing", "nonExecutableBins", "ok"],
  properties: {
    kind: { const: "metroplat.publication-status.proof" },
    source: { type: "string", minLength: 1 },
    packageName: { type: "string", minLength: 1 },
    surface: { $ref: "../package-surface" },
    targets: {
      type: "array",
      items: { $ref: "artifact-target" },
    },
    missing: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    nonExecutableBins: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    ok: { type: "boolean" },
  },
  title: "Publication status proof",
  description: "A release artifact proof that the admitted package surface has concrete emitted targets.",
  additionalProperties: false,
};

export const publicationReleasePolicySchema = {
  $id: "metroplat/publication-status/release-policy",
  type: "object",
  required: ["kind", "source", "packageName", "private", "artifactProof", "includedFiles", "scripts", "localArtifactOk", "npmPublishable", "obligations", "evidence"],
  properties: {
    kind: { const: "metroplat.publication-status.release-policy" },
    source: { type: "string", minLength: 1 },
    packageName: { type: "string", minLength: 1 },
    private: { type: "boolean" },
    artifactProof: { $ref: "proof" },
    includedFiles: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    scripts: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    localArtifactOk: { type: "boolean" },
    npmPublishable: { type: "boolean" },
    obligations: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    evidence: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
  },
  title: "Publication release policy",
  description: "A release policy over the admitted package manifest and publication artifact proof, separating local artifact completeness from public npm publication.",
  additionalProperties: false,
};

export const publicationArtifactTargetContract = schemaFrom(publicationArtifactTargetSchema);
export const publicationStatusProofContract = schemaFrom(publicationStatusProofSchema, [
  packageSurfaceContract,
  publicationArtifactTargetContract,
]);
export const publicationReleasePolicyContract = schemaFrom(publicationReleasePolicySchema, [publicationStatusProofContract]);
