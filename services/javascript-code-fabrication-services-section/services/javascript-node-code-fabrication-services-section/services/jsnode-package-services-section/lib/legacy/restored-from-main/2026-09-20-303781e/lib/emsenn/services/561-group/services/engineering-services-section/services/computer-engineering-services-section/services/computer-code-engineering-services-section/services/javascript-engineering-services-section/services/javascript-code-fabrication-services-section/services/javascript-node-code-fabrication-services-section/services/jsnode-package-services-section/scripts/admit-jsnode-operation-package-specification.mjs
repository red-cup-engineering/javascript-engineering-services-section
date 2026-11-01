#!/usr/bin/env node
import { admitJsnodeOperationPackageSpecification as applyOperation } from "../src/admit-jsnode-operation-package-specification.mjs";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";
import operationInputSchema from "../data/records/schema/admit-jsnode-operation-package-specification.input.schema.json" with { type: "json" };
import operationOutputSchema from "../data/records/schema/admit-jsnode-operation-package-specification.output.schema.json" with { type: "json" };
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

/**
 * Admits one JSNode topic package specification.
 * @param {object} request The operation input record.
 * @returns {object} The operation result or refusal.
 */
export function admitJsnodeOperationPackageSpecification(request) {
  return applyOperation(request);
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "admit-jsnode-operation-package-specification", description: "Admits one JSNode topic package specification.", operation: admitJsnodeOperationPackageSpecification, inputSchema: operationInputSchema, outputSchema: operationOutputSchema }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
