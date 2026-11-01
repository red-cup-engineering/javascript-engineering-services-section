import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { serializeLines } from "../../../../../../../../../../../../computer-data-engineering-services-section/services/serialized-computer-data-engineering-services-section/services/json-services-section/src/index.mjs";
import { projectJsnodeOperationPackage } from "@red-cup-engineering/jsnode-package-services-section/project-jsnode-operation-package";
import { admitJsnodeOperationPackageProjection } from "../scripts/admit-jsnode-operation-package-projection.mjs";

const operationText = `#!/usr/bin/env node
/**
 * Adds one to a number.
 * @param {number} value The starting number.
 * @returns {number} The resulting number.
 */
export function addOne(value) { return value + 1; }

if (import.meta.main) {
  process.stdin.setEncoding("utf8");
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  for (const line of text.split("\\n")) if (line.trim()) process.stdout.write(JSON.stringify(addOne(JSON.parse(line))) + "\\n");
}
`;

const specification = {
  type: "JsnodeOperationPackageSpecification",
  version: 1,
  packageName: "@red-cup-engineering/add-one-service",
  packageVersion: "0.1.0",
  license: "MIT",
  operation: {
    path: "scripts/add-one.mjs",
    text: operationText,
    exportName: "addOne",
    commandName: "add-one",
    documentation: {
      signature: "export function addOne(value)",
      description: "Adds one to a number.",
      parameters: [{ name: "value", type: "number", description: "The starting number." }],
      returns: { type: "number", description: "The resulting number." },
      throws: [],
    },
  },
  tests: [{
    type: "JavascriptNodeOperationTestSource",
    path: "test/add-one.test.mjs",
    text: 'import assert from "node:assert/strict";\nimport test from "node:test";\nimport { addOne } from "../scripts/add-one.mjs";\ntest("adds", () => assert.equal(addOne(1), 2));\n',
  }],
  examples: [{ type: "JavascriptNodeOperationExample", name: "adds one", input: 1, output: 2 }],
  dependencies: {},
  devDependencies: {},
};

function changed(projection, changedPath, change) {
  const files = projection.files.map((file) => file.path === changedPath ? { ...file, text: change(file.text) } : file);
  return {
    ...projection,
    files,
    filesDigest: `sha256:${createHash("sha256").update(serializeLines(files)).digest("hex")}`,
  };
}

test("admits a complete deterministic package projection", () => {
  const projection = projectJsnodeOperationPackage(specification);
  const admitted = admitJsnodeOperationPackageProjection(projection);
  assert.equal(admitted.type, "JsnodeOperationPackageProjection");
  assert.equal(admitted.filesDigest, projection.filesDigest);
  assert.ok(Object.isFrozen(admitted));
});

test("refuses a projected verify script", () => {
  const projection = changed(projectJsnodeOperationPackage(specification), "package.json", (text) => {
    const manifest = JSON.parse(text);
    manifest.scripts.verify = "npm run check && npm test && npm run pack:dry-run";
    return `${JSON.stringify(manifest, null, 2)}\n`;
  });
  assert.equal(admitJsnodeOperationPackageProjection(projection).code, "VERIFICATION_SCRIPT_LAYER");
});

test("refuses split import and command files even when the digest is truthful", () => {
  const projection = changed(projectJsnodeOperationPackage(specification), "package.json", (text) => {
    const manifest = JSON.parse(text);
    manifest.bin["add-one"] = "./scripts/elsewhere.mjs";
    return `${JSON.stringify(manifest, null, 2)}\n`;
  });
  assert.equal(admitJsnodeOperationPackageProjection(projection).code, "SPLIT_OPERATION_FACES");
});

test("refuses source without a real main guard", () => {
  const projection = changed(projectJsnodeOperationPackage(specification), "scripts/add-one.mjs", (text) => text.replace("if (import.meta.main)", "if (false)"));
  assert.equal(admitJsnodeOperationPackageProjection(projection).code, "MAIN_GUARD_COUNT");
});

test("refuses undeclared runtime package imports", () => {
  const projection = changed(projectJsnodeOperationPackage(specification), "scripts/add-one.mjs", (text) => text.replace(
    "/**",
    'import value from "undeclared-package";\n/**',
  ));
  assert.equal(admitJsnodeOperationPackageProjection(projection).code, "UNDECLARED_RUNTIME_DEPENDENCY");
});

test("returns a refusal instead of throwing for syntactically invalid projected source", () => {
  const projection = changed(projectJsnodeOperationPackage(specification), "scripts/add-one.mjs", (text) => `${text}\nexport function {\n`);
  assert.equal(admitJsnodeOperationPackageProjection(projection).code, "INVALID_OPERATION_JAVASCRIPT");
});

test("refuses authored tests that reach outside the projected package", () => {
  const projection = changed(projectJsnodeOperationPackage(specification), "test/add-one.test.mjs", (text) => text.replace(
    'from "../scripts/add-one.mjs"',
    'from "../../outside.mjs"',
  ));
  assert.equal(admitJsnodeOperationPackageProjection(projection).code, "UNPROJECTED_TEST_IMPORT");
});
