// conformance-tics server entry-point — auto-discovers workspace packages.
// usage: conformance-tics [--host 127.0.0.1] [--port 18810] [--root <dir>]

import process from "node:process";
import path from "node:path";
import { readdir, access } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { start, installGracefulShutdown } from "@emsenn/http-server";
import { createConformanceTicsApp } from "./index.ts";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 18810;

function findRepoRoot(from: string): string | undefined {
  let dir = path.resolve(from);
  while (true) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

async function discoverPackages(repoRoot: string): Promise<string[]> {
  const strata = ["lib", "apps", "services", "sites"];
  const paths: string[] = [];
  for (const stratum of strata) {
    const dir = path.join(repoRoot, stratum);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pkgDir = path.join(dir, entry);
      try {
        await access(path.join(pkgDir, "package.json"));
        paths.push(pkgDir);
      } catch {
        // not a package
      }
    }
  }
  return paths;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let host = DEFAULT_HOST;
  let port = DEFAULT_PORT;
  let rootArg: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--host") {
      host = argv[++i] ?? DEFAULT_HOST;
    } else if (arg === "--port") {
      const raw = argv[++i] ?? "";
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        process.stderr.write(`--port requires a positive integer, got: ${raw}\n`);
        process.exitCode = 2;
        return;
      }
      port = parsed;
    } else if (arg === "--root") {
      rootArg = argv[++i];
    }
  }

  const repoRoot = rootArg !== undefined
    ? path.resolve(rootArg)
    : (findRepoRoot(process.cwd()) ?? process.cwd());

  const pkgPaths = await discoverPackages(repoRoot);
  const app = createConformanceTicsApp({ paths: pkgPaths, repoRoot });
  const running = await start(app, { host, port });
  installGracefulShutdown(running);
  process.stdout.write(`conformance-tics listening at http://${host}:${running.port}/ (${pkgPaths.length} packages)\n`);
  await new Promise<never>(() => {});
}

function isMain(): boolean {
  return process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
