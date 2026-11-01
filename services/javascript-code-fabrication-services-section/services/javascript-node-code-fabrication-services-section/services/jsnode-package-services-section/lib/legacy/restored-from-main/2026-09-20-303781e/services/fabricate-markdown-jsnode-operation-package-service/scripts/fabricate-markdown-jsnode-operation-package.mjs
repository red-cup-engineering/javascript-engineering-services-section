#!/usr/bin/env node
import { fabricateMarkdownJsnodeOperationPackage as applyOperation } from "../src/markdown-jsnode-package.mjs";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";
import operationInputSchema from "../data/records/schema/fabricate-markdown-jsnode-operation-package.input.schema.json" with { type: "json" };
import operationOutputSchema from "../data/records/schema/fabricate-markdown-jsnode-operation-package.output.schema.json" with { type: "json" };
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

/**
 * Fabricates a development JSNode topic package; publication requires publish:true.
 * @param {object} request A Markdown package fabrication request.
 * @returns {Promise<object>} A fabrication receipt or refusal.
 */
export async function fabricateMarkdownJsnodeOperationPackage(request) {
  return applyOperation(request);
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "fabricate-markdown-jsnode-operation-package", description: "Fabricates a development JSNode topic package; publication requires publish:true.", operation: fabricateMarkdownJsnodeOperationPackage, inputSchema: operationInputSchema, outputSchema: operationOutputSchema }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
