#!/usr/bin/env node

import { freezeJson } from "@red-cup-engineering/json-services-section";

import { requireTextFileRead } from "@red-cup-engineering/computer-file-engineering-services-section/require-text-file-read";

import { SPECIFIER, stripCommentsAndLiterals } from "@red-cup-engineering/javascript-node-services-section/audit-layer-imports";
import operationInputSchema from "../data/records/read-javascript-file-imports.input.schema.json" with { type: "json" };
import operationOutputSchema from "../data/records/read-javascript-file-imports.output.schema.json" with { type: "json" };
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

// The house's own import scan (SPECIFIER, in javascript-node-services-section/scripts/audit-layer-
// imports.mjs) already reads every authored specifier a JavaScript file carries — a static `import
// ... from`, `export ... from`, a bare `import "x"`, a dynamic `import(...)`, and `import.meta
// .resolve(...)` — without needing a parser. Reusing it here, rather than a second implementation
// built on the hired "typescript" package (this house runs no external dependencies), is what makes
// this reader loadable at all: nothing here installs "typescript".
//
// The trade against a real parser: this is a text scan, not a grammar, so (like SPECIFIER's other
// callers) it never throws on malformed JavaScript — it just finds whatever specifiers the pattern
// matches and reports nothing where the pattern doesn't. A caller that needs "does this file even
// parse" wants a different capability than "what does this file import".

/** One matched specifier's authored form: which SPECIFIER alternative matched decides the kind, and for the shared "from" alternative (imports and export-froms alike) whether the statement itself opens with `import` or `export`. */
function importKindOf(match) {
  if (match[1] !== undefined) return match[0].replace(/^[\n;]/u, "").trimStart().startsWith("export") ? "export-from" : "import";
  if (match[2] !== undefined) return "import";
  if (match[3] !== undefined) return "dynamic-import";
  return "import-meta-resolve";
}

function specifierGroup(match) {
  if (match[1] !== undefined) return 1;
  if (match[2] !== undefined) return 2;
  if (match[3] !== undefined) return 3;
  return 4;
}

/**
 * Reads the module imports carried by one JavaScript text-file reading without resolving them.
 * @param {object} reading A TextFileRead containing one JavaScript path and its source text.
 * @returns {object} An immutable JavascriptFileImportsRead@1 carrying ordered JavascriptFileImport@1 records.
 * @throws {TypeError} When the input is not exactly a TextFileRead carrier.
 */
export function readJavascriptFileImports(reading) {
  const { path, text } = requireTextFileRead(reading, { exactKeys: true });

  const imports = [];
  // stripCommentsAndLiterals masks every comment, regex literal, and non-import string or
  // template literal to spaces before the scan, preserving every other character's position -- a
  // JSDoc `{import("./x.mjs")}` type reference, an import line written into a block comment, or a
  // template literal holding an import-shaped documentation example is text, not an authored
  // import, and match.indices below still lands on the same offsets `text` itself would give.
  for (const match of stripCommentsAndLiterals(text).matchAll(SPECIFIER)) {
    const group = specifierGroup(match);
    const [start, end] = match.indices[group];
    imports.push({ type: "JavascriptFileImport", version: 1, path, specifier: match[group], start, end, kind: importKindOf(match) });
  }

  return freezeJson({ type: "JavascriptFileImportsRead", version: 1, path, imports: imports.sort((left, right) => left.start - right.start) });
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "read-javascript-file-imports", description: "Reads the module imports carried by one JavaScript text-file reading without resolving them.", operation: readJavascriptFileImports, inputSchema: operationInputSchema, outputSchema: operationOutputSchema }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
