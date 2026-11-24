#!/usr/bin/env node

import { parseArgs } from "node:util";

import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { planJSNodeMove } from "../src/plan-jsnode-move.mjs";

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function commandFromInput(text, positional) {
  if (positional !== undefined) return positional;
  const trimmed = text.trim();
  if (trimmed === "") return "";
  if (!trimmed.startsWith("{")) return text;
  const params = parse(trimmed);
  if (params === null || typeof params !== "object" || Array.isArray(params)) throw new TypeError("stdin JSON must be an object");
  const command = params.q ?? params.command ?? "";
  if (typeof command !== "string") throw new TypeError("q or command must be a string");
  return command;
}

if (import.meta.main) {
  try {
    const { values, positionals } = parseArgs({
      allowPositionals: true,
      options: { root: { type: "string", default: process.cwd() } },
    });
    if (positionals.length > 1) throw new TypeError("at most one command argument is allowed");
    const result = await planJSNodeMove(values.root, commandFromInput(await readStandardInput(), positionals[0]));
    process.stdout.write(`${canonical(result)}\n`);
  } catch (error) {
    process.stderr.write(`plan-jsnode-move: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
