#!/usr/bin/env node
import { translateMarkdownJsnodeOperationPackageSpecification as applyOperation } from "../src/translate-markdown-jsnode-operation-package-specification.mjs";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";
import operationInputSchema from "../data/records/schema/translate-markdown-jsnode-operation-package-specification.input.schema.json" with { type: "json" };
import operationOutputSchema from "../data/records/schema/translate-markdown-jsnode-operation-package-specification.output.schema.json" with { type: "json" };
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

/**
 * Translates one Markdown work order into a JSNode topic package specification.
 * @param {object} request The operation input record.
 * @returns {object} The operation result or refusal.
 */
export function translateMarkdownJsnodeOperationPackageSpecification(request) {
  return applyOperation(request);
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "translate-markdown-jsnode-operation-package-specification", description: "Translates one Markdown work order into a JSNode topic package specification.", operation: translateMarkdownJsnodeOperationPackageSpecification, inputSchema: operationInputSchema, outputSchema: operationOutputSchema }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
