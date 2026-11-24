#!/usr/bin/env node
import { read561GroupJSNodeModule } from "../src/read-jsnode-workspace.mjs";
import { runJsonStdioOperation } from "../src/run-json-stdio-operation.mjs";
export const readJSNodeModule = read561GroupJSNodeModule;
if (import.meta.main) process.exitCode = await runJsonStdioOperation("read-jsnode-module", readJSNodeModule);
