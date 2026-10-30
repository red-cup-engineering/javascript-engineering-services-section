#!/usr/bin/env node
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function projectNpmPackageDependencyFromCrossPackageImport(crossPackageImport) {
  if (crossPackageImport?.type !== "CrossPackageJavascriptFileImport") throw new TypeError("input must be a CrossPackageJavascriptFileImport carrier");
  const { consumer, provider } = crossPackageImport;
  return Object.freeze({
    type: "NpmPackageDependencyProjection",
    manifestPath: consumer.manifestPath,
    dependency: provider.name,
    version: provider.version,
  });
}

if (import.meta.main) {
  const input = parse(await readJavascriptNodeStandardInputText({ standardInput: process.stdin }));
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(projectNpmPackageDependencyFromCrossPackageImport(input))}\n` });
}
