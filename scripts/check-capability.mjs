#!/usr/bin/env node
import { check561GroupJSNodeCapability } from "../src/search-jsnode-capability.mjs";
import { runJsonStdioOperation } from "../src/run-json-stdio-operation.mjs";
export const checkCapability = check561GroupJSNodeCapability;
if (import.meta.main) process.exitCode = await runJsonStdioOperation("check-capability", checkCapability);
