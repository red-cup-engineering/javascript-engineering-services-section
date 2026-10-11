import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkJavascriptExportCommentDiscipline } from "../scripts/check-javascript-export-comment-discipline.mjs";

const examples = [
  {
    "type": "JavascriptNodeOperationExample",
    "name": "clean-file",
    "input": {
      "type": "TextFileRead",
      "path": "samples/clean.mjs",
      "text": "/**\n * Adds two numbers.\n *\n * @param {number} a The first addend.\n * @param {number} b The second addend.\n * @returns {number} The sum.\n */\nexport function add(a, b) {\n  return a + b;\n}\n"
    },
    "output": {
      "type": "JavascriptExportCommentDisciplineReport",
      "version": 1,
      "path": "samples/clean.mjs",
      "exports": [
        {
          "name": "add",
          "hasDescription": true,
          "hasReturns": true,
          "hasReturnsType": true,
          "parametersMissingType": []
        }
      ],
      "looseComments": [],
      "commentLineCount": 7,
      "looseCommentLineCount": 0,
      "codeLineCount": 3,
      "blankLineCount": 1,
      "totalLines": 11,
      "looseCommentToCodeRatio": 0,
      "violations": [],
      "conformant": true
    }
  },
  {
    "type": "JavascriptNodeOperationExample",
    "name": "messy-file",
    "input": {
      "type": "TextFileRead",
      "path": "samples/messy.mjs",
      "text": "// This whole section exists because the original author had a lot of\n// feelings about how addition works in this universe, and wanted to\n// explain, at great length, the history of arithmetic before getting\n// to the point, which frankly nobody asked for and which bloats this\n// file for no good reason at all, on and on it goes.\nexport function add(a, b) {\n  // just add them\n  return a + b;\n}\n"
    },
    "output": {
      "type": "JavascriptExportCommentDisciplineReport",
      "version": 1,
      "path": "samples/messy.mjs",
      "exports": [
        {
          "name": "add",
          "hasDescription": false,
          "hasReturns": false,
          "hasReturnsType": false,
          "parametersMissingType": []
        }
      ],
      "looseComments": [
        {
          "startLine": 1,
          "endLine": 5,
          "lineCount": 5,
          "kind": "line"
        },
        {
          "startLine": 7,
          "endLine": 7,
          "lineCount": 1,
          "kind": "line"
        }
      ],
      "commentLineCount": 6,
      "looseCommentLineCount": 6,
      "codeLineCount": 3,
      "blankLineCount": 1,
      "totalLines": 10,
      "looseCommentToCodeRatio": 2,
      "violations": [
        {
          "code": "PROSE_ESSAY_COMMENT",
          "startLine": 1,
          "endLine": 5,
          "message": "loose comment at lines 1-5 (5 lines) exceeds the 4-line threshold for a comment not attached to exported JSDoc"
        },
        {
          "code": "MISSING_EXPORT_DESCRIPTION",
          "exportName": "add",
          "message": "exported add has no JSDoc description"
        },
        {
          "code": "MISSING_EXPORT_RETURNS",
          "exportName": "add",
          "message": "exported add has no JSDoc @returns"
        },
        {
          "code": "EXCESSIVE_COMMENT_RATIO",
          "message": "loose-comment-to-code ratio 2.00 exceeds 0.3"
        }
      ],
      "conformant": false
    }
  }
];

for (const example of examples) {
  test(example.name, async () => {
    const importedOutput = await checkJavascriptExportCommentDiscipline(example.input);
    assert.deepEqual(importedOutput, example.output);
    const command = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/check-javascript-export-comment-discipline.mjs", import.meta.url))], {
      input: JSON.stringify(example.input) + "\n",
      encoding: "utf8",
    });
    assert.equal(command.status, 0, command.stderr);
    const commandOutput = JSON.parse(command.stdout.trim());
    assert.deepEqual(commandOutput, example.output);
    assert.deepEqual(commandOutput, importedOutput);
  });
}
