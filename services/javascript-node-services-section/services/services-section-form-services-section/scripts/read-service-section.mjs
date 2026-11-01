#!/usr/bin/env node
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";
import { readServiceSection, SERVICE_SECTION_KIND } from "../src/service-section.mjs";

export { readServiceSection };

export const operationDefinition = Object.freeze({
  name: "readServiceSection",
  description: "Read one source-qualified Service Section through SignCraft's inherited token sheaf, retaining its offers, Hoare obligations, Huidu calibrations and opposing evidence.",
  inputSchema: {
    type: "object", required: ["kind", "subject", "source", "cells"], additionalProperties: false,
    properties: {
      kind: { const: SERVICE_SECTION_KIND }, subject: {},
      source: { type: "object", required: ["resource", "revision"], additionalProperties: false,
        properties: { resource: { type: "string", minLength: 1 }, revision: { type: "string", minLength: 1 } } },
      cells: { type: "array", items: { type: "object" } },
    },
  },
  outputSchema: {
    type: "object", required: ["kind", "document", "snapshot", "sourceCells", "sourceSection", "section", "hull", "kernels", "governance", "missing", "contests"],
    properties: { kind: { const: "org.561.service-section-reading.v1" } },
  },
});

if (import.meta.main) {
  process.exitCode = (await runJavascriptNodeOperation(
    { ...operationDefinition, operation: readServiceSection },
    { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout },
  )).exitCode;
}
