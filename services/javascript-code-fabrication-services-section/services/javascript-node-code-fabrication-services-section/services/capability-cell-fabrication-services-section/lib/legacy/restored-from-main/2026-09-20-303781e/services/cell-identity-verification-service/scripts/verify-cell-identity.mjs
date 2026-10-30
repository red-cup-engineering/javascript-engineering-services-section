#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { verifyCellIdentity } from "../src/verify-cell-identity.mjs";

const input = JSON.parse(readFileSync(0, "utf8"));
const result = await verifyCellIdentity(input);
process.stdout.write(`${JSON.stringify({
  ...result,
  bytes: Buffer.from(result.bytes).toString("base64"),
}, null, 2)}\n`);
if (result.profileDisposition !== "admitted") process.exitCode = 2;
