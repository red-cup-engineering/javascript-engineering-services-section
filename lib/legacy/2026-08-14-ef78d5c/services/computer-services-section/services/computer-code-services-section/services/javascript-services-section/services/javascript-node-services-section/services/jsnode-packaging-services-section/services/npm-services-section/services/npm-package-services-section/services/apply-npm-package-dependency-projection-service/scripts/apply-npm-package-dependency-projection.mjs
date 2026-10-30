#!/usr/bin/env node
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { admitNpmPackageManifest } from "@red-cup-engineering/npm-package-manifest-admission-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function applyNpmPackageDependencyProjection({ manifest, projection } = {}) {
  const admitted = admitNpmPackageManifest(manifest);
  if (projection?.type !== "NpmPackageDependencyProjection") throw new TypeError("projection must be an NpmPackageDependencyProjection carrier");
  if (typeof projection.dependency !== "string" || typeof projection.version !== "string") throw new TypeError("dependency and version must be strings");
  return admitNpmPackageManifest({
    ...admitted,
    dependencies: { ...(admitted.dependencies ?? {}), [projection.dependency]: projection.version },
  });
}

if (import.meta.main) {
  const input = parse(await readJavascriptNodeStandardInputText({ standardInput: process.stdin }));
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(applyNpmPackageDependencyProjection(input))}\n` });
}
