#!/usr/bin/env node
import { once } from "node:events";
import { parseLines, serializeLines } from "@red-cup-engineering/jsonl-services-section";
import { requireTextFileRead } from "@red-cup-engineering/computer-file-engineering-services-section/require-text-file-read";
import { jsdocOf, parseJavaScript, parseJsdoc } from "@red-cup-engineering/javascript-node-services-section/javascript-parser";

function documentation(program, node) {
  const block = jsdocOf(program, node);
  const parsed = block ? parseJsdoc(block.value) : { description: "", tags: [] };
  const parameters = [];
  const throws = [];
  const tags = [];
  let returns = null;
  for (const tag of parsed.tags) {
    if (tag.tag === "param" || tag.tag === "arg" || tag.tag === "argument") {
      parameters.push(Object.freeze({ name: tag.name, type: tag.type, description: tag.description }));
    } else if (tag.tag === "returns" || tag.tag === "return") {
      returns = Object.freeze({ type: tag.type, description: tag.description });
    } else if (tag.tag === "throws" || tag.tag === "throw" || tag.tag === "exception") {
      throws.push(Object.freeze({ type: tag.type, description: tag.description }));
    } else {
      tags.push(Object.freeze({ name: tag.tag, text: tag.text ?? tag.description ?? "" }));
    }
  }
  return Object.freeze({
    description: parsed.description,
    parameters: Object.freeze(parameters),
    returns,
    throws: Object.freeze(throws),
    tags: Object.freeze(tags),
  });
}

const squash = (text) => text.replace(/\s+/gu, " ").trim();

function reexportedFunctionSignature(name, parameters) {
  return `export function ${name}(${parameters.map((parameter) => parameter.name).join(", ")})`;
}

function record(path, name, signature, doc) {
  return Object.freeze({ type: "JavascriptFileExportDocumentation", version: 1, path, name, kind: "function", signature, ...doc });
}

function exportedFunctionDocumentation(statement, program, text, path) {
  if (statement.type !== "ExportNamedDeclaration") return [];
  const declaration = statement.declaration;
  if (declaration?.type === "FunctionDeclaration" && declaration.id) {
    return [record(path, declaration.id.name, squash(text.slice(statement.start, declaration.body.start)), documentation(program, statement))];
  }
  if (!declaration && statement.specifiers.length > 0) {
    const doc = documentation(program, statement);
    return statement.specifiers.map((specifier) => {
      const name = specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value;
      return record(path, name, reexportedFunctionSignature(name, doc.parameters), doc);
    });
  }
  if (declaration?.type !== "VariableDeclaration") return [];
  const records = [];
  for (const declarator of declaration.declarations) {
    if (declarator.id.type !== "Identifier") continue;
    const init = declarator.init;
    if (!init || (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression")) continue;
    const end = init.body.type === "BlockStatement" || init.type === "FunctionExpression" ? init.body.start : init.body.start;
    const signature = squash(text.slice(statement.start, end)).replace(/\s*=>\s*$/u, " =>");
    records.push(record(path, declarator.id.name, signature, documentation(program, statement)));
  }
  return records;
}

/**
 * Reads standard JSDoc attached to every exported function in one JavaScript file reading.
 *
 * @param {object} reading A TextFileRead carrying the JavaScript path and source text.
 * @returns {readonly object[]} JavascriptFileExportDocumentation records in source order.
 * @throws {TypeError} When the input is not a TextFileRead carrier.
 * @throws {SyntaxError} When the carried JavaScript does not parse.
 */
export function readJavascriptFileExportDocumentation(reading) {
  const { path, text } = requireTextFileRead(reading);
  const program = parseJavaScript(text);
  return Object.freeze(program.body.flatMap((statement) => exportedFunctionDocumentation(statement, program, text, path)));
}

if (import.meta.main) {
  process.stdin.setEncoding("utf8");
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  const documentation = parseLines(text).flatMap(readJavascriptFileExportDocumentation);
  const output = serializeLines(documentation);
  if (!process.stdout.write(output)) await once(process.stdout, "drain");
}
