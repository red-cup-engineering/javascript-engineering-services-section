import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, "..", "scripts", "check-stale-references.mjs");

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), "check-stale-references-bin-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function buildFixture(root) {
  await mkdir(join(root, "deploy"), { recursive: true });
  await writeFile(
    join(root, "deploy", "unit.service"),
    "[Service]\nExecStart=/opt/app/bin/serve-registry.mjs --port 8080\n",
  );
}

test("the bin streams NDJSON, one valid-JSON line per match, with the correct path", async () => {
  await withRoot(async (root) => {
    await buildFixture(root);
    const result = spawnSync(process.execPath, [BIN, "--old", "bin/serve-registry.mjs", "--root", root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.trim().split("\n").filter((l) => l.length > 0);
    assert.equal(lines.length, 1);
    const record = JSON.parse(lines[0]);
    assert.equal(record.path, "deploy/unit.service");
    assert.equal(record.line, 2);
    assert.equal(record.matchedText, "bin/serve-registry.mjs");
  });
});

test("no matches produces empty stdout and exit 0", async () => {
  await withRoot(async (root) => {
    await buildFixture(root);
    const result = spawnSync(process.execPath, [BIN, "--old", "no-such-string-anywhere", "--root", root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "");
  });
});

test("a missing --old argument fails with a non-zero exit and a usage message", async () => {
  await withRoot(async (root) => {
    const result = spawnSync(process.execPath, [BIN, "--root", root], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--old is required/);
  });
});

test("a missing --root argument fails with a non-zero exit and a usage message", async () => {
  const result = spawnSync(process.execPath, [BIN, "--old", "x"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--root is required/);
});
