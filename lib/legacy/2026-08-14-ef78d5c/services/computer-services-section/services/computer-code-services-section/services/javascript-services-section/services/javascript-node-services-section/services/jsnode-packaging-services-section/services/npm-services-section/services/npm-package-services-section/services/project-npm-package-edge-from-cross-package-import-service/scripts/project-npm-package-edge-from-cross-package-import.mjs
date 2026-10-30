#!/usr/bin/env node
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function projectNpmPackageEdgeFromCrossPackageImport(crossPackageImport) {
  if (crossPackageImport?.type !== "CrossPackageJavascriptFileImport") throw new TypeError("input must be a CrossPackageJavascriptFileImport carrier");
  return Object.freeze({
    type: "NpmPackageDependencyEdge",
    consumer: crossPackageImport.consumer.name,
    provider: crossPackageImport.provider.name,
    providerSubpath: crossPackageImport.providerSubpath,
  });
}

if (import.meta.main) {
  const input = parse(await readJavascriptNodeStandardInputText({ standardInput: process.stdin }));
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(projectNpmPackageEdgeFromCrossPackageImport(input))}\n` });
}
