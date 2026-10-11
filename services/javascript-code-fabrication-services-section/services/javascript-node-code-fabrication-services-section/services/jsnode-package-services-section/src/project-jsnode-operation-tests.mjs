import { admitTextFileCreationProjection } from "@red-cup-engineering/computer-file-engineering-services-section/admit-text-file-creation-projection";

function requireSpecification(value) {
  if (value?.type !== "JsnodeOperationPackageSpecification" || value.version !== 2) {
    throw new TypeError("input must be an admitted module-based JsnodeOperationPackageSpecification");
  }
  return value;
}

function file(path, text) {
  const projection = admitTextFileCreationProjection({ type: "TextFileCreationProjection", version: 1, path, text, mode: 0o644 });
  if (projection.type !== "TextFileCreationProjection") throw new TypeError(`admitted test produced ${projection.code}: ${projection.message}`);
  return projection;
}

function contractTestSource(specification) {
  const operations = Object.fromEntries(specification.operations.map((operation, index) => [operation.commandName, { ...operation, binding: `operation${index}` }]));
  const imports = Object.values(operations).map((operation) =>
    `import { ${operation.exportName} as ${operation.binding} } from ${JSON.stringify(`../${operation.path}`)};`);
  const examples = specification.examples.map((example) => ({ ...example, commandName: operations[example.operation].commandName, binding: operations[example.operation].binding }));
  const bindings = Object.values(operations).map((operation) => `${JSON.stringify(operation.binding)}: ${operation.binding}`).join(", ");
  return [
    'import assert from "node:assert/strict";',
    ...(specification.app === null ? [] : ['import { Readable } from "node:stream";', 'import { runJavascriptNodeOperationModule } from "@red-cup-engineering/javascript-node-services-section/operation";', `import { catalog } from ${JSON.stringify(`../${specification.app.path}`)};`]),
    'import test from "node:test";',
    ...imports,
    "",
    `const examples = ${JSON.stringify(examples, null, 2)};`,
    "",
    "for (const example of examples) {",
    "  test(example.name, async () => {",
    "    const importedOutput = await ({" + bindings + "})[example.binding](example.input);",
    "    assert.deepEqual(importedOutput, example.output);",
    ...(specification.app === null ? [] : [
      "    // The catalog is a declaration; the code layer runs it over captured streams.",
      "    let stdout = \"\";",
      "    const result = await runJavascriptNodeOperationModule({ catalog }, {",
      "      arguments: [example.commandName],",
      "      standardInput: Readable.from([JSON.stringify(example.input) + \"\\n\"]),",
      "      standardOutput: { write(text, done) { stdout += text; done?.(); return true; } },",
      "      standardError: { write(text, done) { done?.(); return true; } },",
      "    });",
      "    assert.equal(result.exitCode, 0);",
      "    const commandOutput = JSON.parse(stdout.trim());",
      "    assert.deepEqual(commandOutput, example.output);",
      "    assert.deepEqual(commandOutput, importedOutput);",
    ]),
    "  });",
    "}",
    "",
  ].join("\n");
}

/** Projects authored behavioral tests plus one module/catalog operation contract. */
export function projectJsnodeOperationTests(specification) {
  const admitted = requireSpecification(specification);
  const projections = admitted.tests.map((test) => file(test.path, test.text));
  projections.push(file("test/operation-contracts.test.mjs", contractTestSource(admitted)));
  return Object.freeze(projections.sort((left, right) => left.path.localeCompare(right.path)));
}
