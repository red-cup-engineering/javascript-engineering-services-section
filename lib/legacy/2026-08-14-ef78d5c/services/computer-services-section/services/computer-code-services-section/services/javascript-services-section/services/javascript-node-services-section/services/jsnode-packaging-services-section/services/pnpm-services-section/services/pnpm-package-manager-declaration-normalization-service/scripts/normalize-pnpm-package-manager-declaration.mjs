#!/usr/bin/env node
import { immutableJsonValue } from "@red-cup-engineering/immutable-json-value-service";
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { admitNpmPackageManifest } from "@red-cup-engineering/npm-package-manifest-admission-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function normalizePnpmPackageManagerDeclaration(manifest) {
  const admittedManifest = admitNpmPackageManifest(manifest);
  if (!admittedManifest.packageManager?.startsWith("pnpm@")) return admittedManifest;
  const { packageManager: _removedPackageManager, ...normalizedManifest } = admittedManifest;
  return immutableJsonValue(normalizedManifest);
}

if (import.meta.main) {
  const manifest = parse(await readJavascriptNodeStandardInputText({ standardInput: process.stdin }));
  const normalized = normalizePnpmPackageManagerDeclaration(manifest);
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(normalized)}\n` });
}
