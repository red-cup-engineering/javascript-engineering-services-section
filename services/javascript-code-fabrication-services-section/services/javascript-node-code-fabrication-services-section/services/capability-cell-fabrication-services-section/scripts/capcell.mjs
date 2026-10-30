#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";

import {
  assertCapCellComplete,
  CapCellUnrealizedError,
  writeLocalCapCellBundle,
} from "../services/capcell-manifest-fabrication-service/src/fabricate-local-capcell.mjs";

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main() {
  const [operation, specificationPath] = process.argv.slice(2);
  const outputDirectory = valueAfter("--output");
  const evidencePath = valueAfter("--evidence") ?? valueAfter("--projections");
  if (operation !== "fabricate" || !specificationPath || !outputDirectory) {
    throw new TypeError("usage: capcell fabricate <specification.json> --output <directory> [--evidence <evidence.json>]");
  }
  const source = JSON.parse(await readFile(specificationPath, "utf8"));
  const evidence = evidencePath
    ? JSON.parse(await readFile(evidencePath, "utf8"))
    : {};
  const bundle = await writeLocalCapCellBundle(source, outputDirectory, evidence);
  try {
    assertCapCellComplete(bundle);
    process.stdout.write(`${JSON.stringify(bundle.manifest)}\n`);
  } catch (error) {
    if (!(error instanceof CapCellUnrealizedError)) throw error;
    process.stdout.write(`${JSON.stringify({
      type: error.code,
      manifest: error.manifest,
      missing: error.missing,
    })}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
