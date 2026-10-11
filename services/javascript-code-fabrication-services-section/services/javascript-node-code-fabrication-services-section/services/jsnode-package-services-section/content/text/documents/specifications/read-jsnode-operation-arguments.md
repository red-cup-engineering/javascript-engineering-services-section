# read-jsnode-operation-arguments
## Requirements
- `structured-arguments-record`: The operation returns a JsnodeOperationArguments record for one complete JavaScript ESM script's source, carrying type, version, path, exportName, exportCount, isAsync, description, params, returns, inputSchema, outputSchema, throws, imports, hasMainGuard, readsStdin, writesStdout, bodyText, shebang, and residue.
- `single-export-detection`: The operation counts top-level exported function declarations (named or default) in `exportCount`, sets `exportName` to that single function's name only when exactly one exists, else `null`, and sets `isAsync` true iff that single function carries the `async` modifier.
- `jsdoc-composition`: The operation reads `description`, `params`, `returns`, and `throws` from the exported function's JSDoc by composing `@red-cup-engineering/read-javascript-file-export-documentation-service`, never by re-deriving JSDoc parsing.
- `guard-and-stdio-detection`: The operation sets `hasMainGuard` true iff a top-level `if (import.meta.main)` statement exists, and `readsStdin`/`writesStdout` true iff an identifier naming `stdin`/`stdout` appears inside that guard.
- `body-text-capture`: The operation captures the single exported function's complete source text, including any leading JSDoc comment exactly as authored, verbatim in `bodyText`.
- `import-and-residue-listing`: The operation lists every top-level import declaration in `imports` (source, names, optional namespace, optional default) and every top-level declaration other than the export, the imports, and the main guard by name in `residue`.
- `pure-reading`: The operation performs no filesystem access; `text` and `path` are used only as strings and parsed as an in-memory AST.
- `schema-derivation`: The operation derives `inputSchema` from the single `@param`'s JSDoc type and description and `outputSchema` from `@returns`'s JSDoc type and description, one carrier in and one carrier out for every operation the org runs: each is a JSON Schema draft 2020-12 object carrying `$schema` (`https://json-schema.org/draft/2020-12/schema`), `title` (`<exportName>Input` / `<exportName>Output`), the type-derived keys (`object`→`{"type":"object"}`, `string`→`{"type":"string"}`, `number`→`{"type":"number"}`, `boolean`→`{"type":"boolean"}`, `Array<T>`/`T[]`→`{"type":"array","items":<T's schema>}`, `*` or any other spelling→`{}`), and `description`; `inputSchema` is `null` unless the exported function's JSDoc carries exactly one `@param`, and `outputSchema` is `null` unless it carries an `@returns`, so a function with no discoverable JSDoc yields both `null`.
## Prohibitions
- `missing-text-refusal`: The operation must refuse a request whose `text` is not a string.
- `invalid-path-refusal`: The operation must refuse a request whose `path` does not match `^scripts/[a-z][a-z0-9-]*\.mjs$`.
## Laws
- `jsnode-one-form` | jsnode-package-services-section README | v1 | lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-code-engineering-services-section/services/javascript-engineering-services-section/services/javascript-code-fabrication-services-section/services/javascript-node-code-fabrication-services-section/services/jsnode-package-services-section/README.md | Applies to the one canonical operation shape this operation reads a script's conformance against. | "The operation file starts with the Node shebang, exports exactly one JSDoc-documented function, and contains the real `if (import.meta.main)` command guard" — this operation's output fields (exportCount, hasMainGuard, shebang, residue) are exactly the measurements of a script's distance from that one form.
- `scripts-import-scripts-and-src` | org-layering.md / import-stratification.md | v1 | .claude/rules/import-stratification.md | Applies to how this operation's own source file composes existing capability. | "scripts can import scripts and src." This operation imports only the `typescript` compiler package and the scripts-seated `@red-cup-engineering/read-javascript-file-export-documentation-service`, so it satisfies the stratification law it is itself subject to.
- `admitted-example-face-equivalence` | JSNode operation face-equivalence law | v1 | local-jsnode-package-readme | Applies to the shared examples projected to the JSNode import and command faces. | Every admitted example has equivalent import and command outputs under the downstream JSNode face assay.
## Standards
- `node-esm-operation` | Node.js | v24.2.0+ | https://nodejs.org/docs/v24/api/esm.html | Applies to the .mjs operation, its import.meta.main guard, and downstream package-birth assays. | The package uses one executable ESM operation source file that is eligible for downstream staged package-birth assays.
- `typescript-compiler-api` | TypeScript | 5.9.3 | https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API | Applies to how this operation parses one script's source into an AST for export, import, and guard detection. | `ts.createSourceFile` plus AST traversal (`ts.isFunctionDeclaration`, `ts.isImportDeclaration`, `ts.getCombinedModifierFlags`) is the documented way to read a JavaScript/TypeScript file's structure without a language service.
## Open questions
- `typescript-major-version-pin` [nonblocking]: The registry's `npm view typescript version` currently returns 7.0.2, the native/Go-ported compiler line; a live check (`node -e 'import("typescript").then(m => console.log(typeof m.default.createSourceFile))'`) shows that version exports no classic Compiler API (`createSourceFile`, `ScriptTarget`, `isFunctionDeclaration`, etc. are all absent) — it is not a superset of the 5.x API this operation's AST walk requires. This operation therefore pins `typescript` at 5.9.3, the same version the sibling `@red-cup-engineering/read-javascript-file-export-documentation-service` and `check-javascript-export-comment-discipline-service` packages already pin for the identical reason. Whether the org should track a separate "classic Compiler API" pin lane on the registry, distinct from the native 7.x line, is open but does not block this operation.
## Package
```json
{"packageName":"@red-cup-engineering/read-jsnode-operation-arguments-service","packageVersion":"0.2.0","license":"MIT","dependencies":{"@red-cup-engineering/read-javascript-file-export-documentation-service":"0.1.3","typescript":"5.9.3"},"devDependencies":{}}
```
## Operation
```mjs path=scripts/read-jsnode-operation-arguments.mjs
#!/usr/bin/env node
import { readJavascriptFileExportDocumentation } from "@red-cup-engineering/read-javascript-file-export-documentation-service";
import ts from "typescript";

const PATH_PATTERN = /^scripts\/[a-z][a-z0-9-]*\.mjs$/u;

function isExportedFunctionDeclaration(statement) {
  return (
    ts.isFunctionDeclaration(statement) &&
    statement.name !== undefined &&
    (ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export) !== 0
  );
}

function importSpecifierRecord(statement, source) {
  const moduleSpecifier = statement.moduleSpecifier;
  const importSpecifierText = moduleSpecifier.getText(source).slice(1, -1);
  const record = { source: importSpecifierText, names: [] };
  const clause = statement.importClause;
  if (!clause) return record;
  if (clause.name) record.default = clause.name.text;
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) {
    record.namespace = bindings.name.text;
  } else if (bindings && ts.isNamedImports(bindings)) {
    record.names = bindings.elements.map((element) => element.name.text);
  }
  return record;
}

function findMainGuard(statements, source) {
  return statements.find(
    (statement) =>
      ts.isIfStatement(statement) &&
      statement.expression.getText(source).trim() === "import.meta.main",
  );
}

function containsIdentifierMatching(node, pattern) {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (ts.isIdentifier(child) && pattern.test(child.text)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function typeTextToJsonSchema(typeText) {
  const text = typeof typeText === "string" ? typeText.trim() : "";
  if (text === "object") return { type: "object" };
  if (text === "string") return { type: "string" };
  if (text === "number") return { type: "number" };
  if (text === "boolean") return { type: "boolean" };
  const genericArray = /^Array<(.+)>$/u.exec(text);
  if (genericArray) return { type: "array", items: typeTextToJsonSchema(genericArray[1]) };
  const bracketArray = /^(.+)\[\]$/u.exec(text);
  if (bracketArray) return { type: "array", items: typeTextToJsonSchema(bracketArray[1]) };
  return {};
}

function jsonSchemaFromField(field, title) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title,
    ...typeTextToJsonSchema(field.type),
    description: field.description,
  };
}

/**
 * Reads one JavaScript ESM script's source into a JsnodeOperationArguments record: its single exported function's JSDoc, parameters, imports, main-guard shape, and source residue — a pure AST reading with no filesystem access.
 * @param {object} request A record with `text` (the complete JavaScript ESM source of one script) and `path` (its intended scripts/<name>.mjs path).
 * @returns {object} A JsnodeOperationArguments record: type, version, path, exportName, exportCount, isAsync, description, params, returns, inputSchema, outputSchema, throws, imports, hasMainGuard, readsStdin, writesStdout, bodyText, shebang, residue.
 * @throws {TypeError} When text is not a string, or path does not match ^scripts/[a-z][a-z0-9-]*\.mjs$.
 * @throws {SyntaxError} When the carried JavaScript does not parse (propagated from the composed export-documentation reader).
 */
export function readJsnodeOperationArguments(request) {
  if (typeof request?.text !== "string") throw new TypeError("text must be a string");
  if (typeof request?.path !== "string" || !PATH_PATTERN.test(request.path)) {
    throw new TypeError("path must match ^scripts/[a-z][a-z0-9-]*\\.mjs$");
  }
  const { text, path } = request;

  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const statements = [...source.statements];

  const exportedFunctions = statements.filter(isExportedFunctionDeclaration);
  const exportCount = exportedFunctions.length;
  const exportedFunction = exportCount === 1 ? exportedFunctions[0] : null;
  const exportName = exportedFunction ? exportedFunction.name.text : null;
  const isAsync = exportedFunction ? (ts.getCombinedModifierFlags(exportedFunction) & ts.ModifierFlags.Async) !== 0 : false;

  let description = null;
  let params = [];
  let returns = null;
  let throwsList = [];
  if (exportedFunction) {
    const documentation = readJavascriptFileExportDocumentation({ type: "TextFileRead", path, text }).find(
      (record) => record.name === exportName,
    );
    if (documentation) {
      description = documentation.description.length > 0 ? documentation.description : null;
      params = documentation.parameters.map((parameter) => ({
        name: parameter.name,
        type: parameter.type,
        description: parameter.description,
      }));
      returns = documentation.returns ? { type: documentation.returns.type, description: documentation.returns.description } : null;
      throwsList = documentation.throws.map((entry) => ({ type: entry.type, description: entry.description }));
    }
  }

  const inputSchema = params.length === 1 ? jsonSchemaFromField(params[0], `${exportName}Input`) : null;
  const outputSchema = returns ? jsonSchemaFromField(returns, `${exportName}Output`) : null;

  const importDeclarations = statements.filter((statement) => ts.isImportDeclaration(statement));
  const imports = importDeclarations.map((statement) => importSpecifierRecord(statement, source));

  const mainGuard = findMainGuard(statements, source);
  const hasMainGuard = mainGuard !== undefined;
  const readsStdin = hasMainGuard ? containsIdentifierMatching(mainGuard, /stdin/iu) : false;
  const writesStdout = hasMainGuard ? containsIdentifierMatching(mainGuard, /stdout/iu) : false;

  const bodyText = exportedFunction
    ? text.slice(exportedFunction.getStart(source, true), exportedFunction.getEnd())
    : null;

  const shebang = text.startsWith("#!");

  const residue = statements
    .filter((statement) => statement !== exportedFunction && statement !== mainGuard && !ts.isImportDeclaration(statement))
    .flatMap((statement) => {
      if (ts.isFunctionDeclaration(statement) && statement.name) return [statement.name.text];
      if (ts.isClassDeclaration(statement) && statement.name) return [statement.name.text];
      if (ts.isVariableStatement(statement)) {
        return statement.declarationList.declarations
          .filter((declaration) => ts.isIdentifier(declaration.name))
          .map((declaration) => declaration.name.text);
      }
      return [];
    });

  return {
    type: "JsnodeOperationArguments",
    version: 1,
    path,
    exportName,
    exportCount,
    isAsync,
    description,
    params,
    returns,
    inputSchema,
    outputSchema,
    throws: throwsList,
    imports,
    hasMainGuard,
    readsStdin,
    writesStdout,
    bodyText,
    shebang,
    residue,
  };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write(
      "readJsnodeOperationArguments — Reads one JavaScript ESM script's source into a JsnodeOperationArguments record: its single exported function's JSDoc, parameters, imports, main-guard shape, and source residue — a pure AST reading with no filesystem access.\n",
    );
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.length > 0) process.stdout.write(`${JSON.stringify(readJsnodeOperationArguments(JSON.parse(line)))}\n`);
    }
  }
}
```
## Tests
```mjs path=test/read-jsnode-operation-arguments.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { readJsnodeOperationArguments } from "../scripts/read-jsnode-operation-arguments.mjs";

const greetPersonText = `#!/usr/bin/env node
import { basename } from "node:path";

/**
 * Greets one named person.
 * @param {object} request A record with \`name\`.
 * @returns {object} A Greeting record.
 * @throws {TypeError} When name is not a string.
 */
export function greetPerson(request) {
  if (typeof request?.name !== "string") throw new TypeError("name is required");
  return { type: "Greeting", text: \`Hello, \${basename(request.name)}!\` };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("greetPerson — Greets one named person.\\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\\n")) {
      if (line.length > 0) process.stdout.write(\`\${JSON.stringify(greetPerson(JSON.parse(line)))}\\n\`);
    }
  }
}
`;

const legacyDefaultExportText = `#!/usr/bin/env node
// append-eavt-row — the effect: durably append one row.
import { appendEavt } from "../src/eavt.mjs";

export default function appendEavtRowScript(path, row) {
  return appendEavt(path, row);
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  console.log(appendEavtRowScript(process.argv[2], JSON.parse(process.argv[3])));
}
`;

test("reads a fully-conformant script into a complete JsnodeOperationArguments record", () => {
  const record = readJsnodeOperationArguments({ text: greetPersonText, path: "scripts/greet-person.mjs" });
  assert.equal(record.type, "JsnodeOperationArguments");
  assert.equal(record.version, 1);
  assert.equal(record.exportName, "greetPerson");
  assert.equal(record.exportCount, 1);
  assert.equal(record.isAsync, false);
  assert.equal(record.description, "Greets one named person.");
  assert.deepEqual(record.params, [{ name: "request", type: "object", description: "A record with `name`." }]);
  assert.deepEqual(record.returns, { type: "object", description: "A Greeting record." });
  assert.deepEqual(record.throws, [{ type: "TypeError", description: "When name is not a string." }]);
  assert.deepEqual(record.imports, [{ source: "node:path", names: ["basename"] }]);
  assert.equal(record.hasMainGuard, true);
  assert.equal(record.readsStdin, true);
  assert.equal(record.writesStdout, true);
  assert.equal(record.shebang, true);
  assert.deepEqual(record.residue, []);
  assert.match(record.bodyText, /^\/\*\*/u);
  assert.match(record.bodyText, /export function greetPerson\(request\) \{[\s\S]*\}$/u);
});

test("reads a legacy default-export script without JSDoc or a real main guard as nonconformant", () => {
  const record = readJsnodeOperationArguments({ text: legacyDefaultExportText, path: "scripts/append-eavt-row.mjs" });
  assert.equal(record.exportName, "appendEavtRowScript");
  assert.equal(record.exportCount, 1);
  assert.equal(record.isAsync, false);
  assert.equal(record.description, null);
  assert.deepEqual(record.params, []);
  assert.equal(record.returns, null);
  assert.equal(record.hasMainGuard, false);
  assert.equal(record.readsStdin, false);
  assert.equal(record.writesStdout, false);
});

test("reads an async exported function as isAsync true", () => {
  const record = readJsnodeOperationArguments({ text: "#!/usr/bin/env node\n/**\n * Waits.\n */\nexport async function waitOne() {\n  return 1;\n}\n", path: "scripts/wait-one.mjs" });
  assert.equal(record.exportName, "waitOne");
  assert.equal(record.isAsync, true);
});

test("derives inputSchema and outputSchema from the single @param and @returns JSDoc types", () => {
  const record = readJsnodeOperationArguments({ text: greetPersonText, path: "scripts/greet-person.mjs" });
  assert.deepEqual(record.inputSchema, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "greetPersonInput",
    type: "object",
    description: "A record with `name`.",
  });
  assert.deepEqual(record.outputSchema, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "greetPersonOutput",
    type: "object",
    description: "A Greeting record.",
  });
});

test("derives both schemas as null when the exported function carries no discoverable JSDoc", () => {
  const record = readJsnodeOperationArguments({ text: legacyDefaultExportText, path: "scripts/append-eavt-row.mjs" });
  assert.equal(record.inputSchema, null);
  assert.equal(record.outputSchema, null);
});

test("maps string, number, and boolean JSDoc types to their JSON Schema types", () => {
  const record = readJsnodeOperationArguments({
    text: "#!/usr/bin/env node\n/**\n * Checks a length.\n * @param {string} value A value.\n * @returns {boolean} Whether it is long.\n */\nexport function isLong(value) {\n  return value.length > 8;\n}\n",
    path: "scripts/is-long.mjs",
  });
  assert.deepEqual(record.inputSchema, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "isLongInput",
    type: "string",
    description: "A value.",
  });
  assert.deepEqual(record.outputSchema, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "isLongOutput",
    type: "boolean",
    description: "Whether it is long.",
  });
});

test("maps Array<T> and T[] JSDoc types to a JSON Schema array with items", () => {
  const record = readJsnodeOperationArguments({
    text: "#!/usr/bin/env node\n/**\n * Lists lengths.\n * @param {Array<string>} names Names.\n * @returns {number[]} Their lengths.\n */\nexport function listLengths(names) {\n  return names.map((name) => name.length);\n}\n",
    path: "scripts/list-lengths.mjs",
  });
  assert.deepEqual(record.inputSchema, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "listLengthsInput",
    type: "array",
    items: { type: "string" },
    description: "Names.",
  });
  assert.deepEqual(record.outputSchema, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "listLengthsOutput",
    type: "array",
    items: { type: "number" },
    description: "Their lengths.",
  });
});

test("maps an unrecognized JSDoc type such as * to an unconstrained JSON Schema object", () => {
  const record = readJsnodeOperationArguments({
    text: "#!/usr/bin/env node\n/**\n * Echoes.\n * @param {*} value Anything.\n * @returns {*} Same thing.\n */\nexport function echo(value) {\n  return value;\n}\n",
    path: "scripts/echo.mjs",
  });
  assert.deepEqual(record.inputSchema, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "echoInput",
    description: "Anything.",
  });
  assert.deepEqual(record.outputSchema, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "echoOutput",
    description: "Same thing.",
  });
});

test("refuses a request whose text is not a string", () => {
  assert.throws(() => readJsnodeOperationArguments({ text: 1, path: "scripts/x.mjs" }), /text must be a string/u);
  assert.throws(() => readJsnodeOperationArguments({ path: "scripts/x.mjs" }), /text must be a string/u);
});

test("refuses a request whose path does not match the scripts/<name>.mjs pattern", () => {
  assert.throws(
    () => readJsnodeOperationArguments({ text: "export function x() {}", path: "src/x.mjs" }),
    /path must match/u,
  );
  assert.throws(
    () => readJsnodeOperationArguments({ text: "export function x() {}", path: "scripts/Bad-Name.mjs" }),
    /path must match/u,
  );
  assert.throws(
    () => readJsnodeOperationArguments({ text: "export function x() {}", path: "scripts/x.mts" }),
    /path must match/u,
  );
});
```
## Examples
```json name="reads a fully-conformant script's JSDoc, import, guard, and stdio shape"
{"input":{"text":"#!/usr/bin/env node\nimport { basename } from \"node:path\";\n\n/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"greetPerson — Greets one named person.\\n\");\n  } else {\n    let text = \"\";\n    for await (const chunk of process.stdin) text += chunk;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length > 0) process.stdout.write(`${JSON.stringify(greetPerson(JSON.parse(line)))}\\n`);\n    }\n  }\n}\n","path":"scripts/greet-person.mjs"},"output":{"type":"JsnodeOperationArguments","version":1,"path":"scripts/greet-person.mjs","exportName":"greetPerson","exportCount":1,"isAsync":false,"description":"Greets one named person.","params":[{"name":"request","type":"object","description":"A record with `name`."}],"returns":{"type":"object","description":"A Greeting record."},"inputSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","title":"greetPersonInput","type":"object","description":"A record with `name`."},"outputSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","title":"greetPersonOutput","type":"object","description":"A Greeting record."},"throws":[{"type":"TypeError","description":"When name is not a string."}],"imports":[{"source":"node:path","names":["basename"]}],"hasMainGuard":true,"readsStdin":true,"writesStdout":true,"bodyText":"/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}","shebang":true,"residue":[]}}
```
```json name="reads a legacy default-export script without JSDoc or a real main guard as nonconformant"
{"input":{"text":"#!/usr/bin/env node\n// append-eavt-row — the effect: durably append one row.\nimport { appendEavt } from \"../src/eavt.mjs\";\n\nexport default function appendEavtRowScript(path, row) {\n  return appendEavt(path, row);\n}\n\nif (import.meta.url === `file://${process.argv[1]}`) {\n  console.log(appendEavtRowScript(process.argv[2], JSON.parse(process.argv[3])));\n}\n","path":"scripts/append-eavt-row.mjs"},"output":{"type":"JsnodeOperationArguments","version":1,"path":"scripts/append-eavt-row.mjs","exportName":"appendEavtRowScript","exportCount":1,"isAsync":false,"description":null,"params":[],"returns":null,"inputSchema":null,"outputSchema":null,"throws":[],"imports":[{"source":"../src/eavt.mjs","names":["appendEavt"]}],"hasMainGuard":false,"readsStdin":false,"writesStdout":false,"bodyText":"export default function appendEavtRowScript(path, row) {\n  return appendEavt(path, row);\n}","shebang":true,"residue":[]}}
```
## Traceability
- `structured-arguments-record` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `jsnode-one-form`, `admitted-example-face-equivalence`, `node-esm-operation`
- `single-export-detection` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `jsnode-one-form`, `typescript-compiler-api`
- `jsdoc-composition` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `scripts-import-scripts-and-src`, `node-esm-operation`
- `guard-and-stdio-detection` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `jsnode-one-form`, `typescript-compiler-api`
- `body-text-capture` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `typescript-compiler-api`, `node-esm-operation`
- `import-and-residue-listing` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `typescript-compiler-api`, `node-esm-operation`
- `pure-reading` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `scripts-import-scripts-and-src`, `node-esm-operation`
- `schema-derivation` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `jsnode-one-form`, `admitted-example-face-equivalence`, `node-esm-operation`
- `missing-text-refusal` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `admitted-example-face-equivalence`, `node-esm-operation`
- `invalid-path-refusal` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `admitted-example-face-equivalence`, `node-esm-operation`
