import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readJavascriptFileExportDocumentation } from "../scripts/read-javascript-file-export-documentation.mjs";

const source = `/**
 * Adds two values.
 * @param {number} left The left value.
 * @param {number} right The right value.
 * @returns {number} Their sum.
 * @throws {TypeError} When either value is not numeric.
 */
export function add(left, right) { return left + right; }

function hidden() {}
`;

test("reads standard JSDoc from exported functions", () => {
  assert.deepEqual(readJavascriptFileExportDocumentation({ type: "TextFileRead", path: "scripts/add.mjs", text: source }), [{
    type: "JavascriptFileExportDocumentation",
    version: 1,
    path: "scripts/add.mjs",
    name: "add",
    kind: "function",
    signature: "export function add(left, right)",
    description: "Adds two values.",
    parameters: [
      { name: "left", type: "number", description: "The left value." },
      { name: "right", type: "number", description: "The right value." },
    ],
    returns: { type: "number", description: "Their sum." },
    throws: [{ type: "TypeError", description: "When either value is not numeric." }],
    tags: [],
  }]);
});

test("reads JSDoc attached to a re-export of an imported function", () => {
  const reexportSource = `import { add as addUpstream } from "./add-upstream.mjs";

/**
 * Adds two values.
 * @param {number} left The left value.
 * @param {number} right The right value.
 * @returns {number} Their sum.
 */
export { addUpstream as add };
`;
  assert.deepEqual(readJavascriptFileExportDocumentation({ type: "TextFileRead", path: "scripts/add.mjs", text: reexportSource }), [{
    type: "JavascriptFileExportDocumentation",
    version: 1,
    path: "scripts/add.mjs",
    name: "add",
    kind: "function",
    signature: "export function add(left, right)",
    description: "Adds two values.",
    parameters: [
      { name: "left", type: "number", description: "The left value." },
      { name: "right", type: "number", description: "The right value." },
    ],
    returns: { type: "number", description: "Their sum." },
    throws: [],
    tags: [],
  }]);
});

test("the command face accepts and emits NDJSON records", () => {
  const command = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/read-javascript-file-export-documentation.mjs", import.meta.url))], {
    input: `${JSON.stringify({ type: "TextFileRead", path: "scripts/add.mjs", text: source })}\n`,
    encoding: "utf8",
  });
  assert.equal(command.status, 0, command.stderr);
  assert.deepEqual(JSON.parse(command.stdout), readJavascriptFileExportDocumentation({ type: "TextFileRead", path: "scripts/add.mjs", text: source })[0]);
});

test("refuses invalid carriers and invalid JavaScript", () => {
  assert.throws(() => readJavascriptFileExportDocumentation({ path: "x.mjs", text: "" }), /TextFileRead/u);
  assert.throws(() => readJavascriptFileExportDocumentation({ type: "TextFileRead", path: "x.mjs", text: "export function {" }), SyntaxError);
});
