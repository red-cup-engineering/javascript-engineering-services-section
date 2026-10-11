import assert from "node:assert/strict";
import test from "node:test";
import { readJavascriptFileMainGuards } from "../scripts/read-javascript-file-main-guards.mjs";

test("reads an actual import.meta.main guard and ignores lookalikes", () => {
  const text = [
    "// if (import.meta.main) {}",
    'const fiction = "if (import.meta.main)";',
    "if (other.main) {}",
    "if (import.meta.main) { process.stdout.write('yes'); }",
    "",
  ].join("\n");
  const guards = readJavascriptFileMainGuards({ type: "TextFileRead", path: "scripts/example.mjs", text });
  assert.equal(guards.length, 1);
  assert.equal(text.slice(guards[0].start, guards[0].end), "if (import.meta.main) { process.stdout.write('yes'); }");
});

test("refuses invalid carriers and invalid JavaScript", () => {
  assert.throws(() => readJavascriptFileMainGuards({ path: "x.mjs", text: "" }), TypeError);
  assert.throws(() => readJavascriptFileMainGuards({ type: "TextFileRead", path: "x.mjs", text: "if (" }), SyntaxError);
});
