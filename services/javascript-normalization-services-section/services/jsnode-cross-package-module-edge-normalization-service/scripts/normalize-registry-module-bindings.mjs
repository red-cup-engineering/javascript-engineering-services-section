#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { normalizeRegistryModuleBindings } from "../src/normalize-registry-module-bindings.mjs";
const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("expected explicit source binding selection and receipt paths");
const selection = JSON.parse(await readFile(input, "utf8"));
let prior = { visited: [], changed: [] };
try { prior = JSON.parse(await readFile(output, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const visited = new Set(prior.visited);
const finish = current => ({ ...current, visited: [...visited, ...current.visited], changed: [...new Set([...prior.changed, ...current.changed])] });
const result = await normalizeRegistryModuleBindings({ ...selection, packageDirs: selection.packageDirs.filter(dir => !visited.has(dir)), onProgress: async current => {
  await writeFile(output, `${JSON.stringify({ ...finish(current), phase: "applying" }, null, 2)}\n`);
} });
const receipt = { ...finish(result), phase: "complete" };
await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ phase: receipt.phase, packages: receipt.visited.length, changed: receipt.changed.length }));
