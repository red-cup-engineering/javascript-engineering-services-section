import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/normalize-jsnode-package-dependencies.mjs");

test("CLI prints the same normalization shape as the exported operation", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-dependency-normalization-cli-"));
  try {
    const manifestPath = join(root, "package.json");
    await writeFile(
      manifestPath,
      JSON.stringify({ name: "@owner/consumer", dependencies: { "@emsenn/provider": "workspace:*", external: "^1" } })
    );
    const providersByNamePath = join(root, "providers-by-name.json");
    await writeFile(
      providersByNamePath,
      JSON.stringify({ "@emsenn/provider": { name: "@red-cup-engineering/provider", version: "3.0.0" } })
    );

    const result = spawnSync(
      process.execPath,
      [scriptPath, "--manifest", manifestPath, "--providers-by-name", providersByNamePath],
      { encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stderr);
    const normalized = JSON.parse(result.stdout);
    assert.deepEqual(normalized.dependencies, { "@red-cup-engineering/provider": "3.0.0", external: "^1" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI requires --manifest", () => {
  const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage: normalize-jsnode-package-dependencies/);
});
