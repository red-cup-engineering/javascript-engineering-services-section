#!/usr/bin/env node
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { admitNpmPackageManifest } from "@red-cup-engineering/npm-package-manifest-admission-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function applyNpmPackageExportsProjection({ manifest, projection } = {}) {
  const admitted = admitNpmPackageManifest(manifest);
  if (projection?.type !== "NpmPackageExportsProjection") throw new TypeError("projection must be an NpmPackageExportsProjection carrier");
  return admitNpmPackageManifest({ ...admitted, exports: projection.exports });
}

if (import.meta.main) {
  const input = parse(await readJavascriptNodeStandardInputText({ standardInput: process.stdin }));
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(applyNpmPackageExportsProjection(input))}\n` });
}
