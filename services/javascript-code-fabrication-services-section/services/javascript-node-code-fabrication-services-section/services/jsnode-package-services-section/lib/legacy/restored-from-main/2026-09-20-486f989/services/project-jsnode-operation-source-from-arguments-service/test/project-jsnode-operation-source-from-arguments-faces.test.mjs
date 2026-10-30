import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { projectJsnodeOperationSourceFromArguments } from "../scripts/project-jsnode-operation-source-from-arguments.mjs";

const examples = [
  {
    "type": "JavascriptNodeOperationExample",
    "name": "projects a no-import argument record into the canonical operation source",
    "input": {
      "type": "JsnodeOperationArguments",
      "version": 1,
      "path": "scripts/double-value.mjs",
      "exportName": "doubleValue",
      "exportCount": 1,
      "description": "Doubles a number.",
      "params": [
        {
          "name": "value",
          "type": "number",
          "description": "The number to double."
        }
      ],
      "returns": {
        "type": "number",
        "description": "The doubled value."
      },
      "throws": [],
      "imports": [],
      "hasMainGuard": true,
      "readsStdin": true,
      "writesStdout": true,
      "bodyText": "/**\n * Doubles a number.\n * @param {number} value The number to double.\n * @returns {number} The doubled value.\n */\nexport function doubleValue(value) {\n  return value * 2;\n}",
      "shebang": true,
      "residue": []
    },
    "output": {
      "type": "JsnodeOperationSourceProjection",
      "version": 1,
      "path": "scripts/double-value.mjs",
      "text": "#!/usr/bin/env node\nimport { readJavascriptNodeStandardInputText } from \"@red-cup-engineering/read-javascript-node-standard-input-text-service\";\nimport { writeJavascriptNodeStandardOutputText } from \"@red-cup-engineering/write-javascript-node-standard-output-text-service\";\n\n/**\n * Doubles a number.\n * @param {number} value The number to double.\n * @returns {number} The doubled value.\n */\nexport function doubleValue(value) {\n  return value * 2;\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"doubleValue — Doubles a number.\\n\");\n  } else {\n    const { text } = await readJavascriptNodeStandardInputText({ type: \"JavascriptNodeStandardInputTextReadRequest\", version: 1 }, { standardInput: process.stdin });\n    const outputLines = [];\n    let refused = false;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length === 0) continue;\n      try {\n        const value = JSON.parse(line);\n        outputLines.push(JSON.stringify(doubleValue(value)));\n      } catch (error) {\n        outputLines.push(JSON.stringify({ ok: false, refusal: { reason: error.name, message: error.message } }));\n        refused = true;\n      }\n    }\n    await writeJavascriptNodeStandardOutputText({ type: \"JavascriptNodeStandardOutputTextWriteRequest\", version: 1, text: outputLines.map((outputLine) => `${outputLine}\\n`).join(\"\") }, { standardOutput: process.stdout });\n    if (refused) process.exitCode = 2;\n  }\n}\n",
      "files": [
        {
          "path": "scripts/double-value.mjs",
          "text": "#!/usr/bin/env node\nimport { readJavascriptNodeStandardInputText } from \"@red-cup-engineering/read-javascript-node-standard-input-text-service\";\nimport { writeJavascriptNodeStandardOutputText } from \"@red-cup-engineering/write-javascript-node-standard-output-text-service\";\n\n/**\n * Doubles a number.\n * @param {number} value The number to double.\n * @returns {number} The doubled value.\n */\nexport function doubleValue(value) {\n  return value * 2;\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"doubleValue — Doubles a number.\\n\");\n  } else {\n    const { text } = await readJavascriptNodeStandardInputText({ type: \"JavascriptNodeStandardInputTextReadRequest\", version: 1 }, { standardInput: process.stdin });\n    const outputLines = [];\n    let refused = false;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length === 0) continue;\n      try {\n        const value = JSON.parse(line);\n        outputLines.push(JSON.stringify(doubleValue(value)));\n      } catch (error) {\n        outputLines.push(JSON.stringify({ ok: false, refusal: { reason: error.name, message: error.message } }));\n        refused = true;\n      }\n    }\n    await writeJavascriptNodeStandardOutputText({ type: \"JavascriptNodeStandardOutputTextWriteRequest\", version: 1, text: outputLines.map((outputLine) => `${outputLine}\\n`).join(\"\") }, { standardOutput: process.stdout });\n    if (refused) process.exitCode = 2;\n  }\n}\n"
        }
      ]
    }
  },
  {
    "type": "JavascriptNodeOperationExample",
    "name": "projects an argument record with a node: import and a @throws tag into the canonical operation source",
    "input": {
      "type": "JsnodeOperationArguments",
      "version": 1,
      "path": "scripts/greet-person.mjs",
      "exportName": "greetPerson",
      "exportCount": 1,
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
    },
    "output": {
      "type": "JsnodeOperationSourceProjection",
      "version": 1,
      "path": "scripts/greet-person.mjs",
      "text": "#!/usr/bin/env node\nimport { basename } from \"node:path\";\nimport { readJavascriptNodeStandardInputText } from \"@red-cup-engineering/read-javascript-node-standard-input-text-service\";\nimport { writeJavascriptNodeStandardOutputText } from \"@red-cup-engineering/write-javascript-node-standard-output-text-service\";\n\n/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"greetPerson — Greets one named person.\\n\");\n  } else {\n    const { text } = await readJavascriptNodeStandardInputText({ type: \"JavascriptNodeStandardInputTextReadRequest\", version: 1 }, { standardInput: process.stdin });\n    const outputLines = [];\n    let refused = false;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length === 0) continue;\n      try {\n        const value = JSON.parse(line);\n        outputLines.push(JSON.stringify(greetPerson(value)));\n      } catch (error) {\n        outputLines.push(JSON.stringify({ ok: false, refusal: { reason: error.name, message: error.message } }));\n        refused = true;\n      }\n    }\n    await writeJavascriptNodeStandardOutputText({ type: \"JavascriptNodeStandardOutputTextWriteRequest\", version: 1, text: outputLines.map((outputLine) => `${outputLine}\\n`).join(\"\") }, { standardOutput: process.stdout });\n    if (refused) process.exitCode = 2;\n  }\n}\n",
      "files": [
        {
          "path": "scripts/greet-person.mjs",
          "text": "#!/usr/bin/env node\nimport { basename } from \"node:path\";\nimport { readJavascriptNodeStandardInputText } from \"@red-cup-engineering/read-javascript-node-standard-input-text-service\";\nimport { writeJavascriptNodeStandardOutputText } from \"@red-cup-engineering/write-javascript-node-standard-output-text-service\";\n\n/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"greetPerson — Greets one named person.\\n\");\n  } else {\n    const { text } = await readJavascriptNodeStandardInputText({ type: \"JavascriptNodeStandardInputTextReadRequest\", version: 1 }, { standardInput: process.stdin });\n    const outputLines = [];\n    let refused = false;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length === 0) continue;\n      try {\n        const value = JSON.parse(line);\n        outputLines.push(JSON.stringify(greetPerson(value)));\n      } catch (error) {\n        outputLines.push(JSON.stringify({ ok: false, refusal: { reason: error.name, message: error.message } }));\n        refused = true;\n      }\n    }\n    await writeJavascriptNodeStandardOutputText({ type: \"JavascriptNodeStandardOutputTextWriteRequest\", version: 1, text: outputLines.map((outputLine) => `${outputLine}\\n`).join(\"\") }, { standardOutput: process.stdout });\n    if (refused) process.exitCode = 2;\n  }\n}\n"
        }
      ]
    }
  },
  {
    "type": "JavascriptNodeOperationExample",
    "name": "projects schema files under data/records/schema/ when the record carries inputSchema and outputSchema",
    "input": {
      "type": "JsnodeOperationArguments",
      "version": 1,
      "path": "scripts/greet-person.mjs",
      "exportName": "greetPerson",
      "exportCount": 1,
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
    },
    "output": {
      "type": "JsnodeOperationSourceProjection",
      "version": 1,
      "path": "scripts/greet-person.mjs",
      "text": "#!/usr/bin/env node\nimport { basename } from \"node:path\";\nimport { readJavascriptNodeStandardInputText } from \"@red-cup-engineering/read-javascript-node-standard-input-text-service\";\nimport { writeJavascriptNodeStandardOutputText } from \"@red-cup-engineering/write-javascript-node-standard-output-text-service\";\n\n/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"greetPerson — Greets one named person.\\n\");\n  } else {\n    const { text } = await readJavascriptNodeStandardInputText({ type: \"JavascriptNodeStandardInputTextReadRequest\", version: 1 }, { standardInput: process.stdin });\n    const outputLines = [];\n    let refused = false;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length === 0) continue;\n      try {\n        const value = JSON.parse(line);\n        outputLines.push(JSON.stringify(greetPerson(value)));\n      } catch (error) {\n        outputLines.push(JSON.stringify({ ok: false, refusal: { reason: error.name, message: error.message } }));\n        refused = true;\n      }\n    }\n    await writeJavascriptNodeStandardOutputText({ type: \"JavascriptNodeStandardOutputTextWriteRequest\", version: 1, text: outputLines.map((outputLine) => `${outputLine}\\n`).join(\"\") }, { standardOutput: process.stdout });\n    if (refused) process.exitCode = 2;\n  }\n}\n",
      "files": [
        {
          "path": "scripts/greet-person.mjs",
          "text": "#!/usr/bin/env node\nimport { basename } from \"node:path\";\nimport { readJavascriptNodeStandardInputText } from \"@red-cup-engineering/read-javascript-node-standard-input-text-service\";\nimport { writeJavascriptNodeStandardOutputText } from \"@red-cup-engineering/write-javascript-node-standard-output-text-service\";\n\n/**\n * Greets one named person.\n * @param {object} request A record with `name`.\n * @returns {object} A Greeting record.\n * @throws {TypeError} When name is not a string.\n */\nexport function greetPerson(request) {\n  if (typeof request?.name !== \"string\") throw new TypeError(\"name is required\");\n  return { type: \"Greeting\", text: `Hello, ${basename(request.name)}!` };\n}\n\nif (import.meta.main) {\n  if (process.argv.includes(\"--help\")) {\n    process.stdout.write(\"greetPerson — Greets one named person.\\n\");\n  } else {\n    const { text } = await readJavascriptNodeStandardInputText({ type: \"JavascriptNodeStandardInputTextReadRequest\", version: 1 }, { standardInput: process.stdin });\n    const outputLines = [];\n    let refused = false;\n    for (const line of text.split(\"\\n\")) {\n      if (line.length === 0) continue;\n      try {\n        const value = JSON.parse(line);\n        outputLines.push(JSON.stringify(greetPerson(value)));\n      } catch (error) {\n        outputLines.push(JSON.stringify({ ok: false, refusal: { reason: error.name, message: error.message } }));\n        refused = true;\n      }\n    }\n    await writeJavascriptNodeStandardOutputText({ type: \"JavascriptNodeStandardOutputTextWriteRequest\", version: 1, text: outputLines.map((outputLine) => `${outputLine}\\n`).join(\"\") }, { standardOutput: process.stdout });\n    if (refused) process.exitCode = 2;\n  }\n}\n"
        },
        {
          "path": "data/records/schema/greet-person.input.schema.json",
          "text": "{\n  \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n  \"title\": \"greetPersonInput\",\n  \"type\": \"object\",\n  \"description\": \"A record with `name`.\"\n}\n"
        },
        {
          "path": "data/records/schema/greet-person.output.schema.json",
          "text": "{\n  \"$schema\": \"https://json-schema.org/draft/2020-12/schema\",\n  \"title\": \"greetPersonOutput\",\n  \"type\": \"object\",\n  \"description\": \"A Greeting record.\"\n}\n"
        }
      ]
    }
  }
];

for (const example of examples) {
  test(example.name, async () => {
    const importedOutput = await projectJsnodeOperationSourceFromArguments(example.input);
    assert.equal(importedOutput.type, "JsnodeOperationSourceProjection");
    assert.equal(importedOutput.path, example.input.path);
    assert.match(importedOutput.text, /runJavascriptNodeOperation/u);
    const command = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/project-jsnode-operation-source-from-arguments.mjs", import.meta.url))], {
      input: JSON.stringify(example.input) + "\n",
      encoding: "utf8",
    });
    assert.equal(command.status, 0, command.stderr);
    const commandOutput = JSON.parse(command.stdout.trim());
    assert.deepEqual(commandOutput, importedOutput);
  });
}
