/**
 * @packageDocumentation
 *
 * schemas/exports - schema contracts for package export surfaces.
 *
 * The package manifest is admitted through `src/workspace/schemas/admission`;
 * this schema family
 * presents the public export map as data that other package-phase readers can
 * inspect without re-reading `package.json` or guessing at path strata.
 */

import { schemaFrom } from "@red-cup-engineering/relating/carriers/schema";

export const exportSurfaceEntrySchema = {
  $id: "metroplat/exports/entry",
  type: "object",
  required: ["kind", "specifier", "mode"],
  properties: {
    kind: { const: "metroplat.exports.entry" },
    specifier: { type: "string", minLength: 1 },
    mode: { enum: ["material", "package", "service", "app", "other"] },
    types: { type: "string" },
    import: { type: "string" },
  },
  title: "Export surface entry",
  description: "One public package export entry classified by realization mode.",
  additionalProperties: false,
};

export const exportSurfaceSchema = {
  $id: "metroplat/exports/surface",
  type: "object",
  required: ["kind", "source", "packageName", "entries"],
  properties: {
    kind: { const: "metroplat.exports.surface" },
    source: { type: "string", minLength: 1 },
    packageName: { type: "string", minLength: 1 },
    entries: {
      type: "array",
      items: { $ref: "entry" },
    },
  },
  title: "Export surface",
  description: "The admitted package export map read as explicit realization-mode entries.",
  additionalProperties: false,
};

export const exportSurfaceEntryContract = schemaFrom(exportSurfaceEntrySchema);
export const exportSurfaceContract = schemaFrom(exportSurfaceSchema, [exportSurfaceEntryContract]);
