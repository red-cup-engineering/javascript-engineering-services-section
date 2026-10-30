#!/usr/bin/env node
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { normalizeNpmPackageLifecycleScripts } from "@red-cup-engineering/npm-package-lifecycle-scripts-normalization-service";
import { applyNpmPackageManifestIdentity } from "@red-cup-engineering/npm-package-manifest-identity-application-service";
import { normalizeNpmPackageManifestVersion } from "@red-cup-engineering/npm-package-manifest-version-normalization-service";
import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { normalizePnpmEngineDeclaration } from "@red-cup-engineering/pnpm-engine-declaration-normalization-service";
import { normalizePnpmPackageManagerDeclaration } from "@red-cup-engineering/pnpm-package-manager-declaration-normalization-service";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

const usage = "usage: normalize-jsnode-package-manifest --manifest PATH --identity-name NAME\n";

export function normalizeJsnodePackageManifest({ manifest, identity } = {}) {
  const identifiedManifest = applyNpmPackageManifestIdentity({ manifest, identity });
  const versionedManifest = normalizeNpmPackageManifestVersion(identifiedManifest);
  const packageManagerNormalizedManifest = normalizePnpmPackageManagerDeclaration(versionedManifest);
  const engineNormalizedManifest = normalizePnpmEngineDeclaration(packageManagerNormalizedManifest);
  return normalizeNpmPackageLifecycleScripts(engineNormalizedManifest);
}

if (import.meta.main) {
  const parsedArguments = parseJavascriptArgv({
    argumentVector: process.argv,
    options: {
      manifest: { type: "string" },
      "identity-name": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (parsedArguments.options.help) {
    await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: usage });
  } else {
    if (!parsedArguments.options.manifest || !parsedArguments.options["identity-name"]) throw new TypeError(usage.trimEnd());
    const manifestPath = resolveFilepath([parsedArguments.options.manifest]);
    const manifest = parse(await readFileText(manifestPath));
    const normalizedManifest = normalizeJsnodePackageManifest({
      manifest,
      identity: { name: parsedArguments.options["identity-name"] },
    });
    await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(normalizedManifest)}\n` });
  }
}
