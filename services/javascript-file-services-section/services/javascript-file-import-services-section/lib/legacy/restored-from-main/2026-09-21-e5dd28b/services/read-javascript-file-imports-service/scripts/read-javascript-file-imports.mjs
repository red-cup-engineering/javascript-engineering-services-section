#!/usr/bin/env node

import { immutableJsonValue } from "../../../../../../../../../../computer-data-engineering-services-section/services/serialized-computer-data-engineering-services-section/services/json-services-section/src/index.mjs";

import { requireTextFileRead } from "@red-cup-engineering/read-text-file-service/require-text-file-read";

import ts from "typescript";
import operationInputSchema from "../data/records/schema/read-javascript-file-imports.input.schema.json" with { type: "json" };
import operationOutputSchema from "../data/records/schema/read-javascript-file-imports.output.schema.json" with { type: "json" };
import { runJavascriptNodeOperation } from "../../../../../../javascript-node-services-section/src/operation.mjs";

/**
 * Reads the module imports carried by one JavaScript text-file reading without resolving them.
 * @param {object} reading A TextFileRead containing one JavaScript path and its source text.
 * @returns {object} An immutable JavascriptFileImportsRead@1 carrying ordered JavascriptFileImport@1 records.
 * @throws {TypeError} When the input is not exactly a TextFileRead carrier.
 * @throws {SyntaxError} When the carried JavaScript does not parse.
 */
export function readJavascriptFileImports(reading) {
  const { path, text } = requireTextFileRead(reading, { exactKeys: true });
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  if (source.parseDiagnostics.length > 0) throw new SyntaxError(ts.flattenDiagnosticMessageText(source.parseDiagnostics[0].messageText, "\n"));

  const imports = [];
  const read = (literal, kind) => {
    if (!literal || !ts.isStringLiteralLike(literal)) return;
    imports.push({ type: "JavascriptFileImport", version: 1, path, specifier: literal.text, start: literal.getStart(source) + 1, end: literal.getEnd() - 1, kind });
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) read(node.moduleSpecifier, "import");
    else if (ts.isExportDeclaration(node)) read(node.moduleSpecifier, "export-from");
    else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) read(node.arguments[0], "dynamic-import");
      else if (ts.isIdentifier(node.expression) && node.expression.text === "require") read(node.arguments[0], "require");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return immutableJsonValue({ type: "JavascriptFileImportsRead", version: 1, path, imports: imports.sort((left, right) => left.start - right.start) });
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "read-javascript-file-imports", description: "Reads the module imports carried by one JavaScript text-file reading without resolving them.", operation: readJavascriptFileImports, inputSchema: operationInputSchema, outputSchema: operationOutputSchema }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
