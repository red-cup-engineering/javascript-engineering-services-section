import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseLines, serializeLines } from "@red-cup-engineering/jsonl-services-section";
import { readJavascriptFileImports } from "../scripts/read-javascript-file-imports.mjs";

const command = fileURLToPath(new URL("../scripts/read-javascript-file-imports.mjs", import.meta.url));

test("reads each supported authored import form in source order", () => {
  // "require(...)" is dropped from the supported forms: the reader is built over the house's own
  // SPECIFIER scan (static import, export-from, dynamic import(), import.meta.resolve), which reads
  // ECMAScript module specifiers, not CommonJS calls — see JN's audit-layer-imports.mjs.
  const path = "/workspace/src/index.mjs";
  const text = "import value from './value.mjs';\nexport { other } from \"../other.mjs\";\nconst later = import('./later.mjs');\nconst target = import.meta.resolve('./meta.mjs');\n";
  const reading = readJavascriptFileImports({ type: "TextFileRead", path, text });
  assert.equal(reading.type, "JavascriptFileImportsRead");
  assert.equal(reading.version, 1);
  assert.equal(reading.path, path);
  assert.deepEqual(reading.imports.map(({ type, version, specifier, kind }) => ({ type, version, specifier, kind })), [
    { type: "JavascriptFileImport", version: 1, specifier: "./value.mjs", kind: "import" },
    { type: "JavascriptFileImport", version: 1, specifier: "../other.mjs", kind: "export-from" },
    { type: "JavascriptFileImport", version: 1, specifier: "./later.mjs", kind: "dynamic-import" },
    { type: "JavascriptFileImport", version: 1, specifier: "./meta.mjs", kind: "import-meta-resolve" },
  ]);
  assert.ok(reading.imports.every((record) => record.path === path && Number.isInteger(record.start) && Number.isInteger(record.end) && record.start < record.end));
});

test("a bare import with no binding is read too, and start/end exclude the quote characters", () => {
  const text = "import './side-effect.mjs';\n";
  const [record] = readJavascriptFileImports({ type: "TextFileRead", path: "/workspace/src/index.mjs", text }).imports;
  assert.equal(record.kind, "import");
  assert.equal(record.specifier, "./side-effect.mjs");
  assert.equal(text.slice(record.start, record.end), "./side-effect.mjs");
});

test("ignores comments, strings, and a dynamic import() call whose argument is not a string literal", () => {
  // Dropped along with the TypeScript-compiler-based reader this replaces: "import type { Value }
  // from './value.mjs'" and a .mts path. TypeScript-only syntax is out of scope for a reader built
  // over the house's plain-JavaScript SPECIFIER scan; readJavascriptFileImports now describes only
  // what it actually reads.
  const text = "// import './fiction.mjs'\nconst fiction = \"from './also-fiction.mjs'\";\nimport { value } from './value.mjs';\nconst unresolved = import(variable);\n";
  assert.deepEqual(readJavascriptFileImports({ type: "TextFileRead", path: "/workspace/src/index.mjs", text }).imports.map(({ specifier }) => specifier), ["./value.mjs"]);
});

test("ignores a JSDoc import() type reference, an import line written into a block comment, and a template literal holding an import example; a real import after each is still read with correct offsets", () => {
  const text = [
    "/** @param {import('./fiction.mjs').Thing} value */",
    "/*",
    "import { fake } from './fiction.mjs';",
    "*/",
    "const doc = `import { fake } from './fiction.mjs'`;",
    "import { real } from './real.mjs';",
    "",
  ].join("\n");
  const { imports } = readJavascriptFileImports({ type: "TextFileRead", path: "/workspace/src/index.mjs", text });
  assert.deepEqual(imports.map(({ specifier }) => specifier), ["./real.mjs"]);
  const [record] = imports;
  assert.equal(text.slice(record.start, record.end), "./real.mjs");
});

test("refuses a malformed carrier", () => {
  // Dropped along with the TypeScript-compiler-based reader this replaces: a case asserting
  // `readJavascriptFileImports` throws SyntaxError on unparseable JavaScript (e.g. "import {"). A
  // text scan over SPECIFIER, like every other reader built on it in this house, has no grammar to
  // fail against — it reports whatever specifiers the pattern matches and nothing where it doesn't,
  // rather than validating that the file parses at all. That is a different capability.
  assert.throws(() => readJavascriptFileImports({ type: "TextFileRead", path: "x.mjs", text: "", extra: true }), /exactly/);
});

test("command maps each input carrier to exactly the library result carrier", () => {
  const inputs = [
    { type: "TextFileRead", path: "one.mjs", text: "import './one.mjs';\n" },
    { type: "TextFileRead", path: "two.mjs", text: "export * from './two.mjs';\n" },
  ];
  const result = spawnSync(process.execPath, [command], { input: serializeLines(inputs), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(parseLines(result.stdout), inputs.map(readJavascriptFileImports));
});

test("command help is read from the exported operation JSDoc", () => {
  const result = spawnSync(process.execPath, [command, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Reads the module imports carried by one JavaScript text-file reading without resolving them\./);
  assert.match(result.stdout, /read-javascript-file-imports/);
});
