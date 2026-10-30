import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createNpmPackage } from "../src/create-npm-package.mjs";

test("creates a package directory holding the described package.json", async () => {
  const directory = await mkdtemp(join(tmpdir(), "npm-package-creation-"));
  try {
    const receipt = await createNpmPackage({
      name: "@example/widget-service",
      description: "Does one thing.",
      directory,
    });
    assert.equal(receipt.type, "JsnodePackageCreation");
    assert.equal(receipt.packageDir, join(directory, "widget-service"));

    const written = JSON.parse(await readFile(join(directory, "widget-service", "package.json"), "utf8"));
    assert.deepEqual(written, {
      name: "@example/widget-service",
      version: "0.0.1",
      type: "module",
      description: "Does one thing.",
    });
    assert.deepEqual(receipt.manifest, written);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("includes license and author only when supplied", async () => {
  const directory = await mkdtemp(join(tmpdir(), "npm-package-creation-"));
  try {
    const receipt = await createNpmPackage({
      name: "@example/lit-service",
      description: "Does one other thing.",
      directory,
      license: "MIT",
      author: "A Person",
    });
    assert.equal(receipt.manifest.license, "MIT");
    assert.equal(receipt.manifest.author, "A Person");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses to write over an existing package directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "npm-package-creation-"));
  try {
    await createNpmPackage({ name: "@example/dup-service", description: "First.", directory });
    await assert.rejects(
      () => createNpmPackage({ name: "@example/dup-service", description: "Second.", directory }),
      /already exists/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses absent name or description", async () => {
  await assert.rejects(() => createNpmPackage({ description: "Does one thing." }), /name/u);
  await assert.rejects(() => createNpmPackage({ name: "@example/widget-service" }), /description/u);
});
