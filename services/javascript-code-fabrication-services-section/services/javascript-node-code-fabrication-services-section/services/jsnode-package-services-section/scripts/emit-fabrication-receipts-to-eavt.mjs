#!/usr/bin/env node
// One effect: fold each complete admitted fabrication receipt into world rows.
import { resolve } from "node:path";
import { execute as executeEavt } from "@red-cup-engineering/eavt-services-section";
import { foldFabricationReceiptIntoWorldRows } from "@red-cup-engineering/jsnode-package-services-section/fabrication-receipts";
import { walkPosixPaths } from "@red-cup-engineering/computer-filepath-engineering-services-section/walk-posix-paths";
import { readTextFile } from "@red-cup-engineering/computer-file-engineering-services-section/read-text-file";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";

const RECEIPT_PATH_PATTERN = /\/data\/records\/\d{4}-\d{2}-\d{2}-.*fabrication-receipt\.json$/u;

/**
 * Walks `root` for dated fabrication-receipt.json files under any data/records/ directory and
 * appends world rows only for complete receipts whose fabrication evidence admits. Historical
 * creation-only records remain discoverable on disk but cannot create receiver rows.
 * @param {{root: string, tracePath: string}} args
 * @returns {Promise<object>} A run summary: files read, entities touched, rows appended.
 */
export async function emitFabricationReceiptsToEavt({ root, tracePath }) {
  const walk = await walkPosixPaths({
    root,
    excludes: ["node_modules", ".git"],
    symlinks: "skip",
    includeFile: (file) => RECEIPT_PATH_PATTERN.test(`/${file.path}`),
  });
  // symlinks bypass includeFile in path-walking-service; re-apply the pattern to be certain.
  const receiptPaths = walk.files.map((file) => file.path).filter((path) => RECEIPT_PATH_PATTERN.test(`/${path}`)).sort();

  let existingRows = [];
  try {
    existingRows = executeEavt({ operation: "read", path: tracePath });
  } catch {
    existingRows = [];
  }
  let filesRead = 0;
  let rowsAppended = 0;
  const touchedPackages = new Set();
  const appendedRows = [];
  const refusedReceipts = [];
  let nextT = Math.max(-1, ...existingRows.map((row) => Number.isInteger(row.t) ? row.t : -1)) + 1;

  for (const relativePath of receiptPaths) {
    const absolutePath = resolve(root, relativePath);
    filesRead += 1;
    let folded;
    try {
      const receipt = JSON.parse((await readTextFile({ path: absolutePath })).text);
      folded = foldFabricationReceiptIntoWorldRows({ receipt, t: nextT });
    } catch (error) {
      refusedReceipts.push({ path: relativePath, code: error?.code ?? "RECEIPT_UNREADABLE", message: error?.message ?? String(error) });
      continue;
    }
    const packageName = folded.rows[0]?.v?.name;
    if (typeof packageName === "string") touchedPackages.add(packageName);
    for (const row of folded.rows) {
      executeEavt({ operation: "append", path: tracePath, row });
      appendedRows.push(row);
      rowsAppended += 1;
    }
    nextT = folded.rows.at(-1).t + 1;
  }

  return {
    type: "FabricationReceiptEavtEmissionRunSummary",
    version: 1,
    root,
    trace: tracePath,
    filesRead,
    packagesTouched: touchedPackages.size,
    rowsAppended,
    refusedReceipts,
    sampleRows: appendedRows.slice(0, 5),
  };
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "emit-fabrication-receipts-to-eavt", description: "Walks `root` for dated fabrication receipts and appends world rows only after complete receipt admission binds the born package to realization evidence.", operation: emitFabricationReceiptsToEavt }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
