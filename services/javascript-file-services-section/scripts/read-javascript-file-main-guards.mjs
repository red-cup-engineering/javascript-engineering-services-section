#!/usr/bin/env node
import { requireTextFileRead } from "@red-cup-engineering/computer-file-engineering-services-section/require-text-file-read";
import { parseJavaScript, walkJavaScript } from "@red-cup-engineering/javascript-node-services-section/javascript-parser";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

function isImportMetaMain(expression) {
  return expression.type === "MemberExpression" && !expression.computed && expression.property.name === "main"
    && expression.object.type === "MetaProperty" && expression.object.meta.name === "import" && expression.object.property.name === "meta";
}

/**
 * Reads real if (import.meta.main) statements from one parsed JavaScript file.
 *
 * @param {object} reading A TextFileRead carrying JavaScript source.
 * @returns {readonly object[]} JavascriptFileMainGuard records in source order.
 * @throws {TypeError} When the input is not a TextFileRead carrier.
 * @throws {SyntaxError} When the carried JavaScript does not parse.
 */
export function readJavascriptFileMainGuards(reading) {
  const { path, text } = requireTextFileRead(reading);
  const program = parseJavaScript(text);
  const guards = [];
  walkJavaScript(program, (node) => {
    if (node.type === "IfStatement" && isImportMetaMain(node.test)) {
      guards.push(Object.freeze({ type: "JavascriptFileMainGuard", version: 1, path, start: node.start, end: node.end }));
    }
  });
  return Object.freeze(guards);
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "read-javascript-file-main-guards", description: "Reads real if (import.meta.main) statements from one parsed JavaScript file.", operation: readJavascriptFileMainGuards }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
