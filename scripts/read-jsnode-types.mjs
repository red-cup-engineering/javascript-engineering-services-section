#!/usr/bin/env node
import { read561GroupJSNodeTypes } from "../src/read-jsnode-workspace.mjs";
import { runJsonStdioOperation } from "../src/run-json-stdio-operation.mjs";
export const readJSNodeTypes = read561GroupJSNodeTypes;
if (import.meta.main) process.exitCode = await runJsonStdioOperation("read-jsnode-types", readJSNodeTypes);
