#!/usr/bin/env node
import { resolve } from "node:path";
import { discoverJsnodeServices } from "../src/discover-services.mjs";

const result = discoverJsnodeServices(resolve(import.meta.dirname, ".."));
process.stdout.write(`${JSON.stringify(result)}\n`);
if (result.refusals.length) process.exitCode = 1;
