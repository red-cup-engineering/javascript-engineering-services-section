#!/usr/bin/env node
import { search561GroupJSNodeCapability } from "../src/search-jsnode-capability.mjs";
import { runJsonStdioOperation } from "../src/run-json-stdio-operation.mjs";
export const findCapability = search561GroupJSNodeCapability;
if (import.meta.main) process.exitCode = await runJsonStdioOperation("find-capability", findCapability);
