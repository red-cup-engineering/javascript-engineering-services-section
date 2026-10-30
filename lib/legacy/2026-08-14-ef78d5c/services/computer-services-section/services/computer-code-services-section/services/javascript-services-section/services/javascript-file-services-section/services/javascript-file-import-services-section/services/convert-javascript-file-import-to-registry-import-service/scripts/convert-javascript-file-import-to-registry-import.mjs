#!/usr/bin/env node
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function convertJavascriptFileImportToRegistryImport(crossPackageImport) {
  if (crossPackageImport?.type !== "CrossPackageJavascriptFileImport") throw new TypeError("input must be a CrossPackageJavascriptFileImport carrier");
  const { import: importRecord, provider, providerSubpath } = crossPackageImport;
  if (typeof provider?.name !== "string" || provider.name.length === 0) throw new TypeError("provider package name must be a nonempty string");
  if (typeof providerSubpath !== "string" || !providerSubpath.startsWith("./")) throw new TypeError("provider subpath must begin with ./");
  return Object.freeze({
    type: "TextFileContentEdit",
    derivation: "JavascriptFileImportRegistryConversion",
    path: importRecord.path,
    start: importRecord.start,
    end: importRecord.end,
    before: importRecord.specifier,
    after: `${provider.name}/${providerSubpath.slice(2)}`,
  });
}

if (import.meta.main) {
  const input = parse(await readJavascriptNodeStandardInputText({ standardInput: process.stdin }));
  const conversion = convertJavascriptFileImportToRegistryImport(input);
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(conversion)}\n` });
}
