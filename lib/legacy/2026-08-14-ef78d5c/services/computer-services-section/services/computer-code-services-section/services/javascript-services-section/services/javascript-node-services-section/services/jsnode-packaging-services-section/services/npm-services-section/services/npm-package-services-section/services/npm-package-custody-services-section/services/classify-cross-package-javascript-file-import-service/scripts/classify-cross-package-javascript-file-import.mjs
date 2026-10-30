#!/usr/bin/env node
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { relative, sep } from "node:path";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

function slash(path) {
  return path.split(sep).join("/");
}

function contains(directory, path) {
  const fromDirectory = relative(directory, path);
  return fromDirectory === "" || (!fromDirectory.startsWith(`..${sep}`) && fromDirectory !== ".." && !fromDirectory.startsWith(sep));
}

function custodianOf(path, custodies) {
  return custodies.filter(({ directory }) => contains(directory, path)).sort((left, right) => right.directory.length - left.directory.length)[0] ?? null;
}

function refusal(resolution, reason) {
  return Object.freeze({ type: "CrossPackageJavascriptFileImportRefusal", resolution, reason });
}

export function classifyCrossPackageJavascriptFileImport({ resolution, custodies } = {}) {
  if (resolution?.type !== "ResolvedJavascriptNodeFileImport") throw new TypeError("resolution must be a ResolvedJavascriptNodeFileImport carrier");
  if (!Array.isArray(custodies) || custodies.some(({ type }) => type !== "NpmPackageCustody")) throw new TypeError("custodies must be NpmPackageCustody carriers");
  const consumer = custodianOf(resolution.import.path, custodies);
  if (!consumer) return refusal(resolution, "consumer-package-not-found");
  const provider = custodianOf(resolution.targetPath, custodies);
  if (!provider) return refusal(resolution, "provider-package-not-found");
  if (consumer.manifestPath === provider.manifestPath) return refusal(resolution, "same-package-import");
  return Object.freeze({
    type: "CrossPackageJavascriptFileImport",
    import: resolution.import,
    targetPath: resolution.targetPath,
    consumer,
    provider,
    providerSubpath: `./${slash(relative(provider.directory, resolution.targetPath))}`,
  });
}

if (import.meta.main) {
  const input = parse(await readJavascriptNodeStandardInputText({ standardInput: process.stdin }));
  const classification = classifyCrossPackageJavascriptFileImport(input);
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(classification)}\n` });
}
