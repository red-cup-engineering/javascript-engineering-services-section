/**
 * @packageDocumentation
 *
 * schemas/bins - schema contracts for package process-entrypoint surfaces.
 *
 * Package `bin` entries are executable boundary commitments. They are read from
 * package-manifest admission, not from the filesystem, so service bindings stay
 * under `services/` while the package API can still expose the bin surface as
 * admissible material.
 */

import { schemaFrom } from "@red-cup-engineering/relating/carriers/schema";

export const binSurfaceEntrySchema = {
  $id: "metroplat/bins/entry",
  type: "object",
  required: ["kind", "command", "target", "mode"],
  properties: {
    kind: { const: "metroplat.bins.entry" },
    command: { type: "string", minLength: 1 },
    target: { type: "string", minLength: 1 },
    mode: { enum: ["cli", "http", "mcp", "service", "script", "other"] },
  },
  title: "Bin surface entry",
  description: "One public package bin command classified by process-entrypoint mode.",
  additionalProperties: false,
};

export const binSurfaceSchema = {
  $id: "metroplat/bins/surface",
  type: "object",
  required: ["kind", "source", "packageName", "entries"],
  properties: {
    kind: { const: "metroplat.bins.surface" },
    source: { type: "string", minLength: 1 },
    packageName: { type: "string", minLength: 1 },
    entries: {
      type: "array",
      items: { $ref: "entry" },
    },
  },
  title: "Bin surface",
  description: "The admitted package bin map read as explicit process-entrypoint entries.",
  additionalProperties: false,
};

export const binSurfaceEntryContract = schemaFrom(binSurfaceEntrySchema);
export const binSurfaceContract = schemaFrom(binSurfaceSchema, [binSurfaceEntryContract]);

/** One named `package.json#scripts` entry: an author-declared command, not a
 *  process-entrypoint commitment (unlike `bin`, `scripts` are never run
 *  automatically and carry no compatibility guarantee to callers). */
export const packageScriptCatalogEntrySchema = {
  $id: "metroplat/bins/script-entry",
  type: "object",
  required: ["kind", "name", "command"],
  properties: {
    kind: { const: "metroplat.bins.script-entry" },
    name: { type: "string", minLength: 1 },
    command: { type: "string", minLength: 1 },
  },
  title: "Package script catalog entry",
  description: "One named package.json#scripts command.",
  additionalProperties: false,
};

export const packageScriptCatalogSchema = {
  $id: "metroplat/bins/script-catalog",
  type: "object",
  required: ["kind", "source", "packageName", "entries"],
  properties: {
    kind: { const: "metroplat.bins.script-catalog" },
    source: { type: "string", minLength: 1 },
    packageName: { type: "string", minLength: 1 },
    entries: {
      type: "array",
      items: { $ref: "script-entry" },
    },
  },
  title: "Package script catalog",
  description: "The admitted package manifest's scripts map read as explicit named-command entries.",
  additionalProperties: false,
};

export const packageScriptCatalogEntryContract = schemaFrom(packageScriptCatalogEntrySchema);
export const packageScriptCatalogContract = schemaFrom(packageScriptCatalogSchema, [packageScriptCatalogEntryContract]);
