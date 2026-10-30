#!/usr/bin/env node
import { requireTextFileRead } from "@red-cup-engineering/read-text-file-service/require-text-file-read";
import ts from "typescript";
import { runJavascriptNodeOperation } from "../../../../../../javascript-node-services-section/src/operation.mjs";

function isImportMetaMain(expression) {
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "main" &&
    ts.isMetaProperty(expression.expression) &&
    expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    expression.expression.name.text === "meta"
  );
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
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  if (source.parseDiagnostics.length > 0) {
    throw new SyntaxError(ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, "\n"));
  }
  const guards = [];
  const visit = (node) => {
    if (ts.isIfStatement(node) && isImportMetaMain(node.expression)) {
      guards.push(Object.freeze({
        type: "JavascriptFileMainGuard",
        version: 1,
        path,
        start: node.getStart(source),
        end: node.getEnd(),
      }));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return Object.freeze(guards);
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "read-javascript-file-main-guards", description: "Reads real if (import.meta.main) statements from one parsed JavaScript file.", operation: readJavascriptFileMainGuards }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
