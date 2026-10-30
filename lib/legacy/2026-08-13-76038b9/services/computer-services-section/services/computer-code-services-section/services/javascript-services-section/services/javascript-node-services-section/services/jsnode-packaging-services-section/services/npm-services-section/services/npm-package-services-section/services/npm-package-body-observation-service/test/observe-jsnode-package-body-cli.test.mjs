import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/observe-jsnode-package-body.mjs");

test("CLI prints the same observation shape as the exported operation", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-body-observation-cli-"));
  try {
    const carrier = join(root, "lib/emsenn/services/example");
    await mkdir(join(carrier, "src"), { recursive: true });
    await writeFile(join(carrier, "package.json"), '{"name":"@owner/example"}\n');
    await writeFile(join(carrier, "src/index.mjs"), "export {};\n");

    const result = spawnSync(process.execPath, [scriptPath, "--root", root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const observation = JSON.parse(result.stdout);
    assert.equal(observation.type, "JsnodePackageBodyObservation");
    assert.equal(observation.packages.length, 1);
    assert.deepEqual(observation.sourceFiles, ["lib/emsenn/services/example/src/index.mjs"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI requires --root", () => {
  const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--root is required/);
});
