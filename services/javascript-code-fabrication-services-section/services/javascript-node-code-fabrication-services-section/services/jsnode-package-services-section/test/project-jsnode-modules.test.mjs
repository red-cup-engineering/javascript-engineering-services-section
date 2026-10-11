import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { projectJsnodeModules } from "../src/project-jsnode-modules.mjs";
import { projectJsnodePackageCli } from "../scripts/project-jsnode-package-cli.mjs";
import { readFile } from "node:fs/promises";

const javascriptNode = fileURLToPath(new URL("../../../../../../javascript-node-services-section/", import.meta.url));
const houseResolver = path.join(javascriptNode, "scripts/register-house-resolver.mjs");
const operationRunner = path.join(javascriptNode, "scripts/run-javascript-node-operation-module.mjs");
const specification = {
  sources: [
    { path: "src/base.mjs", text: "export const base = 1;\n" },
    { path: "src/math.mjs", text: "import { base } from './base.mjs';\nexport const increment = (value) => value + base;\nexport const double = (value) => value * 2;\n" },
  ],
  operations: [
    { name: "increment", module: "src/math.mjs", exportName: "increment", description: "Adds one.", inputSchema: { type: "integer" }, outputSchema: { type: "integer" } },
    { name: "double", module: "src/math.mjs", exportName: "double", description: "Doubles.", inputSchema: { type: "integer" }, outputSchema: { type: "integer" } },
  ],
  cli: { path: "apps/math-cli.mjs", name: "math", description: "Runs math." },
};
function run(file, arguments_, input) {
  return new Promise((resolve, reject) => {
    // A catalog is a declaration: the code layer's runner executes it.
    const child = spawn(process.execPath, ["--import", houseResolver, operationRunner, file, ...arguments_]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timeout = setTimeout(() => child.kill(), 60_000);
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code, signal) => { clearTimeout(timeout); code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`CLI failed (${signal ?? code}): ${stderr}`)); });
    child.stdin.end(input);
  });
}
async function materialize(root, files) {
  for (const file of files) {
    const destination = path.join(root, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.text, { mode: file.mode });
  }
}

test("projects shared source modules and one schema-bound NDJSON catalog without wrappers", async (t) => {
  const first = projectJsnodeModules(specification);
  assert.deepEqual(first, projectJsnodeModules(specification));
  assert.equal(first.find((file) => file.path === "src/math.mjs").text, specification.sources[1].text);
  assert.deepEqual(first.map((file) => file.path), ["apps/math-cli.mjs", "data/records/schema/double.input.schema.json", "data/records/schema/double.output.schema.json", "data/records/schema/increment.input.schema.json", "data/records/schema/increment.output.schema.json", "src/base.mjs", "src/math.mjs"]);
  const root = await mkdtemp(path.join(tmpdir(), "jsnode-modules-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await materialize(root, first);
  const module = await import(pathToFileURL(path.join(root, "src/math.mjs")).href);
  assert.equal(module.increment(2), 3);
  assert.equal(module.double(2), 4);
  const catalogText = first.find((file) => file.path === "apps/math-cli.mjs").text;
  assert.match(catalogText, /^export const catalog = Object\.freeze\(/mu);
  assert.doesNotMatch(catalogText, /^#!|import\.meta\.main|javascript-node-services-section|createJavascriptNodeOperation|process\./mu);
  assert.equal((await run(path.join(root, "apps/math-cli.mjs"), [], "")).stdout.includes("increment"), true);
  assert.equal((await run(path.join(root, "apps/math-cli.mjs"), ["increment"], "2\n")).stdout, "3\n");
  assert.equal((await run(path.join(root, "apps/math-cli.mjs"), ["double"], "2\n4\n")).stdout, "4\n8\n");
  assert.equal(first.find((file) => file.path === "apps/math-cli.mjs").mode, 0o644);
  const changed = projectJsnodeModules({ ...specification, cli: { ...specification.cli, description: "Runs integer math." } });
  assert.notEqual(changed.find((file) => file.path === specification.cli.path).text, first.find((file) => file.path === specification.cli.path).text);
});

test("keeps module-only projections minimal and refuses collisions or unknown exports", () => {
  assert.deepEqual(projectJsnodeModules({ sources: [{ path: "src/only.mjs", text: "export const only = true;\n" }], operations: [] }).map((file) => file.path), ["src/only.mjs"]);
  assert.throws(() => projectJsnodeModules({ ...specification, sources: [specification.sources[0], specification.sources[0]], operations: [] }), /duplicate source path/u);
  assert.throws(() => projectJsnodeModules({ ...specification, operations: [{ ...specification.operations[0], exportName: "absent" }] }), /operation export is not present/u);
  assert.throws(() => projectJsnodeModules({ ...specification, sources: [{ path: "src/../escape.mjs", text: "export const a = 1;" }], operations: [] }), /unsafe path/u);
  assert.throws(() => projectJsnodeModules({ ...specification, cli: { ...specification.cli, path: "apps\\escape.mjs" } }), /path/u);
  assert.throws(() => projectJsnodeModules({ sources: [{ path: "src/a.mjs", text: "import '../escape.mjs'; export const a = 1;" }], operations: [] }), /external reference is not declared/u);
  assert.throws(() => projectJsnodeModules({ ...specification, operations: [{ ...specification.operations[0], inputSchema: { type: "not-a-json-schema-type" } }] }), /invalid input schema/u);
});


test("projects the checked-in catalog binding without drift and executes its module projection", async () => {
  const projected = await projectJsnodePackageCli();
  const current = await readFile(new URL("../apps/jsnode-package-cli.mjs", import.meta.url), "utf8");
  assert.equal(projected.text, current);
  for (const name of ["admit", "project", "create", "project-modules", "translate-markdown"]) assert.match(current, new RegExp(JSON.stringify(name)));
  assert.doesNotMatch(current, /check-destination-fragmentation/u);
  const cli = fileURLToPath(new URL("../apps/jsnode-package-cli.mjs", import.meta.url));
  assert.doesNotMatch(current, /^#!|import\.meta\.main/mu);
  assert.match((await run(cli, ["--help"], "")).stdout, /project-modules/u);
  const output = await run(cli, ["project-modules"], `${JSON.stringify({ sources: [{ path: "src/value.mjs", text: "export const value = (x) => x;\n" }], operations: [{ name: "value", module: "src/value.mjs", exportName: "value", description: "Returns a value." }] })}\n`);
  assert.equal(JSON.parse(output.stdout)[0].path, "src/value.mjs");
  const admitted = await run(cli, ["admit"], `${JSON.stringify({
    type: "JsnodeOperationPackageSpecificationCandidate", version: 2, topic: "numbers", packageName: "@red-cup-engineering/numbers-service", packageVersion: "0.1.0", license: "MIT", dependencies: {}, devDependencies: {},
    sources: [{ type: "JavascriptNodePackageSource", path: "src/numbers.mjs", text: "export const answer = () => 42;\n" }],
    operations: [{ type: "JsnodeOperationArguments", version: 1, path: "scripts/answer.mjs", exportName: "answer", exportCount: 1, description: "Answers.", params: [], returns: { type: "number", description: "Answer." }, throws: [], imports: [], bodyText: "export const answer = () => 42;", residue: [], residueStatements: [], inputSchema: null, outputSchema: null }],
    tests: [{ type: "JavascriptNodeOperationTestSource", path: "test/numbers.test.mjs", text: "import test from 'node:test'; test('numbers', () => {});" }], examples: [{ type: "JsnodeOperationPackageExample", name: "answers", operation: "scripts/answer.mjs", input: null, output: 42 }],
  })}\n`);
  assert.equal(JSON.parse(admitted.stdout).type, "JsnodeOperationPackageSpecification");
});
