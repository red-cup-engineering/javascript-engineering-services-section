import { executeJavascriptNodeCommand } from "@red-cup-engineering/execute-javascript-node-command-service";
import { projectJavascriptNodeCommandExecutionReceipt } from "@red-cup-engineering/project-javascript-node-command-execution-receipt-service";

export const registry = Object.freeze({
  models: Object.freeze({}),
  behaviors: Object.freeze({ executeJavascriptNodeCommand, projectJavascriptNodeCommandExecutionReceipt }),
  qualities: Object.freeze({}),
});
