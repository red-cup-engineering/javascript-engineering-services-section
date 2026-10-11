/**
 * @packageDocumentation
 *
 * schemas/package-surface - schema contracts for the package membrane.
 *
 * A package surface combines the public import commitments (`exports`) and
 * process-entrypoint commitments (`bin`) admitted from one package manifest.
 * The nested surfaces keep their own schema identities; this schema presents
 * the membrane that relates them as one package boundary.
 */

import { schemaFrom } from "@red-cup-engineering/relating/carriers/schema";
import { binSurfaceContract } from "./bins.mjs";
import { exportSurfaceContract } from "./exports.mjs";

export const packageSurfaceCommitmentSchema = {
  $id: "metroplat/package-surface/commitment",
  type: "object",
  required: ["kind", "face", "name", "mode"],
  properties: {
    kind: { const: "metroplat.package-surface.commitment" },
    face: { enum: ["export", "bin"] },
    name: { type: "string", minLength: 1 },
    mode: { type: "string", minLength: 1 },
    target: { type: "string" },
  },
  title: "Package surface commitment",
  description: "One public package commitment projected from an export or bin surface.",
  additionalProperties: false,
};

export const packageSurfaceSchema = {
  $id: "metroplat/package-surface",
  type: "object",
  required: ["kind", "source", "packageName", "exports", "bins", "commitments"],
  properties: {
    kind: { const: "metroplat.package-surface" },
    source: { type: "string", minLength: 1 },
    packageName: { type: "string", minLength: 1 },
    exports: { $ref: "exports/surface" },
    bins: { $ref: "bins/surface" },
    commitments: {
      type: "array",
      items: { $ref: "package-surface/commitment" },
    },
  },
  title: "Package surface",
  description: "The admitted package membrane combining public exports and process bins.",
  additionalProperties: false,
};

export const packageSurfaceCommitmentContract = schemaFrom(packageSurfaceCommitmentSchema);
export const packageSurfaceContract = schemaFrom(packageSurfaceSchema, [
  exportSurfaceContract,
  binSurfaceContract,
  packageSurfaceCommitmentContract,
]);
