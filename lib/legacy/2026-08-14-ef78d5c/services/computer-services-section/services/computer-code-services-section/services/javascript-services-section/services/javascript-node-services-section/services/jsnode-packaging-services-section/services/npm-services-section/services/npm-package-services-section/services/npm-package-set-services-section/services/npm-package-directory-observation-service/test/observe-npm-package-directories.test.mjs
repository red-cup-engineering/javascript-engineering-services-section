import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { observeNpmPackageDirectories } from "../scripts/observe-npm-package-directories.mjs";

test("observes directories carrying regular package.json files", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "npm-package-directories-"));
  context.after(() => import("node:fs/promises").then(({ rm }) => rm(root, { recursive: true, force: true })));
  await mkdir(join(root, "a"));
  await mkdir(join(root, "nested", "b"), { recursive: true });
  await mkdir(join(root, "node_modules", "ignored"), { recursive: true });
  await writeFile(join(root, "a", "package.json"), "{}");
  await writeFile(join(root, "nested", "b", "package.json"), "{}");
  await writeFile(join(root, "node_modules", "ignored", "package.json"), "{}");
  const observed = await observeNpmPackageDirectories({ root, excludes: ["node_modules"] });
  assert.deepEqual(observed.directories, [join(root, "a"), join(root, "nested", "b")]);
});
