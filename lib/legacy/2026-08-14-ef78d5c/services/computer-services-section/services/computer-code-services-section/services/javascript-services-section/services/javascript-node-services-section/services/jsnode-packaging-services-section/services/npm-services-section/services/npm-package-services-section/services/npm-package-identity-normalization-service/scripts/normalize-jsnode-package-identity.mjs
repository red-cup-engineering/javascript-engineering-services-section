#!/usr/bin/env node
import { immutableJsonValue } from "@red-cup-engineering/immutable-json-value-service";
import { projectJsnodePackageIdentityLeaf } from "@red-cup-engineering/jsnode-package-identity-leaf-projection-service";
import { canonical } from "@red-cup-engineering/json-codec-service";
import { admitNonemptySingleLineText } from "@red-cup-engineering/nonempty-single-line-text-admission-service";
import { normalizeNpmOwner } from "@red-cup-engineering/npm-owner-normalization-service";
import { formNpmScopedPackageName } from "@red-cup-engineering/npm-scoped-package-name-formation-service";
import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

const USAGE = "usage: normalize-jsnode-package-identity --package-name NAME --owner OWNER\n";

export function normalizeJsnodePackageIdentity({ packageName, owner } = {}) {
  let priorName;
  try {
    priorName = admitNonemptySingleLineText(packageName);
  } catch (cause) {
    throw new TypeError("packageName must be one nonempty line of text", { cause });
  }
  const normalizedOwner = normalizeNpmOwner(owner);
  const leaf = projectJsnodePackageIdentityLeaf(priorName);
  return immutableJsonValue({
    type: "JsnodePackageIdentityNormalization",
    priorName,
    owner: normalizedOwner,
    leaf,
    name: formNpmScopedPackageName({ owner: normalizedOwner, leaf }),
  });
}

if (import.meta.main) {
  const parsed = parseJavascriptArgv({
    argumentVector: process.argv,
    options: {
      "package-name": { type: "string" },
      owner: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (parsed.options.help) {
    await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: USAGE });
  } else {
    if (typeof parsed.options["package-name"] !== "string" || typeof parsed.options.owner !== "string") throw new TypeError(USAGE.trim());
    const identity = normalizeJsnodePackageIdentity({ packageName: parsed.options["package-name"], owner: parsed.options.owner });
    await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(identity)}\n` });
  }
}
