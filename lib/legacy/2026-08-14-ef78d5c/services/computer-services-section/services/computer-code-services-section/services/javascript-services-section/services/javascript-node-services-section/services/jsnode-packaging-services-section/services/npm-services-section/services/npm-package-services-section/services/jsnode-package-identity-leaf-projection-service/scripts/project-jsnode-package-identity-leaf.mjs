#!/usr/bin/env node
import { admitNonemptySingleLineText } from "@red-cup-engineering/nonempty-single-line-text-admission-service";
import { admitNpmPackageNameLeaf } from "@red-cup-engineering/npm-package-name-leaf-admission-service";
import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function projectJsnodePackageIdentityLeaf(packageName) {
  const admittedName = admitNonemptySingleLineText(packageName);
  const slash = admittedName.startsWith("@") ? admittedName.indexOf("/") : -1;
  const source = (slash >= 0 ? admittedName.slice(slash + 1) : admittedName).toLowerCase();
  const leaf = source.replace(/^eo-/u, "").replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "");
  try {
    return admitNpmPackageNameLeaf(leaf);
  } catch {
    throw new TypeError("packageName does not yield a valid npm package leaf");
  }
}

if (import.meta.main) {
  const parsed = parseJavascriptArgv({ argumentVector: process.argv, allowPositionals: true });
  if (parsed.positionals.length !== 1) throw new TypeError("exactly one package name is required");
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${projectJsnodePackageIdentityLeaf(parsed.positionals[0])}\n` });
}
