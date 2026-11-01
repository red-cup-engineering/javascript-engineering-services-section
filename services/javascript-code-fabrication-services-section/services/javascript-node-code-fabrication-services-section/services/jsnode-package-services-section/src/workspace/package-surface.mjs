/**
 * @packageDocumentation
 *
 * package-surface - admitted package membrane readers.
 *
 * Export and bin surfaces are separate boundary faces. This module combines
 * them into one package-surface record so the package's public import
 * commitments and process-entrypoint commitments can be observed as one
 * phase-indexed relational contract.
 */

import {
  packageSurfaceContract as packageSurfaceSchemaContract,

} from "./schemas/package-surface.mjs";
import { jsonResource } from "@red-cup-engineering/json-services-section";

function packagePathSegments(packageName) {
  return packageName.split("/").filter((part) => part.length > 0);
}

function exportSpecifierSegments(specifier) {
  if (specifier === ".") return Object.freeze([]);
  const relative = specifier.startsWith("./") ? specifier.slice(2) : specifier;
  return Object.freeze(relative.split("/").filter((part) => part.length > 0));
}

function endpointPath(packageName, specifier, symbol, basePath = "") {
  const prefix = basePath.replace(/\/+$/, "");
  const segments = [
    ...packagePathSegments(packageName),
    ...exportSpecifierSegments(specifier),
    symbol,
  ].map((segment) => encodeURIComponent(segment));
  return `${prefix}/${segments.join("/")}`.replace(/\/+/g, "/");
}

function sourcePathOfExportTarget(target) {
  const stripped = target.replace(/^\.\//, "").replace(/^dist\//, "");
  if (stripped.endsWith(".d.mts")) return `${stripped.slice(0, -".d.mts".length)}.mts`;
  if (stripped.endsWith(".d.ts")) return `${stripped.slice(0, -".d.ts".length)}.ts`;
  if (stripped.endsWith(".mjs")) return `${stripped.slice(0, -".mjs".length)}.mts`;
  if (stripped.endsWith(".js")) return `${stripped.slice(0, -".js".length)}.ts`;
  return stripped;
}

function entryTarget(entry) {
  return entry.import ?? entry.types;
}

/** Project an admitted package export membrane through an observed source topology. */
export function packageEndpointReadoutOf(
  surface,
  read,
  options = {},
) {
  const modulesByPath = new Map(read.modules.map((moduleEntry) => [moduleEntry.path, moduleEntry]));
  const endpoints = [];
  for (const entry of surface.entries) {
    const target = entryTarget(entry);
    if (target === undefined) continue;
    const modulePath = sourcePathOfExportTarget(target);
    const moduleEntry = modulesByPath.get(modulePath);
    if (moduleEntry === undefined) continue;
    for (const symbol of moduleEntry.symbols) {
      endpoints.push(Object.freeze({
        kind: "metroplat.jsnode.package-endpoint-candidate",
        packageName: surface.packageName,
        path: endpointPath(surface.packageName, entry.specifier, symbol.name, options.basePath),
        specifier: entry.specifier,
        modulePath,
        target,
        symbol: Object.freeze({
          name: symbol.name,
          kind: symbol.kind,
          line: symbol.line,
          ...(symbol.summary === undefined ? {} : { summary: symbol.summary }),
        }),
        authority: "package-export-map",
        invocation: "readout-only-unless-action-or-sen-boundary",
        evidence: Object.freeze([
          `package:${surface.packageName}`,
          `specifier:${entry.specifier}`,
          `target:${target}`,
          `module:${modulePath}`,
          `symbol:${symbol.name}`,
        ]),
      }));
    }
  }
  endpoints.sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({
    kind: "metroplat.jsnode.package-endpoint-readout",
    packageName: surface.packageName,
    endpoints: Object.freeze(endpoints),
    evidence: Object.freeze([
      "projection:package-name/export-subpath/exported-symbol",
      "authority:package-json-exports-plus-typescript-ast",
      "execution:not-admitted-here;action-or-sen-boundary-required",
      `exports:${surface.entries.length}`,
      `modules:${read.modules.length}`,
      `endpoints:${endpoints.length}`,
    ]),
  });
}

function exportCommitments(surface) {
  const entries = surface.entries;
  return Object.freeze(entries.map((entry) => Object.freeze({
    kind: "metroplat.package-surface.commitment",
    face: "export",
    name: entry.specifier,
    mode: entry.mode,
    ...((entry.import ?? entry.types) === undefined ? {} : { target: entry.import ?? entry.types }),
  })));
}

function binCommitments(surface) {
  const entries = surface.entries;
  return Object.freeze(entries.map((entry) => Object.freeze({
    kind: "metroplat.package-surface.commitment",
    face: "bin",
    name: entry.command,
    mode: entry.mode,
    target: entry.target,
  })));
}

/**
 * Combine already-admitted export and bin surfaces into one package membrane.
 */
export function packageSurfaceOf(exportSurface, binSurface) {
  if (exportSurface.packageName !== binSurface.packageName) {
    throw new TypeError(`packageSurfaceOf: package names differ: ${exportSurface.packageName} and ${binSurface.packageName}`);
  }
  if (exportSurface.source !== binSurface.source) {
    throw new TypeError(`packageSurfaceOf: sources differ: ${exportSurface.source} and ${binSurface.source}`);
  }
  const commitments = Object.freeze([
    ...exportCommitments(exportSurface),
    ...binCommitments(binSurface),
  ].sort((left, right) => `${left.face}:${left.name}`.localeCompare(`${right.face}:${right.name}`)));

  return packageSurfaceSchemaContract.assert({
    kind: "metroplat.package-surface",
    source: exportSurface.source,
    packageName: exportSurface.packageName,
    exports: exportSurface,
    bins: binSurface,
    commitments,
  }, "package surface");
}
