import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { admitJsnodeOperationPackageSpecification } from "../src/admit-jsnode-operation-package-specification.mjs";
import { projectJsnodeOperationPackage } from "../src/project-jsnode-operation-package.mjs";

function candidate(cli = null) {
  return {
    type: "JsnodeOperationPackageSpecificationCandidate", version: 2,
    packageName: "@test/numbers", packageVersion: "0.1.0", license: "MIT", topic: "numbers", cli,
    sources: [
      { type: "JavascriptNodePackageSource", path: "src/shared.mjs", text: "export const unit = 1;\n" },
      { type: "JavascriptNodePackageSource", path: "src/numbers.mjs", text: 'import { unit } from "./shared.mjs";\nexport function increment(value) { return value + unit; }\nexport async function double(value) { return value * 2; }\n' },
    ],
    operations: [
      { name: "increment", module: "src/numbers.mjs", exportName: "increment", description: "Increments a number.", inputSchema: { type: "number" }, outputSchema: { type: "number" } },
      { name: "double", module: "src/numbers.mjs", exportName: "double", description: "Doubles a number.", inputSchema: { type: "number" }, outputSchema: { type: "number" } },
    ],
    tests: [{ type: "JavascriptNodeOperationTestSource", path: "test/numbers.test.mjs", text: 'import assert from "node:assert/strict"; import test from "node:test"; import { increment, double } from "../src/numbers.mjs"; test("shared exports", async () => { assert.equal(increment(8), 9); assert.equal(await double(8), 16); });\n' }],
    examples: [
      { type: "JsnodeOperationPackageExample", name: "increments", operation: "increment", input: 3, output: 4 },
      { type: "JsnodeOperationPackageExample", name: "doubles", operation: "double", input: 3, output: 6 },
    ], dependencies: {}, devDependencies: {},
  };
}

test("one projection retains shared modules, explicit schemas, and examples without command apparatus", async (t) => {
  const admitted = admitJsnodeOperationPackageSpecification(candidate());
  assert.equal(admitted.type, "JsnodeOperationPackageSpecification", JSON.stringify(admitted));
  const projection = projectJsnodeOperationPackage(admitted);
  assert.deepEqual(projection, projectJsnodeOperationPackage(admitted));
  assert.match(projection.filesDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(projection.files.some(({path}) => path.startsWith("scripts/") || path.startsWith("apps/")), false);
  const manifest = JSON.parse(projection.files.find(({path}) => path === "package.json").text);
  assert.deepEqual(manifest.exports, { "./increment": "./src/numbers.mjs", "./double": "./src/numbers.mjs" });
  assert.equal(manifest.bin, undefined);
  assert.deepEqual(manifest.dependencies, {});
  const root = await mkdtemp(path.join(tmpdir(), "module-package-"));
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const file of projection.files) { await mkdir(path.dirname(path.join(root, file.path)), {recursive: true}); await writeFile(path.join(root, file.path), file.text); }
  const result = spawnSync(process.execPath, ["--test", "test/numbers.test.mjs", "test/operation-contracts.test.mjs"], {cwd: root, encoding: "utf8"});
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(projection.files.find(({path}) => path === "README.md").text, /increments/u);
});

test("optional catalog uses the same functions and one explicit schema pair per binding", () => {
  const input = candidate(); delete input.cli;
  const admitted = admitJsnodeOperationPackageSpecification(input);
  const projection = projectJsnodeOperationPackage(admitted);
  const app = projection.files.find(({path}) => path === "apps/numbers-cli.mjs");
  assert.ok(app);
  assert.match(app.text, /^export const catalog = Object\.freeze\(/mu);
  assert.doesNotMatch(app.text, /runJavascriptNodeOperationCatalog|createJavascriptNodeOperation|import\.meta\.main|^#!/mu);
  assert.equal(Object.hasOwn(JSON.parse(projection.files.find(({path}) => path === "package.json").text), "bin"), false);
  assert.equal(projection.files.filter(({path}) => path.startsWith("apps/")).length, 1);
  assert.equal(projection.files.some(({path}) => path.startsWith("scripts/")), false);
});

test("examples must name a binding when two functions share a module", () => {
  const input = candidate(); input.examples[0].operation = "src/numbers.mjs";
  assert.equal(admitJsnodeOperationPackageSpecification(input).type, "JsnodeOperationPackageSpecificationRefusal");
});

test("package realization requires an example for each operation binding", () => {
  const input = candidate(); input.examples.pop();
  assert.equal(admitJsnodeOperationPackageSpecification(input).code, "MISSING_OPERATION_EXAMPLE");
});
