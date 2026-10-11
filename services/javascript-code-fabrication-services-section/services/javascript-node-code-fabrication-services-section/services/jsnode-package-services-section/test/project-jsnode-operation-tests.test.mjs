import assert from "node:assert/strict";
import test from "node:test";
import { projectJsnodeOperationTests } from "../src/project-jsnode-operation-tests.mjs";

const specification = {
  type: "JsnodeOperationPackageSpecification", version: 2, app: null,
  operations: [{ path: "src/math.mjs", exportName: "addOne", commandName: "add-one", documentation: { description: "Adds one." } }],
  tests: [{ type: "JavascriptNodeOperationTestSource", path: "test/math.test.mjs", text: "authored\n" }],
  examples: [{ type: "JsnodeOperationPackageExample", name: "adds one", operation: "add-one", input: 1, output: 2 }],
};

test("preserves authored tests and projects one module contract test", () => {
  const projections = projectJsnodeOperationTests(specification);
  assert.deepEqual(projections.map(({ path }) => path), ["test/math.test.mjs", "test/operation-contracts.test.mjs"]);
  assert.equal(projections[0].text, "authored\n");
  assert.match(projections[1].text, /import \{ addOne as operation0 \} from "\.\.\/src\/math\.mjs"/u);
  assert.match(projections[1].text, /await \(\{.*operation0/u);
  assert.doesNotMatch(projections[1].text, /runJavascriptNodeOperationModule/u);
});

test("adds catalog invocation only when the specification has an app", () => {
  const projections = projectJsnodeOperationTests({ ...specification, app: { path: "apps/math-cli.mjs", commandName: "math" } });
  assert.match(projections[1].text, /runJavascriptNodeOperationModule/u);
  assert.match(projections[1].text, /example\.commandName/u);
});


test("uses a distinct deterministic binding for each operation, including shared exports", () => {
  const projections = projectJsnodeOperationTests({ ...specification, operations: [
    ...specification.operations,
    { path: "src/math.mjs", exportName: "addOne", commandName: "increment", documentation: { description: "Adds one again." } },
  ], examples: [
    ...specification.examples,
    { type: "JsnodeOperationPackageExample", name: "increments one", operation: "increment", input: 1, output: 2 },
  ] });
  assert.match(projections[1].text, /import \{ addOne as operation0 \}/u);
  assert.match(projections[1].text, /import \{ addOne as operation1 \}/u);
  assert.match(projections[1].text, /"binding": "operation1"/u);
});
