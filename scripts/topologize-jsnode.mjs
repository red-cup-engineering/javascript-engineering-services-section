#!/usr/bin/env node
import { topologize561GroupJSNode } from "../src/read-jsnode-workspace.mjs";
import { runJsonStdioOperation } from "../src/run-json-stdio-operation.mjs";
export const topologizeJSNode = topologize561GroupJSNode;
if (import.meta.main) process.exitCode = await runJsonStdioOperation("topologize-jsnode", topologizeJSNode);
