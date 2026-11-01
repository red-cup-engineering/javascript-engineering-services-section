import { admitTextFileCreationProjection } from "@red-cup-engineering/computer-file-engineering-services-section/admit-text-file-creation-projection";

function requireSpecification(value) {
  if (value?.type !== "JsnodeOperationPackageSpecification" || value.version !== 2) {
    throw new TypeError("input must be an admitted module-based JsnodeOperationPackageSpecification");
  }
  return value;
}

function renderReadme(specification) {
  const byOperation = new Map(specification.operations.map((operation) => [operation.commandName, []]));
  for (const example of specification.examples) byOperation.get(example.operation).push(example);
  const lines = [`# ${specification.packageName}`, "", `## ${specification.topic}`, "", "## Operations"];
  for (const operation of specification.operations) {
    lines.push("", `### ${operation.commandName}`, "", operation.documentation.description, "", `Module: \`${operation.path}\``, "", `Export: \`${operation.exportName}\``);
    const examples = byOperation.get(operation.commandName);
    if (examples.length > 0) {
      lines.push("", "#### Examples");
      for (const example of examples) lines.push("", `##### ${example.name}`, "", "Input:", "", "~~~json", JSON.stringify(example.input, null, 2), "~~~", "", "Output:", "", "~~~json", JSON.stringify(example.output, null, 2), "~~~");
    }
  }
  if (specification.app !== null) lines.push("", "## Catalog command", "", `\`${specification.app.path}\` declares the catalog; run it with \`run-javascript-node-operation-module ${specification.app.path} <operation>\`.`);
  return `${lines.join("\n")}\n`;
}

/** Projects README documentation from admitted module bindings and examples. */
export function projectJsnodeOperationPackageReadme(specification) {
  const admitted = requireSpecification(specification);
  const projection = admitTextFileCreationProjection({ type: "TextFileCreationProjection", version: 1, path: "README.md", text: renderReadme(admitted), mode: 0o644 });
  if (projection.type !== "TextFileCreationProjection") throw new TypeError(`admitted help produced ${projection.code}: ${projection.message}`);
  return projection;
}
