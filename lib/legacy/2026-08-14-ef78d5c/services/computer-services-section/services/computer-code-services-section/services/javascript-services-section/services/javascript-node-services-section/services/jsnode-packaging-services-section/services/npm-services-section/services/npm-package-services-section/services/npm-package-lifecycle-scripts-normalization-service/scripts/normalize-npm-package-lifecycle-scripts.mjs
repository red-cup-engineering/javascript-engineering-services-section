#!/usr/bin/env node
import { immutableJsonValue } from "@red-cup-engineering/immutable-json-value-service";
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { admitNpmPackageManifest } from "@red-cup-engineering/npm-package-manifest-admission-service";
import { normalizePnpmLifecycleCommand } from "@red-cup-engineering/pnpm-lifecycle-command-normalization-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function normalizeNpmPackageLifecycleScripts(manifest) {
  const admittedManifest = admitNpmPackageManifest(manifest);
  if (!admittedManifest.scripts) return admittedManifest;
  const scripts = Object.fromEntries(Object.entries(admittedManifest.scripts).map(([name, command]) => [
    name,
    typeof command === "string" ? normalizePnpmLifecycleCommand(command) : command,
  ]));
  return immutableJsonValue({ ...admittedManifest, scripts });
}

if (import.meta.main) {
  const manifest = parse(await readJavascriptNodeStandardInputText({ standardInput: process.stdin }));
  const normalized = normalizeNpmPackageLifecycleScripts(manifest);
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(normalized)}\n` });
}
