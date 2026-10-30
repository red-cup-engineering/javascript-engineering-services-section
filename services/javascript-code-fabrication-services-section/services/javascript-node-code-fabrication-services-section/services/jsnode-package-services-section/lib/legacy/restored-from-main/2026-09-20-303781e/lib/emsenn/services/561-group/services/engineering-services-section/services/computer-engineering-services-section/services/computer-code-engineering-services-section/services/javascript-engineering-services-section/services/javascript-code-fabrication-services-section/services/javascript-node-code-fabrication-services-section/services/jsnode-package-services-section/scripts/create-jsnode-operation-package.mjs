#!/usr/bin/env node
import { createJsnodeOperationPackage as applyOperation } from "../src/create-jsnode-operation-package.mjs";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";
import operationInputSchema from "../data/records/schema/create-jsnode-operation-package.input.schema.json" with { type: "json" };
import operationOutputSchema from "../data/records/schema/create-jsnode-operation-package.output.schema.json" with { type: "json" };
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

/**
 * Creates and assays one JSNode topic package in a development destination.
 * @param {object} request The operation input record.
 * @returns {Promise<object>} The operation result or refusal.
 */
export async function createJsnodeOperationPackage(request) {
  return applyOperation(request);
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "create-jsnode-operation-package", description: "Creates and assays one JSNode topic package in a development destination.", operation: createJsnodeOperationPackage, inputSchema: operationInputSchema, outputSchema: operationOutputSchema }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
