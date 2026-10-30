#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { immutableJsonValue } from "@red-cup-engineering/immutable-json-value-service";
import { parseLines, serializeLines } from "@red-cup-engineering/json-codec-service";
import { readJavascriptFileExportDocumentation } from "@red-cup-engineering/read-javascript-file-export-documentation-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

/**
 * Projects one complete JavaScript argument-vector carrier to its user-supplied argument tail.
 * @param {object} vector A JavascriptArgumentVector@1 carrying runtime, program, and user argument strings.
 * @returns {object} An immutable JavascriptArgvTail@1 carrying only the user arguments.
 * @throws {TypeError} When the vector carrier is inexact or contains non-string arguments.
 */
export function projectJavascriptArgvTail(vector) {
  if (vector === null || typeof vector !== "object" || Array.isArray(vector)) throw new TypeError("input must be a JavascriptArgumentVector");
  if (Object.keys(vector).sort().join(",") !== "arguments,type,version") throw new TypeError("vector must carry exactly arguments, type, and version");
  if (vector.type !== "JavascriptArgumentVector" || vector.version !== 1) throw new TypeError("vector type and version must be JavascriptArgumentVector@1");
  if (!Array.isArray(vector.arguments) || vector.arguments.length < 2 || vector.arguments.some((argument) => typeof argument !== "string")) throw new TypeError("vector.arguments must contain string runtime and program addresses followed by user arguments");
  return immutableJsonValue({ type: "JavascriptArgvTail", version: 1, arguments: vector.arguments.slice(2) });
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("projectJavascriptArgvTail — Projects one complete JavaScript argument-vector carrier to its user-supplied argument tail.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.length > 0) process.stdout.write(`${JSON.stringify(projectJavascriptArgvTail(JSON.parse(line)))}\n`);
    }
  }
}
