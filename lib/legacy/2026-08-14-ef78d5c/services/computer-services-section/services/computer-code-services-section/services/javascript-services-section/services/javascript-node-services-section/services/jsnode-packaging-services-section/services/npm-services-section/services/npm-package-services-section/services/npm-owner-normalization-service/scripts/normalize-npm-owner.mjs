#!/usr/bin/env node
import { admitNonemptySingleLineText } from "@red-cup-engineering/nonempty-single-line-text-admission-service";
import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

const OWNER = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

export function normalizeNpmOwner(owner) {
  const normalized = admitNonemptySingleLineText(owner).replace(/^@/u, "").toLowerCase();
  if (!OWNER.test(normalized)) throw new TypeError("owner must yield a valid unscoped npm owner");
  return normalized;
}

if (import.meta.main) {
  const parsed = parseJavascriptArgv({ argumentVector: process.argv, allowPositionals: true });
  if (parsed.positionals.length !== 1) throw new TypeError("exactly one npm owner is required");
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${normalizeNpmOwner(parsed.positionals[0])}\n` });
}
