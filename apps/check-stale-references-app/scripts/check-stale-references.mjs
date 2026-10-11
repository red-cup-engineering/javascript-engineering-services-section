#!/usr/bin/env node
import { checkStaleReferences } from "../src/check-stale-references.mjs";

function usage() {
  return [
    "usage: check-stale-references --old <string> --root <path> [--config <path>]",
    "         [--exclude <name>]... [--ignore-case]",
  ].join("\n");
}

function parseArgs(argv) {
  const args = { old: undefined, root: undefined, config: undefined, exclude: [], ignoreCase: false };
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift();
    switch (arg) {
      case "--old":
        args.old = rest.shift();
        break;
      case "--root":
        args.root = rest.shift();
        break;
      case "--config":
        args.config = rest.shift();
        break;
      case "--exclude":
        args.exclude.push(rest.shift());
        break;
      case "--ignore-case":
        args.ignoreCase = true;
        break;
      default:
        throw new TypeError(`unrecognized argument: ${arg}\n${usage()}`);
    }
  }
  if (!args.old) throw new TypeError(`--old is required\n${usage()}`);
  if (!args.root) throw new TypeError(`--root is required\n${usage()}`);
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const matches = await checkStaleReferences({
    old: args.old,
    root: args.root,
    configPath: args.config,
    extraExcludes: args.exclude,
    options: { ignoreCase: args.ignoreCase },
  });

  for (const match of matches) {
    const line = `${JSON.stringify(match)}\n`;
    const canWriteMore = process.stdout.write(line);
    if (!canWriteMore) await new Promise((res) => process.stdout.once("drain", res));
  }
}

// Same rationale as search-file-path's bin: a downstream reader that stops early
// (`... | head -n 1`) closes its end of the pipe and Node delivers EPIPE on
// the next write — exit cleanly instead of an uncaught-error stack trace.
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
