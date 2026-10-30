#!/usr/bin/env node
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { admitNpmPackageManifest } from "@red-cup-engineering/npm-package-manifest-admission-service";
import { projectFilepathDirectory } from "@red-cup-engineering/project-filepath-directory-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function projectNpmPackageCustody(reading) {
  if (reading?.type !== "NpmPackageManifestRead") throw new TypeError("input must be an NpmPackageManifestRead carrier");
  if (typeof reading.path !== "string" || reading.path.length === 0) throw new TypeError("manifest reading path must be a nonempty string");
  const manifest = admitNpmPackageManifest(reading.manifest);
  if (typeof manifest.name !== "string" || manifest.name.length === 0) throw new TypeError("npm package manifest name must be a nonempty string");
  if (typeof manifest.version !== "string" || manifest.version.length === 0) throw new TypeError("npm package manifest version must be a nonempty string");
  return Object.freeze({
    type: "NpmPackageCustody",
    manifestPath: reading.path,
    directory: projectFilepathDirectory(reading.path),
    name: manifest.name,
    version: manifest.version,
    ...(manifest.exports === undefined ? {} : { exports: manifest.exports }),
  });
}

if (import.meta.main) {
  const input = parse(await readJavascriptNodeStandardInputText({ standardInput: process.stdin }));
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(projectNpmPackageCustody(input))}\n` });
}
