#!/usr/bin/env node
// Pure ordered replacement of admitted npm package identity references in
// one source resource.
//
// Usage:
//   node scripts/normalize-jsnode-package-identity-references.mjs \
//     --source-file src/thing.mjs \
//     --replacements '[["@emsenn/a", "@owner/a"]]'
//
//   echo 'import "@emsenn/a";' | \
//     node scripts/normalize-jsnode-package-identity-references.mjs \
//       --replacements '[["@emsenn/a", "@owner/a"]]'

import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { parse } from "@red-cup-engineering/json-codec-service";
import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function normalizeJsnodePackageIdentityReferences({ source, replacements } = {}) {
  if (typeof source !== "string" || !Array.isArray(replacements)) throw new TypeError("source and replacements are required");
  let result = source;
  for (const replacement of replacements) {
    if (!Array.isArray(replacement) || replacement.length !== 2 || replacement.some((value) => typeof value !== "string")) throw new TypeError("each replacement must be a string pair");
    result = result.replaceAll(replacement[0], replacement[1]);
  }
  return result;
}

if (import.meta.main) {
  const parsed = parseJavascriptArgv({
    argumentVector: process.argv,
    options: {
      source: { type: "string" },
      "source-file": { type: "string" },
      replacements: { type: "string" },
    },
  });
  if (typeof parsed.options.replacements !== "string") throw new TypeError("--replacements is required");
  if (parsed.options.source !== undefined && parsed.options["source-file"] !== undefined) {
    throw new TypeError("--source and --source-file are mutually exclusive");
  }
  let source = parsed.options.source;
  if (source === undefined && parsed.options["source-file"] !== undefined) source = await readFileText(parsed.options["source-file"]);
  if (source === undefined) source = await readJavascriptNodeStandardInputText({ standardInput: process.stdin });
  const normalized = normalizeJsnodePackageIdentityReferences({ source, replacements: parse(parsed.options.replacements) });
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: normalized });
}
