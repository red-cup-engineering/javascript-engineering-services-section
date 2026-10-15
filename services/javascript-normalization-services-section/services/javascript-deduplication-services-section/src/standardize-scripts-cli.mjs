#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { standardizeScripts } from "./standardize-scripts.mjs";

/** usage: standardize-scripts --root <dir> --list <file-of-paths> [--apply] [--receipts <trace>] [--progress] */
const argv = process.argv.slice(2);
const option = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const root = path.resolve(option("--root") ?? process.cwd());
const list = option("--list");
if (!list) { process.stderr.write("usage: standardize-scripts --root <dir> --list <file-of-paths> [--apply] [--receipts <trace>] [--progress]\n"); process.exit(1); }
const files = readFileSync(list, "utf8").split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
const receipts = option("--receipts");
const summary = standardizeScripts(root, files, { apply: argv.includes("--apply"), progress: argv.includes("--progress"), ...(receipts ? { receiptTrace: path.resolve(receipts) } : {}) });
const { outcomes, ...totals } = summary;
process.stdout.write(`${JSON.stringify({ ...totals, outcomes: outcomes.filter((o) => o.act !== "projected" || argv.includes("--verbose")) }, null, 2)}\n`);
process.exitCode = 0;
