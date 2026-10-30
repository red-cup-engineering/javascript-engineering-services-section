#!/usr/bin/env node
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function normalizePnpmLifecycleCommand(command) {
  if (typeof command !== "string") throw new TypeError("command must be a string");
  return command.replaceAll("pnpm run ", "npm run ").replaceAll("pnpm test", "npm test");
}

if (import.meta.main) {
  const command = await readJavascriptNodeStandardInputText({ standardInput: process.stdin });
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: normalizePnpmLifecycleCommand(command) });
}
