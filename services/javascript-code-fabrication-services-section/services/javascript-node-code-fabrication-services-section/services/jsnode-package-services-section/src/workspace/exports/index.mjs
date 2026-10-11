/**
 * @packageDocumentation
 *
 * exports - package-phase public surface readers.
 *
 * `src/workspace/schemas/admission` admits a package manifest as host material. This module reads
 * the admitted manifest's export map into entries classified by
 * realization mode: material law (`core/`), package realization (`src/`),
 * service bindings, app faces (`apps/`), or other package data.
 */


import {
  exportSurfaceEntryContract,
  exportSurfaceContract as exportSurfaceSchemaContract,

} from "../schemas/exports.mjs";

import { jsonResource } from "@red-cup-engineering/json-services-section";

function stringField(value, key) {
  const field = value[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function exportTarget(value) {
  if (typeof value === "string") return { import: value };
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value;
    const out = {};
    const importTarget = stringField(record, "import");
    const typesTarget = stringField(record, "types");
    if (importTarget !== undefined) out.import = importTarget;
    if (typesTarget !== undefined) out.types = typesTarget;
    return out;
  }
  return {};
}

function classifyPath(target) {
  if (target === undefined) return "other";
  if (target.startsWith("./dist/core/")) return "material";
  if (target.startsWith("./dist/src/integrations/knowledge-vaults/services/")) return "service";
  if (target.startsWith("./dist/src/integrations/filesystem/services/")) return "service";
  if (target.startsWith("./dist/src/integrations/agents-doc/service.")) return "service";
  if (target.startsWith("./dist/src/integrations/agent-worker/service.")) return "service";
  if (target.startsWith("./dist/src/integrations/hooks/service.")) return "service";
  if (target.startsWith("./dist/src/integrations/lean/workspace/service.")) return "service";
  if (target.startsWith("./dist/src/integrations/lean/tex/workspace-service.")) return "service";
  if (target.startsWith("./dist/src/sites/static-website/service.")) return "service";
  // src/integrations/git has no src/ layer (no pure logic over git state today),
  // so its one export barrel is the services layer directly.
  if (target.startsWith("./dist/src/integrations/git/")) return "service";
  if (target.startsWith("./dist/src/services/")) return "service";
  if (target.startsWith("./dist/src/apps/")) return "app";
  if (target.startsWith("./dist/src/")) return "package";
  if (target.startsWith("./dist/services/")) return "service";
  if (target.startsWith("./dist/apps/")) return "app";
  return "other";
}

function entryOf(specifier, value) {
  const target = exportTarget(value);
  const mode = classifyPath(target.import ?? target.types);
  const entry = {
    kind: "metroplat.exports.entry",
    specifier,
    mode,
    ...(target.types === undefined ? {} : { types: target.types }),
    ...(target.import === undefined ? {} : { import: target.import }),
  };
  return entry;
}

function serviceDecisionFor(entry) {
  const target = entry.import ?? entry.types ?? "";
  if (entry.specifier === "./integrations/mcp" || target.includes("/dist/src/apps/infograph/mcp/")) return "process-boundary";
  if (target.includes("/dist/src/apps/infograph/http/")) return "site/app-surface";
  return "package-realization-helper";
}

function serviceClassification(entry) {
  if (entry.mode !== "service") return undefined;
  const target = entry.import ?? entry.types;
  if (target === undefined) return undefined;
  const decision = serviceDecisionFor(entry);
  const reason = (() => {
    switch (decision) {
      case "process-boundary":
        return "The service export is a long-lived process or protocol boundary and must stay service-owned.";
      case "package-realization-helper":
        return "The service export is importable helper surface around filesystem/process ownership and needs an explicit package-facing facade decision.";
      case "site/app-surface":
        return "The service export presents an application or site boundary rather than package material law.";
    }
  })();
  const obligation = (() => {
    switch (decision) {
      case "process-boundary":
        return "Keep as bin or service-only entry; do not present as package/material realization.";
      case "package-realization-helper":
        return "Move pure/package realization APIs to src/ facades or keep the import explicitly service-only when host ownership is essential.";
      case "site/app-surface":
        return "Move downstream site/app helpers to sites/ or apps/ when they are not host-bound service ownership.";
    }
  })();
  return Object.freeze({
    kind: "metroplat.exports.service-classification",
    specifier: entry.specifier,
    target,
    decision,
    reason,
    obligation,
  });
}

export function exportServiceClassificationReport(surface) {
  const entries = surface.entries.map((entry) =>
    exportSurfaceEntryContract.assert(entry, "export service classification entry"));
  const serviceExports = Object.freeze(
    entries.map((entry) => serviceClassification(entry)).filter((entry) => entry !== undefined),
  );
  const decisionCounts = Object.freeze({
    "process-boundary": serviceExports.filter((entry) => entry.decision === "process-boundary").length,
    "package-realization-helper": serviceExports.filter((entry) => entry.decision === "package-realization-helper").length,
    "site/app-surface": serviceExports.filter((entry) => entry.decision === "site/app-surface").length,
  });
  const obligations = Object.freeze([...new Set(serviceExports.map((entry) => entry.obligation))]);
  return Object.freeze({
    kind: "metroplat.exports.service-classification-report",
    packageName: surface.packageName,
    source: surface.source,
    serviceExports,
    decisionCounts,
    obligations,
    ok: serviceExports.every((entry) => entry.target.length > 0 && entry.obligation.length > 0),
  });
}

/**
 * Read an admitted package manifest's public export map as package material.
 */
export function exportSurfaceOfPackageManifest(admission) {
  const exportsValue = admission.manifest["exports"];
  const entries = [];
  if (exportsValue !== undefined) {
    if (typeof exportsValue === "string") {
      entries.push(entryOf(".", exportsValue));
    } else if (exportsValue !== null && typeof exportsValue === "object" && !Array.isArray(exportsValue)) {
      for (const [specifier, value] of Object.entries(exportsValue)) entries.push(entryOf(specifier, value));
    }
  }

  entries.sort((left, right) => left.specifier.localeCompare(right.specifier));
  const surface = exportSurfaceSchemaContract.assert({
    kind: "metroplat.exports.surface",
    source: admission.source,
    packageName: admission.manifest.name,
    entries,
  }, "export surface");
  return Object.freeze({
    ...surface,
    entries: Object.freeze(entries),
  });
}
