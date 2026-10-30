#!/usr/bin/env node
import { immutableJsonValue } from "@red-cup-engineering/immutable-json-value-service";
import { canonical } from "@red-cup-engineering/json-codec-service";
import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export function formNpmPackageLockRegenerationCommand({ directory, npmExecutable = "npm", offline = false } = {}) {
  if (typeof directory !== "string" || directory.length === 0) throw new TypeError("directory must be a nonempty string");
  if (typeof npmExecutable !== "string" || npmExecutable.length === 0) throw new TypeError("npmExecutable must be a nonempty string");
  if (typeof offline !== "boolean") throw new TypeError("offline must be a boolean");
  const commandArguments = ["install", "--package-lock-only", "--ignore-scripts"];
  if (offline) commandArguments.push("--offline");
  return immutableJsonValue({
    type: "NpmPackageLockRegenerationCommand",
    command: npmExecutable,
    arguments: commandArguments,
    directory: resolveFilepath([directory]),
  });
}

if (import.meta.main) {
  const parsed = parseJavascriptArgv({
    argumentVector: process.argv,
    options: {
      directory: { type: "string" },
      "npm-executable": { type: "string", default: "npm" },
      offline: { type: "boolean", default: false },
    },
  });
  if (typeof parsed.options.directory !== "string") throw new TypeError("--directory is required");
  const command = formNpmPackageLockRegenerationCommand({
    directory: parsed.options.directory,
    npmExecutable: parsed.options["npm-executable"],
    offline: parsed.options.offline,
  });
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(command)}\n` });
}
