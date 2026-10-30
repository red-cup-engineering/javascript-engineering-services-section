#!/usr/bin/env node
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";
import { admitTextFileCreationProjection } from "@red-cup-engineering/text-file-creation-projection-admission-service";

function requireSpecification(value) {
  if (value?.type !== "JsnodeOperationPackageSpecification" || value.version !== 1) {
    throw new TypeError("input must be an admitted JsnodeOperationPackageSpecification@1");
  }
  return value;
}

/**
 * Projects an admitted JSNode operation source into its executable future text file.
 *
 * @summary Projects an admitted JSNode operation into an executable source file.
 * @param {object} specification An admitted JsnodeOperationPackageSpecification.
 * @returns {object} One immutable executable TextFileCreationProjection.
 */
export function projectJsnodeOperationSource(specification) {
  const admitted = requireSpecification(specification);
  const projection = admitTextFileCreationProjection({
    type: "TextFileCreationProjection",
    version: 1,
    path: admitted.operation.path,
    text: admitted.operation.text,
    mode: 0o755,
  });
  if (projection.type !== "TextFileCreationProjection") {
    throw new TypeError(`admitted operation produced ${projection.code}: ${projection.message}`);
  }
  return projection;
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({
    name: "project-jsnode-operation-source",
    description: "Projects an admitted JSNode operation source into its executable source file.",
    operation: projectJsnodeOperationSource,
  }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
