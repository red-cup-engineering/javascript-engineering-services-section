#!/usr/bin/env node
import { checkJsnodePackageDestinationFragmentation as applyOperation } from "../src/check-jsnode-package-destination-fragmentation.mjs";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";
import operationInputSchema from "../data/records/schema/check-jsnode-package-destination-fragmentation.input.schema.json" with { type: "json" };
import operationOutputSchema from "../data/records/schema/check-jsnode-package-destination-fragmentation.output.schema.json" with { type: "json" };
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

/**
 * Checks one proposed package destination's parent directory for the sibling single-function-package fragmentation shape.
 * @param {string} parentDirectory An absolute, existing directory path.
 * @returns {Promise<{fragmenting: boolean, siblingPackages: string[]}>} The operation result.
 */
export async function checkJsnodePackageDestinationFragmentation(parentDirectory) {
  return applyOperation(parentDirectory);
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "check-jsnode-package-destination-fragmentation", description: "Checks one proposed package destination's parent directory for the sibling single-function-package fragmentation shape.", operation: checkJsnodePackageDestinationFragmentation, inputSchema: operationInputSchema, outputSchema: operationOutputSchema }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
