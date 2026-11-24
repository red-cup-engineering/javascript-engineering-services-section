import { parseArgs } from "node:util";

import { canonical, parse } from "@red-cup-engineering/json-codec-service";

async function readStandardInput(standardInput) {
  const chunks = [];
  for await (const chunk of standardInput) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function paramsFromText(text) {
  const trimmed = text.trim();
  if (trimmed === "") return Object.freeze({});
  if (!trimmed.startsWith("{")) return Object.freeze({ q: text });
  const params = parse(trimmed);
  if (params === null || typeof params !== "object" || Array.isArray(params)) throw new TypeError("stdin JSON must be an object");
  return Object.freeze(params);
}

/** Run one `(repoRoot, params) -> JSON` operation over the standard streams. */
export async function runJsonStdioOperation(operationName, operation, io = {}) {
  const standardInput = io.standardInput ?? process.stdin;
  const standardOutput = io.standardOutput ?? process.stdout;
  const standardError = io.standardError ?? process.stderr;
  try {
    const { values } = parseArgs({ args: io.arguments ?? process.argv.slice(2), options: { root: { type: "string", default: process.cwd() } } });
    const result = await operation(values.root, paramsFromText(await readStandardInput(standardInput)));
    standardOutput.write(`${canonical(result)}\n`);
    return 0;
  } catch (error) {
    standardError.write(`${operationName}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}
