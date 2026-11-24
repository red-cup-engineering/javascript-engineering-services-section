#!/usr/bin/env node
import { planWorkspacePackageDescription } from "../src/plan-jsnode-description.mjs";
import { runJsonStdioOperation } from "../src/run-json-stdio-operation.mjs";
export { planWorkspacePackageDescription };
if (import.meta.main) process.exitCode = await runJsonStdioOperation("plan-jsnode-description", planWorkspacePackageDescription);
