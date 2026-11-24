#!/usr/bin/env node
import { read561GroupJSNodeWorkspaceGraph } from "../src/read-jsnode-workspace.mjs";
import { runJsonStdioOperation } from "../src/run-json-stdio-operation.mjs";
export const graphWorkspace = read561GroupJSNodeWorkspaceGraph;
if (import.meta.main) process.exitCode = await runJsonStdioOperation("graph-workspace", graphWorkspace);
