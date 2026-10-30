#!/usr/bin/env node
import { runNpmCacheReleaseRecovery } from "../src/npm-cache-release-recovery-app.mjs";

try {
  await runNpmCacheReleaseRecovery(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
