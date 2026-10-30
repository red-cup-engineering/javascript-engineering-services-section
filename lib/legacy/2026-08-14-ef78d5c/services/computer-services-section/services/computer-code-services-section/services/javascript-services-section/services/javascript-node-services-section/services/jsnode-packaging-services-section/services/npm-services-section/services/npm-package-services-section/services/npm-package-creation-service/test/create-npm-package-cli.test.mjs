import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import { createNpmPackage as fromScript } from "../scripts/create-npm-package.mjs";
import { createNpmPackage as fromSrc } from "../src/create-npm-package.mjs";

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/create-npm-package.mjs");

test("the script re-exports the exact same operation as src, without redefining it", () => {
  assert.equal(fromScript, fromSrc);
});

test("CLI creates the package and prints the receipt as JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "npm-package-creation-cli-"));
  try {
    const result = spawnSync(process.execPath, [
      scriptPath,
      "--name", "@example/cli-widget-service",
      "--description", "Does one thing.",
      "--directory", directory,
    ], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);

    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.type, "JsnodePackageCreation");
    assert.equal(receipt.packageDir, join(directory, "cli-widget-service"));

    const written = JSON.parse(await readFile(join(directory, "cli-widget-service", "package.json"), "utf8"));
    assert.equal(written.name, "@example/cli-widget-service");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI requires --name and --description", () => {
  const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage: create-npm-package/u);
});

test("CLI prints usage on --help without requiring other arguments", () => {
  const result = spawnSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /usage: create-npm-package/u);
});

test("CLI exits 1 when the package directory already exists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "npm-package-creation-cli-"));
  try {
    const args = [
      scriptPath,
      "--name", "@example/dup-service",
      "--description", "First.",
      "--directory", directory,
    ];
    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);

    const second = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(second.status, 1);
    assert.match(second.stderr, /already exists/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
