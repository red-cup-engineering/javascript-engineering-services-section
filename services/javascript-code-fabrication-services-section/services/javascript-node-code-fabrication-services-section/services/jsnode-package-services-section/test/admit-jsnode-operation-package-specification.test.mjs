import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { admitJsnodeOperationPackageSpecification } from "../src/admit-jsnode-operation-package-specification.mjs";

const operationText = `#!/usr/bin/env node
/**
 * Greets one named person.
 * @param {object} request A record containing the person's name.
 * @returns {object} A Greeting record.
 * @throws {TypeError} When the name is absent.
 */
export function greetPerson(request) {
  if (typeof request?.name !== "string") throw new TypeError("name is required");
  return { type: "Greeting", text: \`Hello, \${request.name}!\` };
}

if (import.meta.main) {}
`;

const testText = `import assert from "node:assert/strict";
import test from "node:test";
import { greetPerson } from "../scripts/greet-person.mjs";
test("greets the named person", () => assert.equal(greetPerson({ name: "Ada" }).text, "Hello, Ada!"));
`;

function candidate() {
  return {
    type: "JsnodeOperationPackageSpecificationCandidate",
    version: 1,
    packageName: "@red-cup-engineering/greet-person-service",
    packageVersion: "0.1.0",
    license: "MIT",
    operation: { type: "JavascriptNodeOperationSource", path: "scripts/greet-person.mjs", text: operationText },
    tests: [{ type: "JavascriptNodeOperationTestSource", path: "test/greet-person.test.mjs", text: testText }],
    examples: [{
      type: "JavascriptNodeOperationExample",
      name: "greets Ada",
      input: { name: "Ada" },
      output: { type: "Greeting", text: "Hello, Ada!" },
    }],
    dependencies: {},
    devDependencies: {},
  };
}

test("admits a complete package specification and derives operation identity and documentation", () => {
  const admitted = admitJsnodeOperationPackageSpecification(candidate());
  assert.equal(admitted.type, "JsnodeOperationPackageSpecification");
  assert.equal(admitted.operations[0].exportName, "greetPerson");
  assert.equal(admitted.operations[0].commandName, "greet-person");
  assert.equal(admitted.operations[0].documentation.description, "Greets one named person.");
  assert.deepEqual(admitted.operations[0].documentation.returns, { type: "object", description: "A Greeting record." });
  assert.deepEqual(admitted.examples[0].input, { name: "Ada" });
  assert.ok(Object.isFrozen(admitted));
  assert.ok(Object.isFrozen(admitted.operations[0]));
});

test("admits a grouped v2 topic from projected operation arguments without package-operation identity coupling", () => {
  const argumentsRecord = {
    type: "JsnodeOperationArguments", version: 1, path: "scripts/greet-person.mjs", exportName: "greetPerson", exportCount: 1,
    description: "Greets one named person.", params: [{ name: "request", type: "object", description: "The greeting request." }],
    returns: { type: "object", description: "A Greeting record." }, throws: [], imports: [], isAsync: false,
    inputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", title: "GreetingInput", type: "object", description: "The greeting request." },
    outputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", title: "GreetingOutput", type: "object", description: "A Greeting record." },
    bodyText: 'export function greetPerson(request) { return { type: "Greeting", text: request.name }; }', residue: [], residueStatements: [],
  };
  const grouped = {
    type: "JsnodeOperationPackageSpecificationCandidate", version: 2, packageName: "@red-cup-engineering/greeting-topic-service", packageVersion: "0.1.0", license: "MIT", topic: "greeting-topic",
    sources: [{ type: "JavascriptNodePackageSource", path: "src/greeting.mjs", text: "export const greeting = 'hello';\n" }], operations: [argumentsRecord], tests: [{ type: "JavascriptNodeOperationTestSource", path: "test/greeting-topic.test.mjs", text: "import test from 'node:test'; test('placeholder', () => {});" }],
    examples: [{ type: "JsnodeOperationPackageExample", name: "greets Ada", operation: "scripts/greet-person.mjs", input: { name: "Ada" }, output: { type: "Greeting", text: "Ada" } }], dependencies: {}, devDependencies: {},
  };
  const admitted = admitJsnodeOperationPackageSpecification(grouped);
  assert.equal(admitted.version, 2);
  assert.equal(admitted.app.path, "apps/greeting-topic-cli.mjs");
  assert.ok(admitted.sources.some((source) => source.path === "src/greeting.mjs"));
  assert.equal(admitted.operations[0].path, "src/greet-person.mjs");
  assert.equal(admitted.examples[0].operation, "greet-person");
  assert.ok(admitted.sources.some((source) => source.path === "src/greet-person.mjs"));
});

test("returns specific refusal records for incomplete or contradictory candidates", () => {
  const noTests = candidate();
  noTests.tests = [];
  assert.equal(admitJsnodeOperationPackageSpecification(noTests).code, "MISSING_TESTS");

  const wrongIdentity = candidate();
  wrongIdentity.packageName = "@red-cup-engineering/something-else-service";
  assert.equal(admitJsnodeOperationPackageSpecification(wrongIdentity).type, "JsnodeOperationPackageSpecification");

  const floatingDependency = candidate();
  floatingDependency.dependencies.example = "^1.0.0";
  assert.equal(admitJsnodeOperationPackageSpecification(floatingDependency).code, "INVALID_EXACT_VERSION");

  const noExamples = candidate();
  noExamples.examples = [];
  assert.equal(admitJsnodeOperationPackageSpecification(noExamples).code, "MISSING_EXAMPLES");
});

test("legacy source and authored tests normalize to shared module paths", () => {
  const admitted = admitJsnodeOperationPackageSpecification(candidate());
  assert.equal(admitted.version, 2);
  assert.match(admitted.tests[0].text, /\.\.\/src\/greet-person\.mjs/u);
  assert.doesNotMatch(admitted.sources[0].text, /import\.meta\.main/u);
  assert.equal(admitted.operations[0].arguments.inputSchema, null);
});

const functionText = operationText.replace("#!/usr/bin/env node\n", "").replace("\nif (import.meta.main) {}\n", "");
const withSource = (text) => { const input = candidate(); input.operation.text = text; return input; };

test("legacy migration accepts one declaration (operation, catalog or command) in place of the main guard", () => {
  for (const declaration of [
    'export const operation = Object.freeze({ name: "greet-person", description: "Greets.", operation: greetPerson });',
    'export const catalog = Object.freeze({ name: "greet", description: "Greets.", operations: {} });',
    'export const command = Object.freeze({ run() {} });',
  ]) {
    const admitted = admitJsnodeOperationPackageSpecification(withSource(`${functionText}\n${declaration}\n`));
    assert.equal(admitted.version, 2, JSON.stringify(admitted));
    assert.doesNotMatch(admitted.sources[0].text, /export const (operation|catalog|command)|import\.meta\.main|^#!/mu);
    assert.match(admitted.sources[0].text, /export function greetPerson/u);
  }
});

test("legacy migration drops the runtime import the old guard called", () => {
  const text = `#!/usr/bin/env node\nimport { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";\n${functionText}\nif (import.meta.main) {\n  const result = await runJavascriptNodeOperation({ name: "greet-person", description: "Greets.", operation: greetPerson }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });\n  process.exitCode = result.exitCode;\n}\n`;
  const admitted = admitJsnodeOperationPackageSpecification(withSource(text));
  assert.equal(admitted.version, 2, JSON.stringify(admitted));
  assert.doesNotMatch(admitted.sources[0].text, /runJavascriptNodeOperation|import\.meta\.main/u);
});

test("legacy migration refuses a source with no runnable face or with more than one", () => {
  const declaration = 'export const operation = Object.freeze({ name: "greet-person", description: "Greets.", operation: greetPerson });';
  assert.equal(admitJsnodeOperationPackageSpecification(withSource(functionText)).code, "RUNNABLE_FACE_COUNT");
  assert.equal(admitJsnodeOperationPackageSpecification(withSource(`${functionText}\n${declaration}\nexport const catalog = Object.freeze({ name: "c", description: "d", operations: {} });\n`)).code, "RUNNABLE_FACE_COUNT");
  assert.equal(admitJsnodeOperationPackageSpecification(withSource(`#!/usr/bin/env node\n${functionText}\n${declaration}\nif (import.meta.main) {}\n`)).code, "RUNNABLE_FACE_COUNT");
  assert.equal(admitJsnodeOperationPackageSpecification(withSource(`${functionText}\nif (import.meta.main) {}\n`)).code, "MISSING_NODE_SHEBANG");
});
