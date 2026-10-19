# project-jsnode-operation-source-from-arguments
## Requirements
- `canonical-source-projection`: The operation returns a JsnodeOperationSourceProjection record carrying type, version, path, and the complete canonical operation source text for one JsnodeOperationArguments record.
- `schema-file-projection`: The operation returns `files`, an ordered array of `{path, text}` projections: the operation source itself at `path`/`text`, then — one carrier in, one carrier out for every operation the org runs — a `data/records/schema/<command>.input.schema.json` file when the record's `inputSchema` is present and a `data/records/schema/<command>.output.schema.json` file when its `outputSchema` is present, each pretty-printed (two-space indent) with a trailing newline; `<command>` is the script name segment of `path` (`scripts/<command>.mjs`); neither schema file is projected when its schema is `null`. Each schema file's text is built by reconstructing the schema in one fixed key order (`$schema`, `title`, `type`, `items`, `description`), never by serializing the incoming schema object's own key order, so the projected bytes are identical however the JSON transport that delivered `argumentsRecord` ordered that object's keys.
- `shebang-then-sorted-imports`: The projected text starts with the Node shebang, followed by one import statement per line sorted node: builtins first, then scoped house packages, then other specifiers, alphabetically within each group.
- `one-jsdoc-block`: The projected text carries exactly one JSDoc block ahead of the exported function, built from `description`, one `@param {type} name description` line per param, one `@returns {type} description` line when `returns` is present, and one `@throws {type} description` line per `throws` entry.
- `function-body-preserved`: The projected function is `bodyText` with its own leading JSDoc comment (if any) stripped and replaced by the projected JSDoc block; the function's code is otherwise reproduced verbatim.
- `canonical-main-guard`: The projected text ends with the canonical `if (import.meta.main)` NDJSON command guard, identical in shape to the jsnode-package-services-section live example's guard, with `--help` printing `<exportName> — <description>`, and the per-line call awaited when the record's `isAsync` is true or `bodyText` declares `export async function`.
- `deterministic-projection`: The same JsnodeOperationArguments record projects to byte-identical text on every call.
## Prohibitions
- `missing-export-name-refusal`: The operation must refuse a record whose `exportName` is missing. [claims: malformed-input-outside-domain]
- `missing-body-text-refusal`: The operation must refuse a record whose `bodyText` is missing. [claims: malformed-input-outside-domain]
- `missing-description-refusal`: The operation must refuse a record whose `description` is missing. [claims: malformed-input-outside-domain]
## Laws
- `jsnode-one-form` | jsnode-package-services-section README | v1 | lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-code-engineering-services-section/services/javascript-engineering-services-section/services/javascript-code-fabrication-services-section/services/javascript-node-code-fabrication-services-section/services/jsnode-package-services-section/README.md | Applies to the exact operation-file shape this operation projects. | "The operation file starts with the Node shebang, exports exactly one JSDoc-documented function, and contains the real `if (import.meta.main)` command guard" — this operation is the projector of exactly that one canonical form, never a second style.
- `zero-dependency-projection` | org-layering.md / import-stratification.md | v1 | .claude/rules/import-stratification.md | Applies to why this operation carries no runtime dependencies. | "scripts can import scripts and src." A pure deterministic text projector needs no further script or src composition, so it declares zero dependencies rather than importing capability it does not need.
- `admitted-example-face-equivalence` | JSNode operation face-equivalence law | v1 | local-jsnode-package-readme | Applies to the shared examples projected to the JSNode import and command faces. | Every admitted example has equivalent import and command outputs under the downstream JSNode face assay.
## Standards
- `node-esm-operation` | Node.js | v24.2.0+ | https://nodejs.org/docs/v24/api/esm.html | Applies to the .mjs operation, its import.meta.main guard, and downstream package-birth assays. | The package uses one executable ESM operation source file that is eligible for downstream staged package-birth assays.
## Open questions
none
## Claims
- `malformed-input-outside-domain` | derived | world | A request or field not of its declared type lies outside the operation's input domain | none | constraint:node-esm-operation; citation:Red Cup reconcile-typed-boundaries skill, a boundary admits only its declared type | Refusing an out-of-domain input is the typed boundary's own behavior, not a further choice
## Package
```json
{"packageName":"@red-cup-engineering/project-jsnode-operation-source-from-arguments-service","packageVersion":"0.2.0","license":"MIT","dependencies":{},"devDependencies":{}}
```
## Operation
```mjs path=scripts/project-jsnode-operation-source-from-arguments.mjs
#!/usr/bin/env node

function importGroup(source) {
  if (source.startsWith("node:")) return 0;
  if (source.startsWith("@")) return 1;
  return 2;
}

function renderImportLine(importRecord) {
  const { source, names = [], namespace, default: defaultName } = importRecord;
  const parts = [];
  if (defaultName) parts.push(defaultName);
  if (namespace) parts.push(`* as ${namespace}`);
  if (names.length > 0) parts.push(`{ ${names.join(", ")} }`);
  return `import ${parts.join(", ")} from "${source}";`;
}

function sortedImportLines(imports) {
  return [...imports]
    .sort((a, b) => {
      const groupDelta = importGroup(a.source) - importGroup(b.source);
      if (groupDelta !== 0) return groupDelta;
      return a.source < b.source ? -1 : a.source > b.source ? 1 : 0;
    })
    .map(renderImportLine);
}

function jsDocLines(description, params, returns, throwsList) {
  const lines = ["/**"];
  for (const descriptionLine of description.split("\n")) lines.push(` * ${descriptionLine}`);
  for (const param of params) lines.push(` * @param {${param.type ?? "*"}} ${param.name} ${param.description}`.trimEnd());
  if (returns) lines.push(` * @returns {${returns.type ?? "*"}} ${returns.description}`.trimEnd());
  for (const entry of throwsList) lines.push(` * @throws {${entry.type ?? "*"}} ${entry.description}`.trimEnd());
  lines.push(" */");
  return lines;
}

function stripLeadingJsDoc(bodyText) {
  return bodyText.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/u, "");
}

function mainGuardLines(exportName, description, isAsync) {
  const helpText = `${exportName} — ${description}`.replace(/\n/gu, " ");
  return [
    "if (import.meta.main) {",
    '  if (process.argv.includes("--help")) {',
    `    process.stdout.write(${JSON.stringify(`${helpText}\n`)});`,
    "  } else {",
    '    let text = "";',
    "    for await (const chunk of process.stdin) text += chunk;",
    '    for (const line of text.split("\\n")) {',
    `      if (line.length > 0) process.stdout.write(\`\${JSON.stringify(${isAsync ? "await " : ""}${exportName}(JSON.parse(line)))}\\n\`);`,
    "    }",
    "  }",
    "}",
  ];
}

function commandNameFromPath(path) {
  const match = /^scripts\/([a-z][a-z0-9-]*)\.mjs$/u.exec(typeof path === "string" ? path : "");
  return match ? match[1] : null;
}

function orderedSchemaText(schema) {
  const ordered = { $schema: schema.$schema, title: schema.title };
  if (Object.hasOwn(schema, "type")) ordered.type = schema.type;
  if (Object.hasOwn(schema, "items")) ordered.items = schema.items;
  ordered.description = schema.description;
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function schemaFileProjections({ inputSchema, outputSchema }, command) {
  const projections = [];
  if (command === null) return projections;
  if (inputSchema) {
    projections.push({
      path: `data/records/schema/${command}.input.schema.json`,
      text: orderedSchemaText(inputSchema),
    });
  }
  if (outputSchema) {
    projections.push({
      path: `data/records/schema/${command}.output.schema.json`,
      text: orderedSchemaText(outputSchema),
    });
  }
  return projections;
}

/**
 * Projects one JsnodeOperationArguments record into the canonical JSNode operation source text: shebang, sorted imports, one JSDoc block ahead of the exported function, and the canonical import.meta.main NDJSON command guard — a pure, deterministic text projection with no filesystem access.
 * @param {object} argumentsRecord A JsnodeOperationArguments record carrying `path`, `exportName`, `description`, `bodyText`, and optional `params`, `returns`, `throws`, `imports`, `isAsync`, `inputSchema`, `outputSchema`.
 * @returns {object} A JsnodeOperationSourceProjection record: type, version, path, text, files.
 * @throws {TypeError} When exportName, bodyText, or description is missing.
 */
export function projectJsnodeOperationSourceFromArguments(argumentsRecord) {
  const {
    path,
    exportName,
    description,
    bodyText,
    params = [],
    returns = null,
    throws: throwsList = [],
    imports = [],
    isAsync = false,
    inputSchema = null,
    outputSchema = null,
  } = argumentsRecord ?? {};
  if (typeof exportName !== "string" || exportName.length === 0) throw new TypeError("exportName is required");
  if (typeof bodyText !== "string" || bodyText.length === 0) throw new TypeError("bodyText is required");
  if (typeof description !== "string" || description.length === 0) throw new TypeError("description is required");

  const importLines = sortedImportLines(imports);
  const jsDocBlock = jsDocLines(description, params, returns, throwsList);
  const functionCode = stripLeadingJsDoc(bodyText);
  const awaited = isAsync === true || /^\s*export\s+async\s+function\b/u.test(stripLeadingJsDoc(bodyText));
  const guardLines = mainGuardLines(exportName, description, awaited);

  const sections = [
    ["#!/usr/bin/env node", ...importLines],
    [...jsDocBlock, functionCode],
    guardLines,
  ];
  const text = `${sections.map((section) => section.join("\n")).join("\n\n")}\n`;

  const command = commandNameFromPath(path);
  const files = [{ path, text }, ...schemaFileProjections({ inputSchema, outputSchema }, command)];

  return { type: "JsnodeOperationSourceProjection", version: 1, path, text, files };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write(
      "projectJsnodeOperationSourceFromArguments — Projects one JsnodeOperationArguments record into the canonical JSNode operation source text: shebang, sorted imports, one JSDoc block ahead of the exported function, and the canonical import.meta.main NDJSON command guard — a pure, deterministic text projection with no filesystem access.\n",
    );
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.length > 0) process.stdout.write(`${JSON.stringify(projectJsnodeOperationSourceFromArguments(JSON.parse(line)))}\n`);
    }
  }
}
```
## Tests
```mjs path=test/project-jsnode-operation-source-from-arguments.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { projectJsnodeOperationSourceFromArguments } from "../scripts/project-jsnode-operation-source-from-arguments.mjs";

const doubleValueArguments = {
  type: "JsnodeOperationArguments",
  version: 1,
  path: "scripts/double-value.mjs",
  exportName: "doubleValue",
  exportCount: 1,
  description: "Doubles a number.",
  params: [{ name: "value", type: "number", description: "The number to double." }],
  returns: { type: "number", description: "The doubled value." },
  throws: [],
  imports: [],
  hasMainGuard: true,
  readsStdin: true,
  writesStdout: true,
  bodyText:
    '/**\n * Doubles a number.\n * @param {number} value The number to double.\n * @returns {number} The doubled value.\n */\nexport function doubleValue(value) {\n  return value * 2;\n}',
  shebang: true,
  residue: [],
};

const expectedDoubleValueText = `#!/usr/bin/env node

/**
 * Doubles a number.
 * @param {number} value The number to double.
 * @returns {number} The doubled value.
 */
export function doubleValue(value) {
  return value * 2;
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("doubleValue — Doubles a number.\\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\\n")) {
      if (line.length > 0) process.stdout.write(\`\${JSON.stringify(doubleValue(JSON.parse(line)))}\\n\`);
    }
  }
}
`;

test("projects a no-import argument record into the canonical operation source", () => {
  const projection = projectJsnodeOperationSourceFromArguments(doubleValueArguments);
  assert.equal(projection.type, "JsnodeOperationSourceProjection");
  assert.equal(projection.version, 1);
  assert.equal(projection.path, "scripts/double-value.mjs");
  assert.equal(projection.text, expectedDoubleValueText);
  assert.deepEqual(projection.files, [{ path: "scripts/double-value.mjs", text: expectedDoubleValueText }]);
});

test("projects schema files under data/records/schema/ when the record carries inputSchema and outputSchema", () => {
  const record = {
    ...doubleValueArguments,
    inputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", title: "doubleValueInput", type: "number", description: "The number to double." },
    outputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", title: "doubleValueOutput", type: "number", description: "The doubled value." },
  };
  const projection = projectJsnodeOperationSourceFromArguments(record);
  assert.deepEqual(projection.files, [
    { path: "scripts/double-value.mjs", text: expectedDoubleValueText },
    {
      path: "data/records/schema/double-value.input.schema.json",
      text: `${JSON.stringify(record.inputSchema, null, 2)}\n`,
    },
    {
      path: "data/records/schema/double-value.output.schema.json",
      text: `${JSON.stringify(record.outputSchema, null, 2)}\n`,
    },
  ]);
});

test("projects only files array entry when inputSchema and outputSchema are null", () => {
  const projection = projectJsnodeOperationSourceFromArguments({ ...doubleValueArguments, inputSchema: null, outputSchema: null });
  assert.deepEqual(projection.files, [{ path: "scripts/double-value.mjs", text: expectedDoubleValueText }]);
});

test("projects schema file text in a fixed key order regardless of the incoming schema object's own key order", () => {
  const canonicalKeyOrderInputSchema = JSON.parse(
    '{"$schema":"https://json-schema.org/draft/2020-12/schema","description":"The number to double.","title":"doubleValueInput","type":"number"}',
  );
  const record = { ...doubleValueArguments, inputSchema: canonicalKeyOrderInputSchema, outputSchema: null };
  const projection = projectJsnodeOperationSourceFromArguments(record);
  assert.equal(
    projection.files[1].text,
    '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "title": "doubleValueInput",\n  "type": "number",\n  "description": "The number to double."\n}\n',
  );
});

test("is deterministic: the same arguments record projects to the same bytes twice", () => {
  const first = projectJsnodeOperationSourceFromArguments(doubleValueArguments);
  const second = projectJsnodeOperationSourceFromArguments(doubleValueArguments);
  assert.equal(first.text, second.text);
});

test("sorts imports node: builtins before scoped house packages before others", () => {
  const record = {
    ...doubleValueArguments,
    exportName: "example",
    bodyText: "/**\n * Example.\n */\nexport function example() {\n  return 1;\n}",
    imports: [
      { source: "lodash", names: ["chunk"] },
      { source: "@red-cup-engineering/json-codec-service", names: ["parse"] },
      { source: "node:path", names: ["basename"] },
    ],
  };
  const projection = projectJsnodeOperationSourceFromArguments(record);
  const importLines = projection.text.split("\n").filter((line) => line.startsWith("import "));
  assert.deepEqual(importLines, [
    'import { basename } from "node:path";',
    'import { parse } from "@red-cup-engineering/json-codec-service";',
    'import { chunk } from "lodash";',
  ]);
});

test("awaits the per-line call when the exported function is async", () => {
  const record = { ...doubleValueArguments, exportName: "waitOne", isAsync: true, bodyText: "/**\n * Waits.\n */\nexport async function waitOne() {\n  return 1;\n}" };
  const projection = projectJsnodeOperationSourceFromArguments(record);
  assert.match(projection.text, /JSON\.stringify\(await waitOne\(JSON\.parse\(line\)\)\)/u);
  const inferred = projectJsnodeOperationSourceFromArguments({ ...record, isAsync: undefined });
  assert.equal(inferred.text, projection.text);
});

test("refuses a record missing exportName, bodyText, or description", () => {
  assert.throws(
    () => projectJsnodeOperationSourceFromArguments({ ...doubleValueArguments, exportName: null }),
    /exportName is required/u,
  );
  assert.throws(
    () => projectJsnodeOperationSourceFromArguments({ ...doubleValueArguments, bodyText: null }),
    /bodyText is required/u,
  );
  assert.throws(
    () => projectJsnodeOperationSourceFromArguments({ ...doubleValueArguments, description: null }),
    /description is required/u,
  );
});
```
## Examples
```json name="projects a no-import argument record into the canonical operation source"
{"input":{"type":"JsnodeOperationArguments","version":1,"path":"scripts/double-value.mjs","exportName":"doubleValue","exportCount":1,"description":"Doubles a number.","params":[{"name":"value","type":"number","description":"The number to double."}],"returns":{"type":"number","description":"The doubled value."},"throws":[],"imports":[],"hasMainGuard":true,"readsStdin":true,"writesStdout":true,"bodyText":"/**\n * Doubles a number.\n * @param {number} value The number to double.\n * @returns {number} The doubled value.\n */\nexport function doubleValue(value) {\n  return value * 2;\n}","shebang":true,"residue":[]},"output":{"type":"JsnodeOperationSourceProjection","version":1,"path":"scripts/double-value.mjs","text":"#!/usr/bin/env node\n\n/**\n * Doubles a number.\n * @param {number} value The number to double.\n * @returns {number} The doubled value.\n */\nexport function doubleValue(value) {\n  return value * 2;\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"doubleValue — Doubles a number.\\n\");\n  } else {\n    let text = \"\";\n    for await (const chunk of process.stdin) text += chunk;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length > 0) process.stdout.write(`${JSON.stringify(doubleValue(JSON.parse(line)))}\\n`);\n    }\n  }\n}\n","files":[{"path":"scripts/double-value.mjs","text":"#!/usr/bin/env node\n\n/**\n * Doubles a number.\n * @param {number} value The number to double.\n * @returns {number} The doubled value.\n */\nexport function doubleValue(value) {\n  return value * 2;\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"doubleValue — Doubles a number.\\n\");\n  } else {\n    let text = \"\";\n    for await (const chunk of process.stdin) text += chunk;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length > 0) process.stdout.write(`${JSON.stringify(doubleValue(JSON.parse(line)))}\\n`);\n    }\n  }\n}\n"}]}}
```
```json name="projects an argument record with a node: import and a @throws tag into the canonical operation source"
{"input":{"type":"JsnodeOperationArguments","version":1,"path":"scripts/greet-person.mjs","exportName":"greetPerson","exportCount":1,"description":"Greets one named person.","params":[{"name":"request","type":"object","description":"A record with `name`."}],"returns":{"type":"object","description":"A Greeting record."},"throws":[{"type":"TypeError","description":"When name is not a string."}],"imports":[{"source":"node:path","names":["basename"]}],"hasMainGuard":true,"readsStdin":true,"writesStdout":true,"bodyText":"/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}","shebang":true,"residue":[]},"output":{"type":"JsnodeOperationSourceProjection","version":1,"path":"scripts/greet-person.mjs","text":"#!/usr/bin/env node\nimport { basename } from \"node:path\";\n\n/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"greetPerson — Greets one named person.\\n\");\n  } else {\n    let text = \"\";\n    for await (const chunk of process.stdin) text += chunk;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length > 0) process.stdout.write(`${JSON.stringify(greetPerson(JSON.parse(line)))}\\n`);\n    }\n  }\n}\n","files":[{"path":"scripts/greet-person.mjs","text":"#!/usr/bin/env node\nimport { basename } from \"node:path\";\n\n/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"greetPerson — Greets one named person.\\n\");\n  } else {\n    let text = \"\";\n    for await (const chunk of process.stdin) text += chunk;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length > 0) process.stdout.write(`${JSON.stringify(greetPerson(JSON.parse(line)))}\\n`);\n    }\n  }\n}\n"}]}}
```
```json name="projects schema files under data/records/schema/ when the record carries inputSchema and outputSchema"
{"input":{"type":"JsnodeOperationArguments","version":1,"path":"scripts/greet-person.mjs","exportName":"greetPerson","exportCount":1,"description":"Greets one named person.","params":[{"name":"request","type":"object","description":"A record with `name`."}],"returns":{"type":"object","description":"A Greeting record."},"inputSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","title":"greetPersonInput","type":"object","description":"A record with `name`."},"outputSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","title":"greetPersonOutput","type":"object","description":"A Greeting record."},"throws":[{"type":"TypeError","description":"When name is not a string."}],"imports":[{"source":"node:path","names":["basename"]}],"hasMainGuard":true,"readsStdin":true,"writesStdout":true,"bodyText":"/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}","shebang":true,"residue":[]},"output":{"type":"JsnodeOperationSourceProjection","version":1,"path":"scripts/greet-person.mjs","text":"#!/usr/bin/env node\nimport { basename } from \"node:path\";\n\n/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"greetPerson — Greets one named person.\\n\");\n  } else {\n    let text = \"\";\n    for await (const chunk of process.stdin) text += chunk;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length > 0) process.stdout.write(`${JSON.stringify(greetPerson(JSON.parse(line)))}\\n`);\n    }\n  }\n}\n","files":[{"path":"scripts/greet-person.mjs","text":"#!/usr/bin/env node\nimport { basename } from \"node:path\";\n\n/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"greetPerson — Greets one named person.\\n\");\n  } else {\n    let text = \"\";\n    for await (const chunk of process.stdin) text += chunk;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length > 0) process.stdout.write(`${JSON.stringify(greetPerson(JSON.parse(line)))}\\n`);\n    }\n  }\n}\n"},{"path":"data/records/schema/greet-person.input.schema.json","text":"{\n  \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n  \"title\": \"greetPersonInput\",\n  \"type\": \"object\",\n  \"description\": \"A record with `name`.\"\n}\n"},{"path":"data/records/schema/greet-person.output.schema.json","text":"{\n  \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n  \"title\": \"greetPersonOutput\",\n  \"type\": \"object\",\n  \"description\": \"A Greeting record.\"\n}\n"}]}}
```
## Traceability
- `canonical-source-projection` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `jsnode-one-form`, `admitted-example-face-equivalence`, `node-esm-operation`
- `schema-file-projection` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `jsnode-one-form`, `admitted-example-face-equivalence`, `node-esm-operation`
- `shebang-then-sorted-imports` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `jsnode-one-form`, `node-esm-operation`
- `one-jsdoc-block` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `jsnode-one-form`, `node-esm-operation`
- `function-body-preserved` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `jsnode-one-form`, `zero-dependency-projection`
- `canonical-main-guard` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `jsnode-one-form`, `node-esm-operation`
- `deterministic-projection` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `zero-dependency-projection`, `admitted-example-face-equivalence`
- `missing-export-name-refusal` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `admitted-example-face-equivalence`, `node-esm-operation`
- `missing-body-text-refusal` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `admitted-example-face-equivalence`, `node-esm-operation`
- `missing-description-refusal` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `admitted-example-face-equivalence`, `node-esm-operation`
