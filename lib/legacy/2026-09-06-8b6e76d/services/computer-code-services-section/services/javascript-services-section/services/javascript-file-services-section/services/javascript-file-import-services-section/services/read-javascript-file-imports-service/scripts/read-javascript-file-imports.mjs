#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { immutableJsonValue } from "@red-cup-engineering/immutable-json-value-service";
import { parseLines, serializeLines } from "@red-cup-engineering/json-codec-service";
import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { readJavascriptFileExportDocumentation } from "@red-cup-engineering/read-javascript-file-export-documentation-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { requireTextFileRead } from "@red-cup-engineering/read-text-file-service/require-text-file-read";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";
import ts from "typescript";

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
  if (process.argv.includes("--help")) {
    process.stdout.write("readJavascriptFileImports — Reads the module imports carried by one JavaScript text-file reading without resolving them.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.length > 0) process.stdout.write(`${JSON.stringify(readJavascriptFileImports(JSON.parse(line)))}\n`);
    }
  }
}
