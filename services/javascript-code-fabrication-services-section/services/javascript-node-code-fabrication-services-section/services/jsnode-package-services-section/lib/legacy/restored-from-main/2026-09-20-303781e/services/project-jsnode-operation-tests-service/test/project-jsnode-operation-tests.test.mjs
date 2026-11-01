import assert from "node:assert/strict";
import test from "node:test";
import { projectJsnodeOperationTests } from "../scripts/project-jsnode-operation-tests.mjs";

test("preserves authored tests and projects a real shared-example face test", () => {
  const projections = projectJsnodeOperationTests({
    type: "JsnodeOperationPackageSpecification",
    version: 1,
    operation: { path: "scripts/add-one.mjs", exportName: "addOne", commandName: "add-one" },
    tests: [{ type: "JavascriptNodeOperationTestSource", path: "test/add-one.test.mjs", text: "authored\n" }],
    examples: [{ type: "JavascriptNodeOperationExample", name: "adds one", input: 1, output: 2 }],
  });
  assert.deepEqual(projections.map(({ path }) => path), ["test/add-one-faces.test.mjs", "test/add-one.test.mjs"]);
  assert.equal(projections[1].text, "authored\n");
  assert.match(projections[0].text, /await addOne\(example\.input\)/u);
  assert.match(projections[0].text, /spawnSync\(process\.execPath/u);
  assert.match(projections[0].text, /assert\.deepEqual\(commandOutput, importedOutput\)/u);
  assert.match(projections[0].text, /"name": "adds one"/u);
});
