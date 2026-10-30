#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { canonical, serializeLines } from "@emsenn/relating";
import {
  dehydrateUtterances,
  parseJson as parse,
  serializeEavt as serialize,
} from "@emsenn/relating/writing";

import {
  readJSNodePackage,
} from "../dist/organizing/packages/index.mjs";
import {
  discoverWorkspace,
} from "../dist/organizing/workspaces/index.mjs";
import {
  isJSNodeSourceFile,
  sourceDirectoryUtterances,
  sourceModuleUtterances,
} from "../dist/organizing/modules/index.mjs";

function readUsage() {
  return [
    "usage: pass JSON, EAVT JSONL, or key=value rows on stdin",
    "",
    "target may be a workspace root, package directory, source directory, or source file. Default target is this super-repo root.",
    "output may be utterance-log, utterance-jsonl, or eavt. Default output is eavt.",
    "",
  ].join("\n");
}

function parseReadFlagValue(value) {
  try {
    return parse(value);
  } catch {
    return value;
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function defaultTarget() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

function paramsFromJson(out, parsed) {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return;
  for (const [key, value] of Object.entries(parsed)) out[key] = value;
}

function paramsFromEavt(out, body) {
  for (const line of body.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed) || parsed.length < 3 || typeof parsed[1] !== "string") continue;
    const key = parsed[1].startsWith("jsnode.read.") ? parsed[1].slice("jsnode.read.".length) : parsed[1];
    out[key] = parsed[2];
  }
}

function paramsFromKeyValues(out, body) {
  for (const line of body.split(/\r?\n/u)) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    out[line.slice(0, index).trim()] = parseReadFlagValue(line.slice(index + 1).trim());
  }
}

function readMany(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function parseReadDomain(body) {
  const params = {};
  const trimmed = body.trim();
  if (trimmed !== "" && trimmed.startsWith("{")) {
    try {
      paramsFromJson(params, parse(trimmed));
    } catch {
      paramsFromEavt(params, body);
      paramsFromKeyValues(params, body);
    }
  } else if (trimmed !== "") {
    paramsFromEavt(params, body);
    paramsFromKeyValues(params, body);
  }
  const targetValue = params.target ?? params.path ?? defaultTarget();
  return {
    help: params.help === true || params.help === "true",
    target: path.resolve(String(targetValue)),
    output: String(params.output ?? "eavt"),
    time: params.time,
    subjects: readMany(params.subject ?? params.subjects),
    predicates: readMany(params.predicate ?? params.predicates ?? params.claim ?? params.claims),
    objects: readMany(params.object ?? params.objects),
    includeTests: params.includeTests === true || params["include-tests"] === true || params.includeTests === "true" || params["include-tests"] === "true",
  };
}

async function targetReadUtterances(target, options = {}) {
  const stats = statSync(target);
  if (stats.isFile()) {
    if (!isJSNodeSourceFile(target, options)) throw new TypeError(`not a JS/TS source file: ${target}`);
    return sourceModuleUtterances(target);
  }
  if (!stats.isDirectory()) throw new TypeError(`not a file or directory: ${target}`);

  if (existsSync(path.join(target, "pnpm-workspace.yaml"))) {
    return (await discoverWorkspace(target)).utterances;
  }
  if (existsSync(path.join(target, "package.json"))) {
    const pkg = await readJSNodePackage(target, { introspect: true });
    if (pkg === undefined) throw new TypeError(`could not read package: ${target}`);
    return pkg.utterances;
  }
  return sourceDirectoryUtterances(target, options);
}

function utteranceLogJsonl(utterances) {
  const dehydrated = dehydrateUtterances(utterances);
  return serializeLines(dehydrated.utterances);
}

function valueKey(value) {
  return canonical(value);
}

function matchesFilter(value, filters) {
  return filters.length === 0 || filters.some((filter) => valueKey(value) === valueKey(filter));
}

function factEntry(uttered) {
  const token = uttered.token.mark.value;
  const claim = uttered.claim.mark.value;
  if (
    token !== null &&
    typeof token === "object" &&
    !Array.isArray(token) &&
    "subject" in token &&
    "object" in token
  ) {
    return { subject: token.subject, predicate: claim, object: token.object };
  }
  return { subject: token, predicate: claim, object: undefined };
}

function filterUtterances(utterances, filters) {
  if (filters.subjects.length === 0 && filters.predicates.length === 0 && filters.objects.length === 0) return utterances;
  return utterances.filter((uttered) => {
    const entry = factEntry(uttered);
    return (
      matchesFilter(entry.subject, filters.subjects) &&
      matchesFilter(entry.predicate, filters.predicates) &&
      matchesFilter(entry.object, filters.objects)
    );
  });
}

function eavtsOf(utterances, time) {
  const rows = [];
  for (const entry of dehydrateUtterances(utterances).utterances) {
    if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
      const token = entry.token;
      const claim = entry.claim;
      if (
        token !== null &&
        typeof token === "object" &&
        !Array.isArray(token) &&
        "subject" in token &&
        "object" in token
      ) {
        rows.push([token.subject, claim, token.object, time]);
      }
    }
  }
  return rows;
}

function renderRead(utterances, output, time) {
  if (output === "utterance-log" || output === "") return `${canonical(dehydrateUtterances(utterances))}\n`;
  if (output === "utterance-jsonl") return utteranceLogJsonl(utterances);
  if (output === "eavt") return serialize(eavtsOf(utterances, time));
  throw new TypeError(`unknown --output=${output}`);
}

async function readMain() {
  const args = parseReadDomain(await readStdin());
  if (args.help) {
    process.stdout.write(readUsage());
    return;
  }
  const utterances = await targetReadUtterances(args.target, { includeTests: args.includeTests });
  const filtered = filterUtterances(utterances, args);
  const time = args.time ?? { read: "organizing-with-jsnode", target: args.target };
  process.stdout.write(renderRead(filtered, args.output, time));
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  readMain().catch((error) => {
    process.stderr.write(`organizing-with-jsnode-read: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
