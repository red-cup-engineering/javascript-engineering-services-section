import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkJsnodePackage } from "../src/check-jsnode-package.mjs";

async function writeManifest(dir, manifest) {
  await writeFile(join(dir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

test("reports zero violations for a clean package", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-check-clean-"));
  try {
    const dir = join(root, "services", "example-widget-service");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeManifest(dir, {
      name: "@owner/example-widget-service",
      version: "0.1.0",
      private: true,
      type: "module",
      description: "Does one thing. Use it for that thing.",
      exports: "./src/example-widget.mjs",
      scripts: {
        check: "node --check src/example-widget.mjs",
        test: "node --test test/*.test.mjs",
        verify: "npm run check && npm test",
      },
      engines: { node: ">=22" },
    });
    await writeFile(join(dir, "src/example-widget.mjs"), 'export function exampleWidget() {\n  return Object.freeze({ type: "ExampleWidget" });\n}\n', "utf8");

    const report = await checkJsnodePackage({ directory: dir });
    assert.equal(report.type, "JsnodePackageCheckReport");
    assert.equal(report.layer, "services");
    assert.equal(report.packageKind, "jsnode");
    assert.equal(report.violationCount, 0, JSON.stringify(report.findings.filter((f) => f.status === "violation"), null, 2));
    assert.equal(Object.isFrozen(report), true);
    assert.equal(Object.isFrozen(report.findings), true);
    assert.equal(Object.isFrozen(report.findings[0]), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports multiple violations for a package that breaks several invariants", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-check-dirty-"));
  try {
    const dir = join(root, "services", "broken-widget-service");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeManifest(dir, {
      // M1: leaf "wrong-name" does not match directory "broken-widget-service"
      name: "@owner/wrong-name",
      // M2: private is not true
      private: false,
      type: "module",
      description: "Broken on purpose.",
      // M3: exports does not resolve to an existing file
      exports: "./src/missing.mjs",
      // M4: missing test and verify scripts
      scripts: { check: "node --check src/broken-widget.mjs" },
    });
    await writeFile(join(dir, "src/broken-widget.mjs"), "export function brokenWidget() {}\n", "utf8");

    const report = await checkJsnodePackage({ directory: dir });
    const byId = Object.fromEntries(report.findings.map((f) => [f.invariantId, f]));
    assert.equal(byId.M1.status, "violation");
    assert.equal(byId.M2.status, "violation");
    assert.equal(byId.M3.status, "violation");
    assert.equal(byId.M4.status, "violation");
    assert.ok(report.violationCount >= 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("marks dead-convention findings as informational and never as a violation", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-check-dead-"));
  try {
    const dir = join(root, "services", "example-widget-service");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeManifest(dir, {
      name: "@owner/example-widget-service",
      version: "0.1.0",
      private: true,
      type: "module",
      description: "Does one thing.",
      exports: "./src/example-widget.mjs",
      scripts: { check: "node --check src/example-widget.mjs", test: "node --test", verify: "npm run check && npm test" },
    });
    await writeFile(join(dir, "src/example-widget.mjs"), 'export function exampleWidget() {\n  return Object.freeze({ type: "ExampleWidget" });\n}\n', "utf8");

    const report = await checkJsnodePackage({ directory: dir });
    const deadFindings = report.findings.filter((f) => f.convention === "dead");
    assert.ok(deadFindings.length > 0);
    assert.ok(deadFindings.every((f) => f.status === "informational"));
    assert.ok(["D1", "M2b", "S1", "A1", "A2"].every((id) => deadFindings.some((f) => f.invariantId === id)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses a directory outside lib/apps/services/sites", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-check-layer-"));
  try {
    const dir = join(root, "somewhere-else", "example-widget-service");
    await mkdir(dir, { recursive: true });
    await writeManifest(dir, { name: "@owner/example-widget-service", private: true, type: "module" });
    await assert.rejects(() => checkJsnodePackage({ directory: dir }), /not under lib\/, apps\/, services\/, or sites\//u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses a directory without a package.json", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-check-missing-"));
  try {
    const dir = join(root, "services", "no-manifest-service");
    await mkdir(dir, { recursive: true });
    await assert.rejects(() => checkJsnodePackage({ directory: dir }), /no package\.json/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("M3 checks actual files advertised by root export maps, including conditional branches", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-check-exports-"));
  try {
    const dir = join(root, "services", "exported-widget");
    await mkdir(join(dir, "src"), { recursive: true });
    const manifest = {
      name: "@owner/exported-widget", private: true, type: "module",
      exports: { ".": { import: "./src/widget.mjs", require: "./src/widget.cjs" } },
      scripts: { check: "node --check src/widget.mjs", test: "node --test", verify: "npm test" },
    };
    await writeManifest(dir, manifest);
    await writeFile(join(dir, "src/widget.mjs"), "export const ready = true;\n", "utf8");
    let report = await checkJsnodePackage({ directory: dir });
    assert.equal(report.findings.find((f) => f.invariantId === "M3").status, "violation",
      "a missing conditional export target is not clean");

    await writeFile(join(dir, "src/widget.cjs"), "exports.ready = true;\n", "utf8");
    report = await checkJsnodePackage({ directory: dir });
    assert.equal(report.findings.find((f) => f.invariantId === "M3").status, "clean",
      "all checked root export targets now exist");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("M3 refuses out-of-package paths and does not certify uninspected wildcard or null exports", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-check-exports-refusal-"));
  try {
    const dir = join(root, "services", "exported-widget");
    await mkdir(join(dir, "src"), { recursive: true });
    const manifest = {
      name: "@owner/exported-widget", private: true, type: "module",
      exports: { ".": "./../unowned.mjs" },
      scripts: { check: "node --check src/widget.mjs", test: "node --test", verify: "npm test" },
    };
    await writeManifest(dir, manifest);
    const verdict = async (exp) => {
      await writeManifest(dir, { ...manifest, exports: exp });
      const report = await checkJsnodePackage({ directory: dir });
      return report.findings.find((f) => f.invariantId === "M3").status;
    };
    assert.equal(await verdict({ ".": "./../unowned.mjs" }), "violation");
    assert.equal(await verdict({ ".": "./src/*.mjs" }), "informational");
    assert.equal(await verdict({ ".": null }), "informational");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("M3 accepts fully present subpath-only exports, as used by SignChain", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-check-subpaths-"));
  try {
    const dir = join(root, "services", "subpath-only");
    await mkdir(join(dir, "src"), { recursive: true });
    const manifest = {
      name: "@owner/subpath-only", private: true, type: "module",
      exports: { "./package.json": "./package.json", "./tool": "./src/tool.mjs" },
      scripts: { check: "node --check src/tool.mjs", test: "node --test", verify: "npm test" },
    };
    await writeManifest(dir, manifest);
    let report = await checkJsnodePackage({ directory: dir });
    assert.equal(report.findings.find((f) => f.invariantId === "M3").status, "violation", "the missing subpath target is real");
    await writeFile(join(dir, "src/tool.mjs"), "export const tool = true;\n", "utf8");
    report = await checkJsnodePackage({ directory: dir });
    assert.equal(report.findings.find((f) => f.invariantId === "M3").status, "clean", "no root export required");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("M3 distinguishes root conditional sugar and unexamined fallback arrays", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-check-conditions-"));
  try {
    const dir = join(root, "services", "conditional-root");
    await mkdir(join(dir, "src"), { recursive: true });
    const manifest = {
      name: "@owner/conditional-root", private: true, type: "module",
      exports: { import: "./src/widget.mjs" },
      scripts: { check: "node --check src/widget.mjs", test: "node --test", verify: "npm test" },
    };
    await writeFile(join(dir, "src/widget.mjs"), "export const widget = true;\n", "utf8");
    await writeManifest(dir, manifest);
    let report = await checkJsnodePackage({ directory: dir });
    assert.equal(report.findings.find((f) => f.invariantId === "M3").status, "clean");
    await writeManifest(dir, { ...manifest, exports: [ "./src/nonexistent.mjs", "./src/widget.mjs" ] });
    report = await checkJsnodePackage({ directory: dir });
    assert.equal(report.findings.find((f) => f.invariantId === "M3").status, "informational", "fallback resolution not observed");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("emits native SignCell source-revision cells without inventing a FOUR evaluator", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-check-signcell-"));
  try {
    const dir = join(root, "services", "observed-package");
    await mkdir(join(dir, "src"), { recursive: true });
    const manifest = {
      name: "@owner/observed-package", type: "module", private: true,
      exports: "./src/entry.mjs",
      scripts: { check: "node --check src/entry.mjs", test: "node --test", verify: "npm test" },
    };
    await writeManifest(dir, manifest);
    await writeFile(join(dir, "src/entry.mjs"), "export const datum = true;\n", "utf8");
    const a = await checkJsnodePackage({ directory: dir });
    assert.equal(a.cells.length, a.findings.length);
    const m3 = a.cells.find((item) => item.object === "M3");
    assert.equal(m3.predicate, "conforms-to-jsnode-rule");
    assert.equal(m3.for.length, 1);
    assert.equal(m3.against.length, 0);
    assert.equal(m3.for[0].observed.exportTargets[0].exists, true);
    assert.match(m3.subject.revision, /^ni:/u);
    assert.match(m3.subject.checkerRevision, /^ni:/u);
    const dead = a.cells.find((item) => item.object === "S1");
    assert.equal(dead.for.length, 0, "retired rule is not a positive witness");
    assert.equal(dead.against.length, 0, "retired rule is not negative without evidence");
    await rm(join(dir, "src/entry.mjs"));
    const b = await checkJsnodePackage({ directory: dir });
    const missing = b.cells.find((item) => item.object === "M3");
    assert.equal(missing.for.length, 0);
    assert.equal(missing.against.length, 1);
    assert.equal(missing.against[0].observed.exportTargets[0].exists, false);
    assert.notEqual(missing.subject.revision, m3.subject.revision, "a changed source-existence observation changes source identity");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("unknown exports and an irrelevant waiver cannot manufacture conformance", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-check-unknown-evidence-"));
  try {
    const dir = join(root, "services", "uncertain-package");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeManifest(dir, {
      name: "@owner/uncertain-package", type: "module", private: true,
      exports: { "./x": "./src/*.mjs" },
      scripts: { check: "node --check src/entry.mjs", test: "node --test", verify: "npm test" },
    });
    await writeFile(join(dir, "src/entry.mjs"), "// law-allow: unrelated\nexport const datum = true;\n", "utf8");
    const report = await checkJsnodePackage({ directory: dir });
    const m3 = report.cells.find((item) => item.object === "M3");
    assert.deepEqual([m3.for.length, m3.against.length], [0, 0]);
    const s1 = report.cells.find((item) => item.object === "S1");
    assert.deepEqual([s1.for.length, s1.against.length], [0, 0]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("M3 examines real file type and symlink owner through the same SignCell witness", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-check-real-target-"));
  try {
    const dir = join(root, "services", "actual-exports");
    const target = join(dir, "src", "entry.mjs");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(root, "external.mjs"), "export const external = true;\n");
    await writeManifest(dir, {
      name: "@owner/actual-exports", private: true, type: "module",
      exports: "./src/entry.mjs",
      scripts: { check: "node --check src/entry.mjs", test: "node --test", verify: "npm test" },
    });
    await mkdir(target);
    let read = await checkJsnodePackage({ directory: dir });
    assert.equal(read.findings.find((f) => f.invariantId === "M3").status, "violation", "directory not file");
    assert.equal(read.cells.find((c) => c.object === "M3").against[0].observed.exportTargets[0].exists, false);
    await rm(target, { recursive: true });
    await symlink(join(root, "external.mjs"), target);
    read = await checkJsnodePackage({ directory: dir });
    assert.equal(read.findings.find((f) => f.invariantId === "M3").status, "violation", "symlink escapes package");
    assert.equal(read.cells.find((c) => c.object === "M3").against[0].observed.exportTargets[0].withinPackage, false);
    await rm(target);
    await writeFile(join(dir, "src", "real.mjs"), "export const internal = true;\n");
    await symlink(join(dir, "src", "real.mjs"), target);
    read = await checkJsnodePackage({ directory: dir });
    assert.equal(read.findings.find((f) => f.invariantId === "M3").status, "clean", "in-package file symlink");
    assert.equal(read.cells.find((c) => c.object === "M3").for[0].observed.exportTargets[0].exists, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("an uninspected source symlink does not turn a partial A3 scan into clean conformance", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-uninspected-source-"));
  try {
    const dir = join(root, "services", "source-coverage");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeManifest(dir, {
      name: "@owner/source-coverage", type: "module", private: true, exports: "./src/entry.mjs",
      scripts: { check: "node --check src/entry.mjs", test: "node --test", verify: "npm test" },
    });
    await writeFile(join(dir, "src", "entry.mjs"), 'export const datum = { type: "SourceRecord" };\n');
    const full = await checkJsnodePackage({ directory: dir });
    assert.equal(full.findings.find((item) => item.invariantId === "A3").status, "clean");
    assert.equal(full.cells.find((item) => item.object === "A3").for.length, 1);
    await writeFile(join(root, "unobserved.mjs"), 'export const x = { type: "non-Pascal" };\n');
    await symlink(join(root, "unobserved.mjs"), join(dir, "src", "unobserved.mjs"));
    const incomplete = await checkJsnodePackage({ directory: dir });
    const a3 = incomplete.findings.find((item) => item.invariantId === "A3");
    assert.equal(a3.status, "informational");
    assert.deepEqual([
      incomplete.cells.find((item) => item.object === "A3").for.length,
      incomplete.cells.find((item) => item.object === "A3").against.length,
    ], [0, 0], "incomplete source enumeration is unknown, never witnessed clean");
    assert.notEqual(incomplete.cells[0].subject.revision, full.cells[0].subject.revision,
      "source inventory omissions change the declared inspection identity");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("source-root symlinks outside package never enter a package's evidence scan", async () => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-src-root-boundary-"));
  try {
    const dir = join(root, "services", "boundary");
    await mkdir(dir, { recursive: true });
    const outside = join(root, "private-source");
    await mkdir(outside);
    await writeFile(join(outside, "secret.mjs"), 'export const x = { type: "SecretRecord" };\n');
    await writeManifest(dir, {
      name: "@owner/boundary", type: "module", private: true,
      exports: { ".": null },
      scripts: { check: "node --check src/entry.mjs", test: "node --test", verify: "npm test" },
    });
    await symlink(outside, join(dir, "src"));
    const report = await checkJsnodePackage({ directory: dir });
    const a3 = report.findings.find((entry) => entry.invariantId === "A3");
    assert.equal(a3.status, "informational");
    const a3Cell = report.cells.find((entry) => entry.object === "A3");
    assert.equal(a3Cell.for.length, 0);
    assert.equal(a3Cell.against.length, 0);
    assert.deepEqual(a3Cell.subject.revision.startsWith("ni:"), true);
    assert.deepEqual(report.cells[0].subject.revision, a3Cell.subject.revision);
  } finally { await rm(root, { recursive: true, force: true }); }
});
