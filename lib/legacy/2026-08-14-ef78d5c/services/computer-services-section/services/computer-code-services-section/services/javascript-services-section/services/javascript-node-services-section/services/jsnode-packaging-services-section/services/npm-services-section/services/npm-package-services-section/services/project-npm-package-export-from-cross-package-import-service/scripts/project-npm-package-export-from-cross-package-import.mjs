#!/usr/bin/env node
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

function addExport(prior, subpath) {
  let exports;
  if (prior === undefined) exports = {};
  else if (typeof prior === "string" || Array.isArray(prior) || (prior && typeof prior === "object" && !Object.keys(prior).some((name) => name.startsWith(".")))) exports = { ".": prior };
  else exports = { ...prior };
  exports[subpath] = subpath;
  return exports;
}

export function projectNpmPackageExportFromCrossPackageImport({ crossPackageImport, prior } = {}) {
  if (crossPackageImport?.type !== "CrossPackageJavascriptFileImport") throw new TypeError("input must be a CrossPackageJavascriptFileImport carrier");
  if (prior !== undefined && (prior?.type !== "NpmPackageExportsProjection" || prior.manifestPath !== crossPackageImport.provider.manifestPath)) throw new TypeError("prior must be an NpmPackageExportsProjection for the same provider");
  return Object.freeze({
    type: "NpmPackageExportsProjection",
    manifestPath: crossPackageImport.provider.manifestPath,
    exports: Object.freeze(addExport(prior?.exports ?? crossPackageImport.provider.exports, crossPackageImport.providerSubpath)),
  });
}

if (import.meta.main) {
  const input = parse(await readJavascriptNodeStandardInputText({ standardInput: process.stdin }));
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(projectNpmPackageExportFromCrossPackageImport(input))}\n` });
}
