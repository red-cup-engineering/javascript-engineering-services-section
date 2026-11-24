#!/usr/bin/env node
import { read561GroupJSNodePackage } from "../src/read-jsnode-workspace.mjs";
import { runJsonStdioOperation } from "../src/run-json-stdio-operation.mjs";
export const readJSNodePackage = read561GroupJSNodePackage;
if (import.meta.main) process.exitCode = await runJsonStdioOperation("read-jsnode-package", readJSNodePackage);
