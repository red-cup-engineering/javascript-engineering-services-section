/**
 * @packageDocumentation
 *
 * bins - package-phase process-entrypoint surface readers.
 *
 * `src/workspace/schemas/admission` admits a package manifest as host material. This module reads
 * the admitted manifest's `bin` map into entries classified by the kind
 * of process boundary they commit to: CLI, HTTP, MCP, other service, legacy
 * script, or package-specific other target.
 */


import {
  binSurfaceContract as binSurfaceSchemaContract,

} from "../schemas/bins.mjs";

import { jsonResource } from "@red-cup-engineering/json-services-section";

function classifyTarget(target) {
  if (target === "./dist/src/scripts/infograph.mjs") return "cli";
  if (target === "./dist/src/scripts/infograph-serve.mjs") return "http";
  if (target === "./dist/src/scripts/infograph-mcp.mjs") return "mcp";
  if (target.startsWith("./dist/services/http/") || target.startsWith("./dist/src/integrations/web/services/http/")) return "http";
  if (target.startsWith("./dist/services/")) return "service";
  if (target.startsWith("./dist/src/scripts/") || target.startsWith("./dist/scripts/") || target.startsWith("./scripts/")) return "script";
  return "other";
}

function entryOf(command, target) {
  return {
    kind: "metroplat.bins.entry",
    command,
    target,
    mode: classifyTarget(target),
  };
}

/**
 * Read an admitted package manifest's public bin map as package material.
 */
export function binSurfaceOfPackageManifest(admission) {
  const binValue = admission.manifest["bin"];
  const entries = [];
  if (typeof binValue === "string" && binValue.length > 0) {
    entries.push(entryOf(admission.manifest.name, binValue));
  } else if (binValue !== null && typeof binValue === "object" && !Array.isArray(binValue)) {
    for (const [command, target] of Object.entries(binValue)) {
      if (typeof target === "string" && target.length > 0) entries.push(entryOf(command, target));
    }
  }

  entries.sort((left, right) => left.command.localeCompare(right.command));
  return binSurfaceSchemaContract.assert({
    kind: "metroplat.bins.surface",
    source: admission.source,
    packageName: admission.manifest.name,
    entries,
  }, "bin surface");
}

export * from "./script-catalog.mjs";
