import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createJsnodeOperationPackage } from "../src/create-jsnode-operation-package.mjs";
import { chmod } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const operationText = `#!/usr/bin/env node
/**
 * Adds one to a number.
 * @param {number} value The starting number.
 * @returns {number} The resulting number.
 */
export function addOne(value) {
  if (typeof value !== "number") throw new TypeError("value must be a number");
  return value + 1;
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("addOne — Adds one to a number.\\n");
  } else {
    process.stdin.setEncoding("utf8");
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\\n")) if (line.trim()) process.stdout.write(JSON.stringify(addOne(JSON.parse(line))) + "\\n");
  }
}
`;

const authoredTest = `import assert from "node:assert/strict";
import test from "node:test";
import { addOne } from "../scripts/add-one.mjs";
test("adds one", () => assert.equal(addOne(1), 2));
test("refuses non-numbers", () => assert.throws(() => addOne("1"), TypeError));
`;

function specification(testText = authoredTest) {
  return {
    type: "JsnodeOperationPackageSpecificationCandidate",
    version: 1,
    packageName: "@red-cup-engineering/add-one-service",
    packageVersion: "0.1.0",
    license: "MIT",
    cli: null,
    operation: { type: "JavascriptNodeOperationSource", path: "scripts/add-one.mjs", text: operationText },
    tests: [{ type: "JavascriptNodeOperationTestSource", path: "test/add-one.test.mjs", text: testText }],
    examples: [{ type: "JavascriptNodeOperationExample", name: "one becomes two", input: 1, output: 2 }],
    dependencies: {},
    devDependencies: {},
  };
}

function request(destination, candidate = specification()) {
  return {
    type: "JsnodeOperationPackageCreationRequest",
    version: 1,
    destination,
    registry: "http://127.0.0.1:4873/",
    specification: candidate,
  };
}

function groupedSpecification(output = 8) {
  const schema = (title) => ({ $schema: "https://json-schema.org/draft/2020-12/schema", title, type: "number", description: `${title} value.` });
  const operation = ({ path: operationPath, exportName, description, bodyText, imports = [], isAsync = false }) => ({
    type: "JsnodeOperationArguments", version: 1, path: operationPath, exportName, exportCount: 1, description,
    params: [{ name: "value", type: "number", description: "The value." }], returns: { type: "number", description: "The result." }, throws: [], imports, isAsync,
    inputSchema: schema(`${exportName}Input`), outputSchema: schema(`${exportName}Output`), bodyText, residue: [], residueStatements: [],
  });
  return {
    type: "JsnodeOperationPackageSpecificationCandidate", version: 2, packageName: "@red-cup-engineering/number-topic-service", packageVersion: "0.1.0", license: "MIT", topic: "number-topic",
    sources: [{ type: "JavascriptNodePackageSource", path: "src/numbers.mjs", text: "export const increment = (value) => value + 1;\nexport const twice = (value) => value * 2;\n" }],
    operations: [
      operation({ path: "scripts/increment-value.mjs", exportName: "incrementValue", description: "Increments one number.", imports: [{ source: "../src/numbers.mjs", names: ["increment"] }], bodyText: "export function incrementValue(value) { return increment(value); }" }),
      operation({ path: "scripts/double-value.mjs", exportName: "doubleValue", description: "Doubles one number asynchronously.", imports: [{ source: "../src/numbers.mjs", names: ["twice"] }], isAsync: true, bodyText: "export async function doubleValue(value) { return twice(value); }" }),
    ],
    tests: [{ type: "JavascriptNodeOperationTestSource", path: "test/number-topic.test.mjs", text: "import assert from 'node:assert/strict';\nimport test from 'node:test';\nimport { incrementValue } from '../scripts/increment-value.mjs';\nimport { doubleValue } from '../scripts/double-value.mjs';\ntest('composes sources', async () => { assert.equal(incrementValue(3), 4); assert.equal(await doubleValue(4), 8); });\n" }],
    examples: [
      { type: "JsnodeOperationPackageExample", name: "increments three", operation: "scripts/increment-value.mjs", input: 3, output: 4 },
      { type: "JsnodeOperationPackageExample", name: "doubles four", operation: "scripts/double-value.mjs", input: 4, output },
    ], dependencies: {}, devDependencies: {},
  };
}

test("refuses a stale installed dependency before accepting staged tests", async (t) => {
  const parent = await mkdtemp(path.join("/tmp", "create-jsnode-stale-dependency-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const fakeNpm = path.join(parent, "npm");
  await writeFile(fakeNpm, "#!" + process.execPath + "\n" + [
    'import {mkdirSync,writeFileSync} from "node:fs";',
    'mkdirSync("node_modules/@test/dependency", {recursive:true});',
    'writeFileSync("node_modules/@test/dependency/package.json", JSON.stringify({name:"@test/dependency",version:"1.0.0",type:"module",exports:{"./operation":"./index.mjs"}}));',
    'writeFileSync("node_modules/@test/dependency/index.mjs", "export const value = 1;");',
  ].join("\n"));
  await chmod(fakeNpm, 0o755);
  const candidate = specification();
  candidate.dependencies = { "@test/dependency": "2.0.0" };
  candidate.operation.text = operationText.replace("/**", "import { value as increment } from \"@test/dependency/operation\";\n/**").replace("return value + 1;", "return value + increment;");
  const previousPath = process.env.PATH;
  process.env.PATH = parent + path.delimiter + previousPath;
  try {
    const result = await createJsnodeOperationPackage(request(path.join(parent, "add-one-service"), candidate));
    assert.equal(result.phase, "installed-dependency-identity", JSON.stringify(result));
    assert.equal(result.code, "INSTALLED_DEPENDENCY_IDENTITY_MISMATCH");
    assert.match(result.message, /"packageVersion":"1.0.0"/u);
    await assert.rejects(access(path.join(parent, "add-one-service")));
  } finally { process.env.PATH = previousPath; }
});

test("creates only after every staged and installed face passes", async (t) => {
  const parent = await mkdtemp(path.join("/tmp", "create-jsnode-package-test-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const destination = path.join(parent, "add-one-service");
  const receipt = await createJsnodeOperationPackage(request(destination));
  assert.equal(receipt.type, "JsnodeOperationPackageCreationReceipt", JSON.stringify(receipt));
  assert.deepEqual(receipt.assays.map(({ name }) => name), ["syntax", "tests", "pack", "clean-installation", "import-face"]);
  const manifest = JSON.parse(await readFile(path.join(destination, "package.json"), "utf8"));
  assert.deepEqual(manifest.exports, { "./add-one": "./src/add-one.mjs" });
  assert.equal(manifest.bin, undefined);
  assert.equal(manifest.scripts.check, "node --check 'src/add-one.mjs'");
  assert.equal(manifest.scripts.test, "node --test test/*.test.mjs");
  assert.equal(Object.hasOwn(manifest.scripts, "verify"), false);
  assert.match(receipt.filesDigest, /^sha256:[a-f0-9]{64}$/u);
});

test("refuses an occupied destination without changing it", async (t) => {
  const parent = await mkdtemp(path.join("/tmp", "create-jsnode-package-test-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const destination = path.join(parent, "occupied");
  await mkdir(destination);
  await writeFile(path.join(destination, "kept.txt"), "kept\n");
  const result = await createJsnodeOperationPackage(request(destination));
  assert.equal(result.code, "DESTINATION_EXISTS");
  assert.equal(await readFile(path.join(destination, "kept.txt"), "utf8"), "kept\n");
});

test("module package creation does not couple directory and package names", async (t) => {
  const parent = await mkdtemp(path.join("/tmp", "create-jsnode-package-test-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const destination = path.join(parent, "wrong-service");
  const result = await createJsnodeOperationPackage(request(destination));
  assert.equal(result.type, "JsnodeOperationPackageCreationReceipt", JSON.stringify(result));
  await access(path.join(destination, "src/add-one.mjs"));
});

test("leaves no destination when a staged behavioral assay fails", async (t) => {
  const parent = await mkdtemp(path.join("/tmp", "create-jsnode-package-test-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const destination = path.join(parent, "add-one-service");
  const failingTest = `import test from "node:test";
test("fails deliberately", () => { throw new Error("deliberate failure"); });
`;
  const result = await createJsnodeOperationPackage(request(destination, specification(failingTest)));
  assert.equal(result.phase, "tests", JSON.stringify(result));
  assert.equal(result.code, "TEST_ASSAY_FAILED");
  await assert.rejects(access(destination));
});

const greetingOperationText = `#!/usr/bin/env node
/**
 * Greets one named person.
 * @param {object} request A record containing the person's name.
 * @returns {object} A Greeting record.
 * @throws {TypeError} When the name is absent.
 */
export function greetPerson(request) {
  if (typeof request?.name !== "string") throw new TypeError("name is required");
  return { type: "Greeting", text: \`Hello,\\n\${request.name}!\` };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("greetPerson — Greets one named person.\\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\\n")) {
      if (line.length > 0) process.stdout.write(\`\${JSON.stringify(greetPerson(JSON.parse(line)), null, 2)}\\n\`);
    }
  }
}
`;

const greetingAuthoredTest = `import assert from "node:assert/strict";
import test from "node:test";
import { greetPerson } from "../scripts/greet-person.mjs";
test("greets the named person", () => assert.equal(greetPerson({ name: "Ada" }).text, "Hello,\\nAda!"));
test("refuses a missing name", () => assert.throws(() => greetPerson({}), /name is required/u));
`;

function greetingSpecification() {
  return {
    type: "JsnodeOperationPackageSpecificationCandidate",
    version: 1,
    packageName: "@red-cup-engineering/greet-person-service",
    packageVersion: "0.1.0",
    license: "MIT",
    cli: null,
    operation: { type: "JavascriptNodeOperationSource", path: "scripts/greet-person.mjs", text: greetingOperationText },
    tests: [{ type: "JavascriptNodeOperationTestSource", path: "test/greet-person.test.mjs", text: greetingAuthoredTest }],
    examples: [{ type: "JavascriptNodeOperationExample", name: "greets Ada", input: { name: "Ada" }, output: { type: "Greeting", text: "Hello,\nAda!" } }],
    dependencies: {},
    devDependencies: {},
  };
}

test("module package preserves JSON data containing embedded newlines", async (t) => {
  const parent = await mkdtemp(path.join("/tmp", "create-jsnode-package-test-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const destination = path.join(parent, "greet-person-service");
  const receipt = await createJsnodeOperationPackage(request(destination, greetingSpecification()));
  assert.equal(receipt.type, "JsnodeOperationPackageCreationReceipt", JSON.stringify(receipt));
  assert.deepEqual(receipt.assays.map(({ name }) => name), ["syntax", "tests", "pack", "clean-installation", "import-face"]);
});

test("packs and clean-installs a shared async module family without a command dependency", async (t) => {
  const parent = await mkdtemp(path.join("/tmp", "create-jsnode-grouped-package-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const destination = path.join(parent, "number-topic-service");
  const grouped = groupedSpecification(); grouped.cli = null;
  const receipt = await createJsnodeOperationPackage(request(destination, grouped));
  assert.equal(receipt.type, "JsnodeOperationPackageCreationReceipt", JSON.stringify(receipt));
  const manifest = JSON.parse(await readFile(path.join(destination, "package.json"), "utf8"));
  assert.equal(manifest.bin, undefined);
  assert.deepEqual(manifest.files, ["src", "apps", "data/records/schema", "README.md", "package.json"]);
  await mkdir(path.join(destination, "data", "runtime"), { recursive: true });
  await writeFile(path.join(destination, "data", "runtime", "sentinel.json"), "{\"private\":true}\n");
  const packed = await execFileAsync("npm", ["pack", "--json", "--ignore-scripts"], { cwd: destination });
  const [{ files }] = JSON.parse(packed.stdout);
  assert.equal(files.some((file) => file.path === "data/runtime/sentinel.json"), false);
});

test("refuses a v2 example outside its declared output schema and leaves no destination", async (t) => {
  const parent = await mkdtemp(path.join("/tmp", "create-jsnode-grouped-schema-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const destination = path.join(parent, "number-topic-service");
  const candidate = groupedSpecification("not-a-number");
  const result = await createJsnodeOperationPackage(request(destination, candidate));
  assert.equal(result.phase, "example-schema", JSON.stringify(result));
  assert.equal(result.code, "EXAMPLE_OUTPUT_SCHEMA_MISMATCH");
  await assert.rejects(access(destination));
});
