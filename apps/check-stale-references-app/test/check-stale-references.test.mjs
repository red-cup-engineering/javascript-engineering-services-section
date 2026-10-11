import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkStaleReferences, findStaleReferences } from "../src/check-stale-references.mjs";

async function withRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), "check-stale-references-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function buildFixture(root) {
  await mkdir(join(root, "deploy"), { recursive: true });
  await mkdir(join(root, "node_modules", "some-pkg"), { recursive: true });
  await writeFile(
    join(root, "deploy", "unit.service"),
    "[Service]\nExecStart=/opt/app/bin/serve-registry.mjs --port 8080\n",
  );
  await writeFile(join(root, "deploy", "notes.md"), "See bin/serve-registry.mjs for the old entrypoint.\n");
  await writeFile(join(root, "node_modules", "some-pkg", "cached.js"), "// bin/serve-registry.mjs cached copy\n");
}

test("findStaleReferences reports a real content match with correct path and line", async () => {
  await withRoot(async (root) => {
    await buildFixture(root);
    const matches = findStaleReferences({ old: "bin/serve-registry.mjs", root, excludes: ["node_modules"] });
    assert.equal(matches.length, 2);
    const paths = matches.map((m) => m.path).sort();
    assert.deepEqual(paths, ["deploy/notes.md", "deploy/unit.service"]);
    const unitMatch = matches.find((m) => m.path === "deploy/unit.service");
    assert.equal(unitMatch.line, 2);
    assert.equal(unitMatch.matchedText, "bin/serve-registry.mjs");
    assert.equal(unitMatch.matchKind, "content-literal");
  });
});

test("findStaleReferences returns no matches when the string is not present", async () => {
  await withRoot(async (root) => {
    await buildFixture(root);
    const matches = findStaleReferences({ old: "no-such-string-anywhere", root, excludes: ["node_modules"] });
    assert.deepEqual(matches, []);
  });
});

test("findStaleReferences excludes node_modules by default exclude list", async () => {
  await withRoot(async (root) => {
    await buildFixture(root);
    const matches = findStaleReferences({ old: "bin/serve-registry.mjs", root, excludes: ["node_modules"] });
    assert.equal(matches.some((m) => m.path.startsWith("node_modules/")), false);
  });
});

test("findStaleReferences without an excludes list does search node_modules (the caller decides, same as walkPosixPaths)", async () => {
  await withRoot(async (root) => {
    await buildFixture(root);
    const matches = findStaleReferences({ old: "bin/serve-registry.mjs", root, excludes: [] });
    assert.ok(matches.some((m) => m.path.startsWith("node_modules/")));
  });
});

test("checkStaleReferences resolves the shipped priority-paths excludes and keeps node_modules out by default", async () => {
  await withRoot(async (root) => {
    await buildFixture(root);
    const matches = await checkStaleReferences({ old: "bin/serve-registry.mjs", root });
    assert.equal(matches.some((m) => m.path.startsWith("node_modules/")), false);
    assert.ok(matches.some((m) => m.path === "deploy/unit.service"));
  });
});

test("throws when old is missing", () => {
  assert.throws(() => findStaleReferences({ root: "." }), TypeError);
});

test("throws when root is missing", () => {
  assert.throws(() => findStaleReferences({ old: "x" }), TypeError);
});
