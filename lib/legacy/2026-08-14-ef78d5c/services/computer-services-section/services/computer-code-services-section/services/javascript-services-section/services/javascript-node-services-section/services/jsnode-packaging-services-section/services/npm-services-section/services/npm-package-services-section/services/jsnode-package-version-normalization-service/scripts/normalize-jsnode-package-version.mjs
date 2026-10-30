#!/usr/bin/env node
import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function normalizeJsnodePackageVersion(version) {
  return /^\d+\.\d+\.\d+$/u.test(version ?? "") ? version : "0.1.0";
}

if (import.meta.main) {
  const parsed = parseJavascriptArgv({ argumentVector: process.argv, allowPositionals: true });
  if (parsed.positionals.length > 1) throw new TypeError("zero or one candidate version may be supplied");
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${normalizeJsnodePackageVersion(parsed.positionals[0])}\n` });
}
