#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { projectJsnodeModules } from "../src/project-jsnode-modules.mjs";

const specificationPath = new URL("../data/records/jsnode-package-cli.specification.json", import.meta.url);
async function readJson(path) { return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8")); }

/** Resolves the binding record to authored source/schema carriers, then projects the sole CLI. */
export async function projectJsnodePackageCli() {
  const binding = JSON.parse(await readFile(specificationPath, "utf8"));
  const sources = await Promise.all(binding.sources.map(async ({ path }) => ({ path, text: await readFile(new URL(`../${path}`, import.meta.url), "utf8") })));
  const operations = await Promise.all(binding.operations.map(async (operation) => ({
    name: operation.name, module: operation.module, exportName: operation.exportName, description: operation.description,
    ...(operation.inputSchemaPath ? { inputSchemaPath: operation.inputSchemaPath, inputSchema: await readJson(operation.inputSchemaPath) } : {}),
    ...(operation.outputSchemaPath ? { outputSchemaPath: operation.outputSchemaPath, outputSchema: await readJson(operation.outputSchemaPath) } : {}),
  })));
  const files = projectJsnodeModules({ sources, operations, externalReferences: binding.externalReferences ?? [], cli: binding.cli });
  const cli = files.find((file) => file.path === binding.cli.path);
  if (!cli) throw new Error("CLI projection was absent");
  return cli;
}

if (import.meta.main) {
  const file = await projectJsnodePackageCli();
  const current = await readFile(new URL(`../${file.path}`, import.meta.url), "utf8").catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (process.argv.slice(2).includes("--check")) process.exitCode = current === file.text ? 0 : 1;
  else await writeFile(new URL(`../${file.path}`, import.meta.url), file.text, { mode: file.mode });
}
