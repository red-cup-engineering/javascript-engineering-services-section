import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { isMain, isStrictMain, runJsonMain } from "../scripts/javascript-file-main-guard.mjs";

const modulePath = realpathSync(new URL("../scripts/javascript-file-main-guard.mjs", import.meta.url));

test("isMain compares real files and follows entry symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "javascript-main-guard-"));
  const entryLink = join(root, "entry.mjs");
  symlinkSync(modulePath, entryLink);

  assert.equal(isMain(pathToFileURL(modulePath), modulePath), true);
  assert.equal(isMain(pathToFileURL(modulePath), entryLink), true);
  assert.equal(isMain(pathToFileURL(entryLink), modulePath), true);
  assert.equal(isMain(pathToFileURL(modulePath), relative(process.cwd(), modulePath)), true);
});

test("isMain returns false for different, missing, absent, and invalid entries", () => {
  assert.equal(isMain(import.meta.url, modulePath), false);
  assert.equal(isMain(pathToFileURL(modulePath), undefined), false);
  assert.equal(isMain(pathToFileURL(modulePath), `${modulePath}.missing`), false);
  assert.equal(isMain("not a file URL", modulePath), false);
});

test("isStrictMain compares the raw invoked path without resolving symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "javascript-strict-main-"));
  const entry = join(root, "entry.mjs");
  const entryLink = join(root, "entry-link.mjs");
  writeFileSync(entry, "");
  symlinkSync(entry, entryLink);

  assert.equal(isStrictMain(pathToFileURL(entry), entry), true);
  assert.equal(isStrictMain(pathToFileURL(entry), entryLink), false);
  assert.equal(isMain(pathToFileURL(entry), entryLink), true);
});

test("runMain passes the argument tail and selected streams on direct execution", () => {
  const root = mkdtempSync(join(tmpdir(), "javascript-run-main-"));
  const entry = join(root, "success.mjs");
  const sourceUrl = new URL("../scripts/javascript-file-main-guard.mjs", import.meta.url).href;
  writeFileSync(entry, [
    `import { runMain } from ${JSON.stringify(sourceUrl)};`,
    "await runMain(async ({ argv, stdout }) => {",
    "  stdout.write(argv.join('|'));",
    "}, { moduleUrl: import.meta.url });",
    "",
  ].join("\n"));

  const result = spawnSync(process.execPath, [entry, "alpha", "beta"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "alpha|beta");
  assert.equal(result.stderr, "");
});

test("runMain defaults to raw error.message plus newline and exit code 2", () => {
  const root = mkdtempSync(join(tmpdir(), "javascript-run-main-error-"));
  const entry = join(root, "failure.mjs");
  const sourceUrl = new URL("../scripts/javascript-file-main-guard.mjs", import.meta.url).href;
  writeFileSync(entry, [
    `import { runMain } from ${JSON.stringify(sourceUrl)};`,
    "await runMain(async () => { throw new Error('boom'); }, { moduleUrl: import.meta.url });",
    "",
  ].join("\n"));

  const result = spawnSync(process.execPath, [entry], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "boom\n");
});

test("runMain retains leaf formatting and exit-code overrides", () => {
  const root = mkdtempSync(join(tmpdir(), "javascript-run-main-override-"));
  const entry = join(root, "failure.mjs");
  const sourceUrl = new URL("../scripts/javascript-file-main-guard.mjs", import.meta.url).href;
  writeFileSync(entry, [
    `import { runMain } from ${JSON.stringify(sourceUrl)};`,
    "await runMain(async () => { throw new Error('boom'); }, {",
    "  moduleUrl: import.meta.url,",
    "  formatError: (error) => `leaf:${error.message}\\n`,",
    "  exitCode: 23,",
    "});",
    "",
  ].join("\n"));

  const result = spawnSync(process.execPath, [entry], { encoding: "utf8" });
  assert.equal(result.status, 23);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "leaf:boom\n");
});

test("runMain does not execute an imported module", () => {
  const root = mkdtempSync(join(tmpdir(), "javascript-run-main-import-"));
  const child = join(root, "child.mjs");
  const wrapper = join(root, "wrapper.mjs");
  const sourceUrl = new URL("../scripts/javascript-file-main-guard.mjs", import.meta.url).href;
  writeFileSync(child, [
    `import { runMain } from ${JSON.stringify(sourceUrl)};`,
    "await runMain(async ({ stdout }) => stdout.write('ran'), { moduleUrl: import.meta.url });",
    "",
  ].join("\n"));
  writeFileSync(wrapper, `import ${JSON.stringify(pathToFileURL(child).href)};\n`);

  const result = spawnSync(process.execPath, [wrapper], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("runJsonMain writes a JSON result and newline only for the strict raw entry", () => {
  const root = mkdtempSync(join(tmpdir(), "javascript-run-json-main-"));
  const entry = join(root, "success.mjs");
  const entryLink = join(root, "success-link.mjs");
  const sourceUrl = new URL("../scripts/javascript-file-main-guard.mjs", import.meta.url).href;
  writeFileSync(entry, [
    `import { runJsonMain } from ${JSON.stringify(sourceUrl)};`,
    "await runJsonMain(async ({ argv }) => ({ argv }), import.meta.url);",
    "",
  ].join("\n"));
  symlinkSync(entry, entryLink);

  const direct = spawnSync(process.execPath, [entry, "alpha"], { encoding: "utf8" });
  assert.equal(direct.status, 0);
  assert.equal(direct.stdout, '{"argv":["alpha"]}\n');
  assert.equal(direct.stderr, "");

  const linked = spawnSync(process.execPath, [entryLink, "alpha"], { encoding: "utf8" });
  assert.equal(linked.status, 0);
  assert.equal(linked.stdout, "");
  assert.equal(linked.stderr, "");
});

test("runJsonMain refuses errors with exit code 78", () => {
  const root = mkdtempSync(join(tmpdir(), "javascript-run-json-main-error-"));
  const entry = join(root, "failure.mjs");
  const sourceUrl = new URL("../scripts/javascript-file-main-guard.mjs", import.meta.url).href;
  writeFileSync(entry, [
    `import { runJsonMain } from ${JSON.stringify(sourceUrl)};`,
    "await runJsonMain(async () => { throw new Error('boom'); }, import.meta.url);",
    "",
  ].join("\n"));

  const result = spawnSync(process.execPath, [entry], { encoding: "utf8" });
  assert.equal(result.status, 78);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "refused: boom\n");
});
