#!/usr/bin/env node
import { immutableJsonValue } from "@red-cup-engineering/immutable-json-value-service";
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { admitNpmPackageManifest } from "@red-cup-engineering/npm-package-manifest-admission-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function applyNpmPackageManifestIdentity({ manifest, identity } = {}) {
  const admittedManifest = admitNpmPackageManifest(manifest);
  if (!identity || typeof identity.name !== "string" || identity.name.length === 0) throw new TypeError("identity.name must be a nonempty string");
  return immutableJsonValue({ ...admittedManifest, name: identity.name });
}

if (import.meta.main) {
  const request = parse(await readJavascriptNodeStandardInputText({ standardInput: process.stdin }));
  const manifest = applyNpmPackageManifestIdentity(request);
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(manifest)}\n` });
}
