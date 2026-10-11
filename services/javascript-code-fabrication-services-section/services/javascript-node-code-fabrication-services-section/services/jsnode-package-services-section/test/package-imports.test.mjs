import assert from "node:assert/strict";
import test from "node:test";
import { codeRole, houseSpecifiersOfText, importsOfFiles, packageNameOf } from "../src/package-imports.mjs";

test("every form a module uses a house package by is read, and nothing else", () => {
  const text = [
    'import { a } from "@red-cup-engineering/alpha/sub";',
    'export * from "@lenticule-science/beta";',
    'const c = await import("@red-cup-engineering/gamma");',
    'const d = require("@red-cup-engineering/delta");',
    'import "@red-cup-engineering/epsilon";',
    'const e = import.meta.resolve("@red-cup-engineering/zeta/data.json");',
    'const f = resolveModule("@red-cup-engineering/eta/custody");',
    'route("admit", "@red-cup-engineering/theta/integrations/hooks:appendHookEvent", "service");',
    'import x from "semver"; import y from "./local.mjs"; import "node:fs";',
    '// "@red-cup-engineering/iota" in a comment string with no load shape is not a use',
  ].join("\n");
  assert.deepEqual(houseSpecifiersOfText(text), [
    "@lenticule-science/beta", "@red-cup-engineering/alpha/sub", "@red-cup-engineering/delta", "@red-cup-engineering/epsilon",
    "@red-cup-engineering/eta/custody", "@red-cup-engineering/gamma", "@red-cup-engineering/theta/integrations/hooks", "@red-cup-engineering/zeta/data.json",
  ]);
  assert.equal(packageNameOf("@red-cup-engineering/alpha/sub/x"), "@red-cup-engineering/alpha");
});

test("runtime, test and foreign code are told apart, and a package used at runtime is never test-only", () => {
  assert.equal(codeRole("src/a.mjs"), "runtime");
  assert.equal(codeRole("src/a.test.mjs"), "test");
  assert.equal(codeRole("test/fixtures/a.mjs"), "test");
  assert.equal(codeRole("lib/legacy/a.mjs"), null);
  assert.equal(codeRole("src/types.d.mts"), null);
  assert.equal(codeRole("README.md"), null);
  const imports = importsOfFiles([
    { path: "src/index.mjs", text: 'import "@red-cup-engineering/runtime-one";' },
    { path: "test/index.test.mjs", text: 'import "@red-cup-engineering/runtime-one"; import "@red-cup-engineering/test-only";' },
    { path: "services/nested/src/index.mjs", text: 'import "@red-cup-engineering/nested-only";' },
  ], { nestedRoots: ["services/nested"] });
  assert.deepEqual([...imports.runtime], [["@red-cup-engineering/runtime-one", ["src/index.mjs"]]]);
  assert.deepEqual([...imports.test], [["@red-cup-engineering/test-only", ["test/index.test.mjs"]]]);
});
