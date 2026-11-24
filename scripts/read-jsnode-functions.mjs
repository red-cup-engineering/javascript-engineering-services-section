#!/usr/bin/env node
import { read561GroupJSNodeFunctions } from "../src/read-jsnode-workspace.mjs";
import { runJsonStdioOperation } from "../src/run-json-stdio-operation.mjs";
export const readJSNodeFunctions = read561GroupJSNodeFunctions;
if (import.meta.main) process.exitCode = await runJsonStdioOperation("read-jsnode-functions", readJSNodeFunctions);
