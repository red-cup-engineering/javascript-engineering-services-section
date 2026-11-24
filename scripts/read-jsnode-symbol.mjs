#!/usr/bin/env node
import { read561GroupJSNodeSymbol } from "../src/read-jsnode-workspace.mjs";
import { runJsonStdioOperation } from "../src/run-json-stdio-operation.mjs";
export const readJSNodeSymbol = read561GroupJSNodeSymbol;
if (import.meta.main) process.exitCode = await runJsonStdioOperation("read-jsnode-symbol", readJSNodeSymbol);
