import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("single-family migration scopes extraction and reuses the requested cache", () => {
  const executable = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist/cli.mjs");
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-migration-scope-"));
  try {
    for (const name of ["selected", "unrelated"]) {
      const directory = path.join(root, name);
      mkdirSync(directory);
      writeFileSync(path.join(directory, "package.json"), JSON.stringify({ name: `@x/${name}`, version: "1.0.0" }));
      writeFileSync(path.join(directory, "index.mjs"), `export function ${name}(value) { return value + ${name.length}; }\n`);
    }
    const cache = path.join(root, "cache");
    const result = spawnSync(process.execPath, [executable, "duplication-migration", "--root", root,
      "--fingerprint", "missing", "--scope", "selected", "--cache-dir", cache], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.equal(readdirSync(cache).length, 1, "only the selected package was extracted into the requested cache");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the symlinked package bin invokes the CLI", () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const executable = path.resolve(testDirectory, "../../dist/cli.mjs");
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-engineering-cli-bin-"));
  try {
    const bin = path.join(root, "jsnode-engineering-cli");
    symlinkSync(executable, bin);
    const result = spawnSync(process.execPath, [bin, "--help"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /usage: jsnode-engineering-cli/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the package bin emits a bounded compact duplication projection", () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url));
  const executable = path.resolve(testDirectory, "../../dist/cli.mjs");
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-engineering-cli-bin-"));
  try {
    writeFileSync(path.join(root, "pnpm-workspace.yaml"), "packages: ['*']\n");
    for (const [directory, name] of [["one", "@x/one"], ["two", "@x/two"]] as const) {
      const packageDirectory = path.join(root, directory);
      mkdirSync(path.join(packageDirectory, "src"), { recursive: true });
      writeFileSync(path.join(packageDirectory, "package.json"), JSON.stringify({ name, version: "1.0.0" }));
      writeFileSync(
        path.join(packageDirectory, "src/index.mjs"),
        "export function readText(file) { const text = readFileSync(file, 'utf8'); return text.trim().toLowerCase(); }\n",
      );
    }
    const bin = path.join(root, "jsnode-engineering-cli");
    symlinkSync(executable, bin);
    const result = spawnSync(process.execPath, [bin, "duplication", "--root", root, "--limit", "1", "--compact"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      candidateCount: number;
      returnedCandidateCount: number;
      candidates: Array<{
        implementationCount: number;
        packageCount: number;
        consumerCount: number;
        implementations?: unknown;
        packages?: unknown;
        consumers?: unknown;
      }>;
    };
    assert.equal(report.candidateCount, 1);
    assert.equal(report.returnedCandidateCount, 1);
    assert.equal(report.candidates.length, 1);
    assert.equal(report.candidates[0]?.implementationCount, 2);
    assert.equal(report.candidates[0]?.packageCount, 2);
    assert.equal(report.candidates[0]?.consumerCount, 0);
    for (const key of ["implementations", "packages", "consumers"]) {
      assert.equal(key in (report.candidates[0] ?? {}), false);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
