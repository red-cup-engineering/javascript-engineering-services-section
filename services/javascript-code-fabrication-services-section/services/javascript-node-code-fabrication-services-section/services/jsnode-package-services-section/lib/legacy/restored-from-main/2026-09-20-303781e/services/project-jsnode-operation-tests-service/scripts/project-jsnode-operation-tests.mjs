#!/usr/bin/env node
import { admitTextFileCreationProjection } from "@red-cup-engineering/text-file-creation-projection-admission-service";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

function requireSpecification(value) {
  if (value?.type !== "JsnodeOperationPackageSpecification" || value.version !== 1) {
    throw new TypeError("input must be an admitted JsnodeOperationPackageSpecification@1");
  }
  return value;
}

function file(path, text) {
  const projection = admitTextFileCreationProjection({
    type: "TextFileCreationProjection",
    version: 1,
    path,
    text,
    mode: 0o644,
  });
  if (projection.type !== "TextFileCreationProjection") {
    throw new TypeError(`admitted test produced ${projection.code}: ${projection.message}`);
  }
  return projection;
}

function faceTestSource(specification) {
  const operation = specification.operation;
  return [
    'import assert from "node:assert/strict";',
    'import { spawnSync } from "node:child_process";',
    'import { fileURLToPath } from "node:url";',
    'import test from "node:test";',
    `import { ${operation.exportName} } from ${JSON.stringify(`../${operation.path}`)};`,
    "",
    `const examples = ${JSON.stringify(specification.examples, null, 2)};`,
    "",
    "for (const example of examples) {",
    "  test(example.name, async () => {",
    `    const importedOutput = await ${operation.exportName}(example.input);`,
    "    assert.deepEqual(importedOutput, example.output);",
    `    const command = spawnSync(process.execPath, [fileURLToPath(new URL(${JSON.stringify(`../${operation.path}`)}, import.meta.url))], {`,
    '      input: JSON.stringify(example.input) + "\\n",',
    '      encoding: "utf8",',
    "    });",
    "    assert.equal(command.status, 0, command.stderr);",
    "    const commandOutput = JSON.parse(command.stdout.trim());",
    "    assert.deepEqual(commandOutput, example.output);",
    "    assert.deepEqual(commandOutput, importedOutput);",
    "  });",
    "}",
    "",
  ].join("\n");
}

/**
 * Projects authored behavioral tests and a shared-example import/command equivalence test.
 *
 * @summary Projects behavioral and face-equivalence tests for one JSNode operation.
 * @param {object} specification An admitted JsnodeOperationPackageSpecification.
 * @returns {readonly object[]} Ordered immutable TextFileCreationProjection records.
 */
export function projectJsnodeOperationTests(specification) {
  const admitted = requireSpecification(specification);
  const projections = admitted.tests.map((test) => file(test.path, test.text));
  projections.push(file(`test/${admitted.operation.commandName}-faces.test.mjs`, faceTestSource(admitted)));
  return Object.freeze(projections.sort((left, right) => left.path.localeCompare(right.path)));
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "project-jsnode-operation-tests", description: "Projects authored behavioral tests and a shared-example import/command equivalence test.", operation: projectJsnodeOperationTests }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
