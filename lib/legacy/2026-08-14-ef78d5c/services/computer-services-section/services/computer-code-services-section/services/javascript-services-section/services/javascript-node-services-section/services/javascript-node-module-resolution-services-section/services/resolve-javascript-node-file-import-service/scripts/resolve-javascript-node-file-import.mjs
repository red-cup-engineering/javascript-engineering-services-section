#!/usr/bin/env node
import { access } from "node:fs/promises";
import { parseLines, serializeLines } from "@red-cup-engineering/json-codec-service";
import { projectFilepathDirectory } from "@red-cup-engineering/project-filepath-directory-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

const SUFFIXES = Object.freeze(["", ".js", ".mjs", ".cjs", ".json", "/index.js", "/index.mjs", "/index.cjs"]);

function refusal(importRecord, reason) {
  return Object.freeze({ type: "JavascriptNodeFileImportResolutionRefusal", import: importRecord, reason });
}

export async function resolveJavascriptNodeFileImport(importRecord) {
  if (importRecord?.type !== "JavascriptFileImport") throw new TypeError("input must be a JavascriptFileImport carrier");
  if (typeof importRecord.path !== "string" || typeof importRecord.specifier !== "string") throw new TypeError("import path and specifier must be strings");
  if (!importRecord.specifier.startsWith("./") && !importRecord.specifier.startsWith("../")) return refusal(importRecord, "non-relative-specifier");
  const base = resolveFilepath([projectFilepathDirectory(importRecord.path), importRecord.specifier]);
  for (const suffix of SUFFIXES) {
    const candidate = `${base}${suffix}`;
    try {
      await access(candidate);
      return Object.freeze({ type: "ResolvedJavascriptNodeFileImport", import: importRecord, targetPath: candidate });
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
    }
  }
  return refusal(importRecord, "unresolved-relative-specifier");
}

if (import.meta.main) {
  const text = await readJavascriptNodeStandardInputText({ standardInput: process.stdin });
  const resolutions = await Promise.all(parseLines(text).map(resolveJavascriptNodeFileImport));
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: serializeLines(resolutions) });
}
