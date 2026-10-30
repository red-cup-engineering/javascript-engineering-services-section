#!/usr/bin/env node
import { runReadOnlyRegistryApp } from "../src/npm-registry-read-app.mjs";

try {
  await runReadOnlyRegistryApp(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
