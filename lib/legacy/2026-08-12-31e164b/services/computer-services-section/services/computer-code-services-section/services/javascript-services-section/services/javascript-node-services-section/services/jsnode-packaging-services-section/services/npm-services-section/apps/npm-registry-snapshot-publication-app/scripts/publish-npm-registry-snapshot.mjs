#!/usr/bin/env node
import { runSnapshotPublicationApp } from "../src/npm-registry-snapshot-publication-app.mjs";
try { await runSnapshotPublicationApp(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
