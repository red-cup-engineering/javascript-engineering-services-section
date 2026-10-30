#!/usr/bin/env node
import { admitTextFileCreationProjection } from "@red-cup-engineering/text-file-creation-projection-admission-service";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

function requireSpecification(value) {
  if (value?.type !== "JsnodeOperationPackageSpecification" || value.version !== 1) {
    throw new TypeError("input must be an admitted JsnodeOperationPackageSpecification@1");
  }
  return value;
}

/**
 * Collapses a JSDoc-derived description to one line so it never breaks a single Markdown bullet or heading line — a continuation-line description (however TypeScript's JSDoc reader joined it: a clean "\n" join, or one still carrying comment-asterisk indentation) folds down to plain single-spaced text.
 * @param {string} text A documentation, parameter, returns, or throws description.
 * @returns {string} The same text with every run of whitespace, and any leaked "* " continuation marker, collapsed to one space.
 */
function oneLine(text) {
  return text.replace(/\s*\r?\n\s*\*+\s?/gu, " ").replace(/\s+/gu, " ").trim();
}

function renderReadme(specification) {
  const documentation = specification.operation.documentation;
  const lines = [
    `# ${specification.packageName}`,
    "",
    documentation.description,
    "",
    "## Operation",
    "",
    "~~~js",
    documentation.signature,
    "~~~",
  ];
  if (documentation.parameters.length > 0) {
    lines.push("", "### Parameters", "");
    for (const parameter of documentation.parameters) {
      lines.push(`- ${parameter.name}${parameter.type ? ` (${parameter.type})` : ""}: ${oneLine(parameter.description)}`);
    }
  }
  if (documentation.returns) {
    lines.push("", "### Returns", "", `${documentation.returns.type ? `${documentation.returns.type}: ` : ""}${oneLine(documentation.returns.description)}`);
  }
  if (documentation.throws.length > 0) {
    lines.push("", "### Refusals", "");
    for (const refusal of documentation.throws) {
      lines.push(`- ${refusal.type ? `${refusal.type}: ` : ""}${oneLine(refusal.description)}`);
    }
  }
  lines.push(
    "",
    "## Command",
    "",
    `${specification.operation.commandName} reads one JSON value per input line and writes one JSON value per output line.`,
    "",
    "## Examples",
  );
  for (const example of specification.examples) {
    lines.push(
      "",
      `### ${example.name}`,
      "",
      "Input:",
      "",
      "~~~json",
      JSON.stringify(example.input, null, 2),
      "~~~",
      "",
      "Output:",
      "",
      "~~~json",
      JSON.stringify(example.output, null, 2),
      "~~~",
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Projects package help from the operation's standard JSDoc and admitted examples.
 *
 * @summary Projects README help for one admitted JSNode operation package.
 * @param {object} specification An admitted JsnodeOperationPackageSpecification.
 * @returns {object} A README.md TextFileCreationProjection.
 */
export function projectJsnodeOperationPackageReadme(specification) {
  const admitted = requireSpecification(specification);
  const projection = admitTextFileCreationProjection({
    type: "TextFileCreationProjection",
    version: 1,
    path: "README.md",
    text: renderReadme(admitted),
    mode: 0o644,
  });
  if (projection.type !== "TextFileCreationProjection") {
    throw new TypeError(`admitted help produced ${projection.code}: ${projection.message}`);
  }
  return projection;
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "project-jsnode-operation-package-readme", description: "Projects package help from the operation's standard JSDoc and admitted examples.", operation: projectJsnodeOperationPackageReadme }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
