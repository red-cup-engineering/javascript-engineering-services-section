#!/usr/bin/env node
import { projectJsnodeOperationPackage as applyOperation } from "../src/project-jsnode-operation-package.mjs";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";
import operationInputSchema from "../data/records/schema/project-jsnode-operation-package.input.schema.json" with { type: "json" };
import operationOutputSchema from "../data/records/schema/project-jsnode-operation-package.output.schema.json" with { type: "json" };
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

/**
 * Projects one admitted JSNode topic package.
 * @param {object} request The operation input record.
 * @returns {object} The operation result or refusal.
 */
export function projectJsnodeOperationPackage(request) {
  return applyOperation(request);
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "project-jsnode-operation-package", description: "Projects one admitted JSNode topic package.", operation: projectJsnodeOperationPackage, inputSchema: operationInputSchema, outputSchema: operationOutputSchema }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
