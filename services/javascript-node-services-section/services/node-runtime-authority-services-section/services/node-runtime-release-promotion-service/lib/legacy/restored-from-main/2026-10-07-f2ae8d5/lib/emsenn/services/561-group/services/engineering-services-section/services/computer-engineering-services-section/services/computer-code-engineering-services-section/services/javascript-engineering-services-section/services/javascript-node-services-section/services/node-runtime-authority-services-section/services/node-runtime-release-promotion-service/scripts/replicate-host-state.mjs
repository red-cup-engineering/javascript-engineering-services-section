#!/usr/bin/env node
/**
 * A host's state, replicated to this machine while its writers run. The state a node keeps is
 * append-only journals: a closed day never changes and the open day only grows, so a copy needs no
 * quiescence. rsync sends only what changed; a line torn mid-append is completed by the next pull.
 * This replaces stopping a node to archive its whole state on every code release (a release does
 * not change state; it swaps the release pointer and restarts).
 *
 *   replicate-host-state.mjs --host <ssh host> --state <remote dir, ~-relative> --to <local dir>
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { host: { type: "string" }, state: { type: "string" }, to: { type: "string" } } });
if (!values.host || !values.state || !values.to) throw new Error("usage: replicate-host-state.mjs --host <ssh host> --state <remote dir> --to <local dir>");
const to = values.to.replace(/^~(?=\/|$)/u, homedir());
mkdirSync(to, { recursive: true, mode: 0o700 });
const startedAt = Date.now();
// The serving host gives the copy its idle CPU and I/O classes, so the replica never competes with the node.
// Packed segments keep their plain size with a punched hole (segment-bytes.mjs); --sparse keeps it a hole here.
execFileSync("rsync", ["-a", "--sparse", "--partial", "--rsync-path=nice -n 19 ionice -c3 rsync", `${values.host}:${values.state.replace(/\/?$/u, "/")}`, `${to}/`], { stdio: "inherit" });
process.stdout.write(`${JSON.stringify({ kind: "host-state-replica.v1", host: values.host, state: values.state, to, seconds: Math.round((Date.now() - startedAt) / 1000) })}\n`);
