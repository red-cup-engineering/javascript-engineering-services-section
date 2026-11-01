import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readJsnodeOperationArguments } from "../scripts/read-jsnode-operation-arguments.mjs";

const examples = [
  {
    "type": "JavascriptNodeOperationExample",
    "name": "reads a fully-conformant script's JSDoc, import, guard, and stdio shape",
    "input": {
      "text": "#!/usr/bin/env node\nimport { basename } from \"node:path\";\n\n/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"greetPerson — Greets one named person.\\n\");\n  } else {\n    let text = \"\";\n    for await (const chunk of process.stdin) text += chunk;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length > 0) process.stdout.write(`${JSON.stringify(greetPerson(JSON.parse(line)))}\\n`);\n    }\n  }\n}\n",
      "path": "scripts/greet-person.mjs"
    },
    "output": {
      "type": "JsnodeOperationArguments",
      "version": 1,
      "path": "scripts/greet-person.mjs",
      "exportName": "greetPerson",
      "exportCount": 1,
      "isAsync": false,
      "description": "Greets one named person.",
      "params": [
        {
          "name": "request",
          "type": "object",
          "description": "A record with `name`."
        }
      ],
      "returns": {
        "type": "object",
        "description": "A Greeting record."
      },
      "inputSchema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "greetPersonInput",
        "type": "object",
        "description": "A record with `name`."
      },
      "outputSchema": {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "title": "greetPersonOutput",
        "type": "object",
        "description": "A Greeting record."
      },
      "throws": [
        {
          "type": "TypeError",
          "description": "When name is not a string."
        }
      ],
      "imports": [
        {
          "source": "node:path",
          "names": [
            "basename"
          ]
        }
      ],
      "hasMainGuard": true,
      "readsStdin": true,
      "writesStdout": true,
      "bodyText": "/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}",
      "shebang": true,
      "residue": []
    }
  },
  {
    "type": "JavascriptNodeOperationExample",
    "name": "reads a legacy default-export script without JSDoc or a real main guard as nonconformant",
    "input": {
      "text": "#!/usr/bin/env node\n// append-eavt-row — the effect: durably append one row.\nimport { appendEavt } from \"../src/eavt.mjs\";\n\nexport default function appendEavtRowScript(path, row) {\n  return appendEavt(path, row);\n}\n\nif (import.meta.url === `file://${process.argv[1]}`) {\n  console.log(appendEavtRowScript(process.argv[2], JSON.parse(process.argv[3])));\n}\n",
      "path": "scripts/append-eavt-row.mjs"
    },
    "output": {
      "type": "JsnodeOperationArguments",
      "version": 1,
      "path": "scripts/append-eavt-row.mjs",
      "exportName": "appendEavtRowScript",
      "exportCount": 1,
      "isAsync": false,
      "description": null,
      "params": [],
      "returns": null,
      "inputSchema": null,
      "outputSchema": null,
      "throws": [],
      "imports": [
        {
          "source": "../src/eavt.mjs",
          "names": [
            "appendEavt"
          ]
        }
      ],
      "hasMainGuard": false,
      "readsStdin": false,
      "writesStdout": false,
      "bodyText": "export default function appendEavtRowScript(path, row) {\n  return appendEavt(path, row);\n}",
      "shebang": true,
      "residue": []
    }
  }
];

examples[1].output.residue = ['if (import.meta.url === `file://${process.argv[1]}`) {\n  console.log(appendEavtRowScript(process.argv[2], JSON.parse(process.argv[3])));\n}'];

const legacyFields = (value, expected) => Object.fromEntries(Object.entries(expected).map(([key, item]) => [key, key === "imports" ? value.imports.map((record, index) => Object.fromEntries(Object.keys(item[index]).map((name) => [name, record[name]]))) : value[key]]));

for (const example of examples) {
  test(example.name, async () => {
    const importedOutput = await readJsnodeOperationArguments(example.input);
    assert.deepEqual(legacyFields(importedOutput, example.output), example.output);
    const command = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/read-jsnode-operation-arguments.mjs", import.meta.url))], {
      input: JSON.stringify(example.input) + "\n",
      encoding: "utf8",
    });
    assert.equal(command.status, 0, command.stderr);
    const commandOutput = JSON.parse(command.stdout.trim());
    assert.deepEqual(legacyFields(commandOutput, example.output), example.output);
    assert.deepEqual(commandOutput, importedOutput);
  });
}
