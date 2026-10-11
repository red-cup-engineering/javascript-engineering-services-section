import assert from "node:assert/strict";
import test from "node:test";
import { projectJsnodeOperationPackageReadme } from "../src/project-jsnode-operation-package-readme.mjs";

const specification = {
  type: "JsnodeOperationPackageSpecification", version: 2,
  packageName: "@red-cup-engineering/math-service", topic: "math", app: null,
  operations: [{ path: "src/math.mjs", exportName: "addOne", commandName: "add-one", documentation: { description: "Adds one." } }],
  examples: [{ type: "JsnodeOperationPackageExample", name: "one becomes two", operation: "add-one", input: 1, output: 2 }],
};

test("projects module and example documentation without inventing a command protocol", () => {
  const projection = projectJsnodeOperationPackageReadme(specification);
  assert.equal(projection.path, "README.md");
  assert.match(projection.text, /Adds one\./u);
  assert.match(projection.text, /Module: `src\/math\.mjs`/u);
  assert.match(projection.text, /one becomes two/u);
  assert.doesNotMatch(projection.text, /Catalog command/u);
});

test("documents the catalog command only when admitted", () => {
  const projection = projectJsnodeOperationPackageReadme({ ...specification, app: { commandName: "math", path: "apps/math-cli.mjs" } });
  assert.match(projection.text, /run-javascript-node-operation-module apps\/math-cli\.mjs <operation>/u);
});
