import assert from "node:assert/strict";
import test from "node:test";
import { projectScriptOntoOperation, KERNEL_SPECIFIER } from "./operation-form.mjs";

const LEGACY = `#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function usage() {
  return "count-lines <file>";
}

/**
 * Counts the lines of one text. Trailing newlines count once.
 * @param {{text: string}} request
 * @returns {{lines: number}}
 */
export function countLines(request) {
  return { lines: request.text.split("\\n").length };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  process.stdout.write(JSON.stringify(countLines(JSON.parse(text))) + "\\n");
}
`;

test("a one-export script with a stdin guard becomes an operation on the kernel, dead helpers and imports deleted", () => {
  const result = projectScriptOntoOperation(LEGACY, "count-lines.mjs");
  assert.ok(result.ok, JSON.stringify(result));
  const form = result.value;
  assert.equal(form.operationName, "count-lines");
  assert.equal(form.exportName, "countLines");
  assert.equal(form.description, "Counts the lines of one text.");
  assert.deepEqual([...form.removedDeclarations], ["usage"]);
  assert.deepEqual([...form.removedImports].sort(), ["node:fs", "node:path", "node:url"]);
  assert.ok(form.text.startsWith("#!/usr/bin/env node\n"));
  assert.ok(form.text.includes(`import { runJavascriptNodeOperation } from "${KERNEL_SPECIFIER}";`));
  assert.ok(form.text.includes("export function countLines(request)"));
  assert.ok(!form.text.includes("function usage"));
  assert.ok(!form.text.includes("fileURLToPath"));
  assert.match(form.text, /if \(import\.meta\.main\) \{\n  const result = await runJavascriptNodeOperation\(\{ name: "count-lines", description: "Counts the lines of one text\.", operation: countLines \}/u);
  const again = projectScriptOntoOperation(form.text, "count-lines.mjs");
  assert.equal(again.ok, false);
  assert.equal(!again.ok && again.refusal.code, "already-operation-form");
});

test("a script whose guard reads argv is refused as a face decision, never rewritten", () => {
  const source = `export function f(x) { return x; }\nif (import.meta.main) { const flag = process.argv.includes("--fast"); process.stdout.write(String(f(flag))); }\n`;
  const result = projectScriptOntoOperation(source, "f.mjs");
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.refusal.code, "argv-face-needs-migration-decision");
});

test("a zero-export script is refused as an app", () => {
  const result = projectScriptOntoOperation(`import { x } from "y";\nif (import.meta.main) { x(); }\n`, "app.mjs");
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.refusal.code, "zero-export-script-is-an-app");
});
