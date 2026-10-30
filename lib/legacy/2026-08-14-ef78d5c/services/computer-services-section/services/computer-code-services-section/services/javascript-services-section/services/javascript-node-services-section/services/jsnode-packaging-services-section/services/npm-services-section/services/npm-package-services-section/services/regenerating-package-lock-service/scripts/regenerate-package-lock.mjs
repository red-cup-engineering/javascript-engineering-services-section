#!/usr/bin/env node
import { executeJavascriptNodeCommand } from "@red-cup-engineering/execute-javascript-node-command-service";
import { canonical } from "@red-cup-engineering/json-codec-service";
import { formNpmPackageLockRegenerationCommand } from "@red-cup-engineering/npm-package-lock-regeneration-command-formation-service";
import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function regeneratePackageLock({ directory, apply = false, offline = false, npmExecutable = "npm" } = {}) {
  if (typeof apply !== "boolean") throw new TypeError("apply must be a boolean");
  const command = formNpmPackageLockRegenerationCommand({ directory, npmExecutable, offline });
  if (!apply) return Object.freeze({ type: "NpmPackageLockRegeneration", applied: false, command });
  const execution = executeJavascriptNodeCommand(command);
  if (execution.status !== 0) throw new Error(`npm package-lock regeneration failed: ${execution.error || execution.stderr || execution.stdout}`);
  return Object.freeze({ type: "NpmPackageLockRegeneration", applied: true, command, execution });
}

if (import.meta.main) {
  const parsed = parseJavascriptArgv({
    argumentVector: process.argv,
    options: {
      directory: { type: "string" },
      "npm-executable": { type: "string", default: "npm" },
      offline: { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
    },
  });
  if (typeof parsed.options.directory !== "string") throw new TypeError("--directory is required");
  const result = regeneratePackageLock({
    directory: parsed.options.directory,
    npmExecutable: parsed.options["npm-executable"],
    offline: parsed.options.offline,
    apply: parsed.options.apply,
  });
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(result)}\n` });
}
