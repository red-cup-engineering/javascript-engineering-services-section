import assert from "node:assert/strict";
import test from "node:test";
import { exportSubpaths, exportTargets, resolveExportSubpath } from "../src/workspace/exports/resolve.mjs";

test("sugar forms stand for the root subpath", () => {
  for (const value of ["./index.mjs", ["./index.mjs"], { import: "./index.mjs", default: "./index.cjs" }]) {
    assert.deepEqual(exportSubpaths(value), [{ subpath: ".", pattern: false }]);
    assert.deepEqual(resolveExportSubpath(value, "."), { status: "exported", key: ".", target: "./index.mjs" });
  }
  assert.deepEqual(exportSubpaths(undefined), []);
  assert.deepEqual(resolveExportSubpath(undefined, "."), { status: "unexported" });
});

test("exact subpaths win over patterns, and the longest pattern prefix wins among patterns", () => {
  const map = { "./x": "./src/x.mjs", "./*": "./src/*.mjs", "./dispatch/*": "./src/dispatch/*.mjs" };
  assert.deepEqual(resolveExportSubpath(map, "./x"), { status: "exported", key: "./x", target: "./src/x.mjs" });
  assert.deepEqual(resolveExportSubpath(map, "./y"), { status: "exported", key: "./*", target: "./src/y.mjs" });
  assert.deepEqual(resolveExportSubpath(map, "./dispatch/operations"), { status: "exported", key: "./dispatch/*", target: "./src/dispatch/operations.mjs" });
  assert.deepEqual(resolveExportSubpath({ "./a": "./a.mjs" }, "./b"), { status: "unexported" });
});

test("conditions resolve in key order, arrays take the first match, and null excludes", () => {
  const map = {
    ".": { types: "./index.d.mts", import: "./index.mjs", require: "./index.cjs" },
    "./node-only": { node: { import: "./node.mjs" }, default: "./browser.mjs" },
    "./private/*": null,
    "./private/open": "./private/open.mjs",
    "./require-only": { require: "./r.cjs" },
    "./fallback": [{ worker: "./w.mjs" }, "./f.mjs"],
  };
  assert.equal(resolveExportSubpath(map, ".").target, "./index.mjs");
  assert.equal(resolveExportSubpath(map, "./node-only").target, "./node.mjs");
  assert.equal(resolveExportSubpath(map, "./node-only", ["browser", "default"]).target, "./browser.mjs");
  assert.deepEqual(resolveExportSubpath(map, "./private/secret"), { status: "excluded", key: "./private/*" });
  assert.equal(resolveExportSubpath(map, "./private/open").target, "./private/open.mjs");
  assert.deepEqual(resolveExportSubpath(map, "./require-only"), { status: "unexported" });
  assert.equal(resolveExportSubpath(map, "./fallback").target, "./f.mjs");
});

test("every target a map names is listed with its subpath and condition path", () => {
  const targets = exportTargets({ ".": { types: "./i.d.mts", import: "./i.mjs" }, "./*": "./src/*.mjs", "./gone": null });
  assert.deepEqual(targets.map(({ subpath, conditions, target }) => [subpath, conditions.join("+"), target]), [
    [".", "types", "./i.d.mts"],
    [".", "import", "./i.mjs"],
    ["./*", "", "./src/*.mjs"],
  ]);
});

test("array null fallback and pattern precedence agree with actual Node ESM resolution", async (t) => {
  const { spawnSync } = await import("node:child_process");
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  const root = mkdtempSync(join(tmpdir(), "exports-node-conformance-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cases = [
    [[null, "./ok.mjs"], ".", "./ok.mjs"],
    [["invalid", "./ok.mjs"], ".", "./ok.mjs"],
    [[null, "invalid"], ".", { error: "ERR_INVALID_PACKAGE_TARGET" }],
    [{ ".": { "0": "./zero.mjs", import: "./ok.mjs" } }, ".", { error: "ERR_INVALID_PACKAGE_CONFIG" }],
    [{ ".": "./ok.mjs", import: "./other.mjs" }, ".", { error: "ERR_INVALID_PACKAGE_CONFIG" }],
    [{ "module-sync": "./sync.mjs", default: "./fallback.mjs" }, ".", "./sync.mjs"],
    [{ "node-addons": "./native.node", default: "./fallback.mjs" }, ".", "./native.node"],
    [{ "module-sync": "./sync.mjs", import: "./import.mjs" }, ".", "./sync.mjs"],
    [[null, { worker: "./worker.mjs" }, "./ok.mjs"], ".", "./ok.mjs"],
    [[[null], "./ok.mjs"], ".", "./ok.mjs"],
    [[[], "./ok.mjs"], ".", "./ok.mjs"],
    [{ "./x": [] }, "./x", null],
    [{ "./x": [null, { worker: "./worker.mjs" }] }, "./x", null],
    [{ "./x": { import: null, default: "./ok.mjs" } }, "./x", null],
    [{ "./x": [{ import: null, default: "./wrong.mjs" }, "./ok.mjs"] }, "./x", "./ok.mjs"],
    [{ "./features/*": "./generic/*.mjs", "./features/*.js": "./specific/*.mjs" }, "./features/a.js", "./specific/a.mjs"],
    [{ "./features/*.js": "./specific/*.mjs", "./features/*": "./generic/*.mjs" }, "./features/a.js", "./specific/a.mjs"],
    [{ "./features/*": "./generic/*.mjs", "./features/*.js": null }, "./features/a.js", null],
    [{ "./features/*": "./generic/*.mjs", "./features/deep/*": "./deep/*.mjs" }, "./features/deep/a", "./deep/a.mjs"],
    [{ "./x*": "./target*.mjs" }, "./x", null],
    [{ "./x*.js": "./target*.mjs" }, "./x.js", null],
    [{ "./x/*": "./pattern/*.mjs", "./x/a": "./exact.mjs" }, "./x/a", "./exact.mjs"],
  ];
  for (const capture of ["dollar$&", "dollar$$", "dollar$`", "dollar$'"]) {
    cases.push([{ "./*": "./src/*/copy-*.mjs" }, `./${capture}`, `./src/${capture}/copy-${capture}.mjs`]);
  }
  for (const [exports, subpath, target] of cases) {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@house/resolve-probe", type: "module", exports }));
    const specifier = `@house/resolve-probe${subpath === "." ? "" : subpath.slice(1)}`;
    writeFileSync(join(root, "probe.mjs"), `try { console.log(JSON.stringify({url:import.meta.resolve(${JSON.stringify(specifier)})})); } catch(error) { console.log(JSON.stringify({code:error.code})); }\n`);
    const child = spawnSync(process.execPath, [join(root, "probe.mjs")], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    const actual = JSON.parse(child.stdout);
    if (target?.error) {
      assert.equal(actual.code, target.error);
      assert.throws(() => resolveExportSubpath(exports, subpath), { code: target.error });
      continue;
    }
    const reading = resolveExportSubpath(exports, subpath);
    if (target === null) {
      assert.equal(actual.code, "ERR_PACKAGE_PATH_NOT_EXPORTED", JSON.stringify({ exports, subpath, actual }));
      assert.notEqual(reading.status, "exported");
    } else {
      assert.equal(actual.url, new URL(target, pathToFileURL(`${root}/`)).href);
      assert.equal(reading.target, target);
    }
  }
});


test("target listing excludes invalid array alternatives while rejecting malformed configuration", () => {
  assert.deepEqual(exportTargets({ ".": ["invalid", "./ok.mjs"] }), [{ subpath: ".", conditions: [], target: "./ok.mjs" }]);
  for (const value of [{ ".": "./ok.mjs", import: "./other.mjs" }, { ".": { "0": "./zero.mjs", import: "./ok.mjs" } }]) {
    assert.throws(() => exportTargets(value), { code: "ERR_INVALID_PACKAGE_CONFIG" });
  }
  assert.throws(() => resolveExportSubpath({ ".": [null, "../outside.mjs"] }, "."), { code: "ERR_INVALID_PACKAGE_TARGET" });
  assert.equal(resolveExportSubpath({ ".": ["../outside.mjs", "./ok.mjs"] }, ".").target, "./ok.mjs");
});
