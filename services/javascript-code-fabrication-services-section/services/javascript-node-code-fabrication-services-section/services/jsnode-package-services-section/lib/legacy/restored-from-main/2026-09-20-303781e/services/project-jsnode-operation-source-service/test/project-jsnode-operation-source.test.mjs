import assert from "node:assert/strict";
import test from "node:test";
import { projectJsnodeOperationSource } from "../scripts/project-jsnode-operation-source.mjs";

test("projects the authored operation bytes as the executable package file", () => {
  const text = "#!/usr/bin/env node\nexport function example() {}\n";
  assert.deepEqual(projectJsnodeOperationSource({
    type: "JsnodeOperationPackageSpecification",
    version: 1,
    operation: { path: "scripts/example.mjs", text },
  }), {
    type: "TextFileCreationProjection",
    version: 1,
    path: "scripts/example.mjs",
    text,
    mode: 0o755,
  });
});

test("requires the admitted upstream carrier", () => {
  assert.throws(() => projectJsnodeOperationSource({ operation: {} }), /admitted JsnodeOperationPackageSpecification/u);
});
