import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CONSERVATIVE_FILE_REFERENCE_OVERHEAD_BYTES,
  workspaceDuplication,
} from "./duplication.mjs";

function packageAt(root, dir, name, dependencies, source) {
  const target = path.join(root, dir);
  mkdirSync(path.join(target, "src"), { recursive: true });
  writeFileSync(path.join(target, "package.json"), JSON.stringify({ name, version: "1.0.0", dependencies }));
  writeFileSync(path.join(target, "src/index.mjs"), source);
}

test("ranks semantic duplicates, exposes policy variants, and collapses package replicas", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    packageAt(root, "core", "@x/core", {}, "export function load(file) { return readFileSync(file, 'utf8') || 'first'; }");
    packageAt(root, "site", "@x/site", { "@x/core": "1.0.0" }, "export function read(path) { return readFileSync(path, 'utf8') || 'second'; }");
    packageAt(root, "site-copy", "@x/site", { "@x/core": "1.0.0" }, "\nexport function read(path) { return readFileSync(path, 'utf8') || 'second'; }");
    packageAt(root, "consumer", "@x/consumer", { "@x/site": "1.0.0" }, "export function other(path) { return writeFileSync(path, 'x'); }");
    const result = workspaceDuplication(root, { minimumBytes: 1 });
    assert.equal(result.candidateCount, 1);
    assert.equal(result.replicatedPackageCopiesExcluded, 1);
    assert.equal(result.candidates[0]?.implementationVariants, 2);
    assert.equal(result.candidates[0]?.exactDuplicateBytes, 0);
    assert.equal(result.candidates[0]?.packageLocalRemovableBytes, 0);
    assert.deepEqual(result.candidates[0]?.largestPackageConcentration, {
      package: "@x/core",
      implementationCount: 1,
      totalBytes: result.candidates[0]?.implementations[0]?.bytes,
      removableBytes: 0,
    });
    assert.deepEqual(result.candidates[0]?.packages, ["@x/core", "@x/site"]);
    assert.deepEqual(result.candidates[0]?.consumers, ["@x/consumer", "@x/site"]);
    assert.equal(result.candidates[0]?.owner, "@x/core");
    assert.equal(result.candidates[0]?.ownerBasis, "dependency-graph");
    assert.deepEqual(result.candidates[0]?.ownerEvidence, [{
      package: "@x/core", packageDir: path.join(root, "core"), version: "1.0.0",
      exports: null, main: null, dependencies: {}, testCommand: null,
      verification: "source-manifest-only",
    }], "a dependency hint without exports or tests cannot imply contract acceptance");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reserves one largest body for cross-package policy variants", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    const compact = "export function requestRpc(url) { return fetch(url, { method: 'POST', body: 'compact' }); }";
    const detailed = "export function requestRpc(url) { return fetch(url, { method: 'POST', body: 'detailed request evidence' }); }";
    packageAt(root, "first", "@x/first", {}, compact);
    packageAt(root, "second", "@x/second", {}, detailed);

    const candidate = workspaceDuplication(root, { minimumBytes: 1 }).candidates[0];
    const totalBytes = candidate.implementations.reduce((sum, implementation) => sum + implementation.bytes, 0);
    const largestBytes = Math.max(...candidate.implementations.map((implementation) => implementation.bytes));

    assert.equal(candidate.implementationVariants, 2);
    assert.equal(candidate.packageLocalRemovableBytes, 0);
    assert.equal(candidate.estimatedSharedOwnerBytes, largestBytes);
    assert.equal(candidate.estimatedReferenceOverheadBytes, 2 * CONSERVATIVE_FILE_REFERENCE_OVERHEAD_BYTES);
    assert.equal(candidate.estimatedNetByteSavings, totalBytes - largestBytes - candidate.estimatedReferenceOverheadBytes);
    assert.ok(candidate.estimatedNetByteSavings < 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ranks an exact three-package RPC family by one shared retained body", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    const rpc = `export async function rpc(url, method, params) {
      const request = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params, note: "${"x".repeat(800)}" });
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: request });
      if (!response.ok) return { ok: false, reason: response.status };
      const body = await response.json();
      return body?.result === undefined ? { ok: false, reason: "missing result" } : { ok: true, value: body.result };
    }`;
    packageAt(root, "first", "@x/first", {}, rpc);
    packageAt(root, "second", "@x/second", {}, rpc);
    packageAt(root, "third", "@x/third", {}, rpc);

    const candidate = workspaceDuplication(root, { minimumBytes: 1 }).candidates[0];
    const bodyBytes = candidate.implementations[0].bytes;

    assert.equal(candidate.implementationVariants, 1);
    assert.equal(candidate.exactDuplicateBytes, 2 * bodyBytes);
    assert.equal(candidate.removableBytes, 2 * bodyBytes);
    assert.equal(candidate.packageLocalRemovableBytes, 0);
    assert.equal(candidate.estimatedSharedOwnerBytes, bodyBytes);
    assert.equal(candidate.estimatedReferenceOverheadBytes, 3 * CONSERVATIVE_FILE_REFERENCE_OVERHEAD_BYTES);
    assert.equal(candidate.estimatedNetByteSavings, 2 * bodyBytes - 3 * CONSERVATIVE_FILE_REFERENCE_OVERHEAD_BYTES);
    assert.ok(candidate.estimatedNetByteSavings > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports declared receiving contracts without claiming execution and refuses cyclic owners", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    const source = "export function readText(file) { return readFileSync(file, 'utf8').trim(); }";
    packageAt(root, "core", "@x/core", {}, source);
    packageAt(root, "site", "@x/site", { "@x/core": "1.0.0" }, source);
    const core = { name: "@x/core", version: "1.0.0", exports: { ".": "./src/index.mjs" }, scripts: { test: "node --test" } };
    writeFileSync(path.join(root, "core/package.json"), JSON.stringify(core));
    const evidence = workspaceDuplication(root, { minimumBytes: 1 }).candidates[0].ownerEvidence[0];
    assert.deepEqual(evidence.exports, { ".": "./src/index.mjs" });
    assert.equal(evidence.testCommand, "node --test");
    assert.equal(evidence.verification, "source-manifest-only");
    writeFileSync(path.join(root, "core/package.json"), JSON.stringify({ ...core, dependencies: { "@x/site": "1.0.0" } }));
    const cyclic = workspaceDuplication(root, { minimumBytes: 1 }).candidates[0];
    assert.equal(cyclic.owner, null);
    assert.equal(cyclic.ownerBasis, null);
    assert.deepEqual(cyclic.ownerEvidence, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("flags the computer-data/code/networking layering owner even with no dependency edge (org-layering, 2026-09-06)", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    const source = "export function parseThing(text) { return text.trim().split(','); }";
    packageAt(root, "unrelated-domain-package", "@x/unrelated-domain", {}, source);
    packageAt(root, "computer-data-engineering-services-section/leaf-package", "@x/leaf-primitive", {}, source);
    const candidate = workspaceDuplication(root, { minimumBytes: 1 }).candidates[0];
    assert.equal(candidate.owner, "@x/leaf-primitive", "the leg seated under computer-data-engineering-services-section is the law's owner regardless of dependency edges");
    assert.equal(candidate.ownerBasis, "layering-law", "no package depends on the other, so this is the layering-law signal, not a dependency-graph one");
    assert.equal(candidate.ownerEvidence[0]?.package, "@x/leaf-primitive");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not name a layering owner when two legs both seat under primitive sections, or neither does", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    const source = "export function parseOther(text) { return text.trim().split(';'); }";
    packageAt(root, "computer-data-engineering-services-section/leaf-one", "@x/leaf-one", {}, source);
    packageAt(root, "computer-code-engineering-services-section/leaf-two", "@x/leaf-two", {}, source);
    const ambiguous = workspaceDuplication(root, { minimumBytes: 1 }).candidates[0];
    assert.equal(ambiguous.owner, null, "two primitive-section legs is ambiguous, not a guess");
    assert.equal(ambiguous.ownerBasis, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not propose consolidating an encoding with its inverse", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    packageAt(root, "codec", "@x/codec", {}, "export function encode(raw) { return Buffer.from(raw, 'utf8').toString('hex'); }\nexport function decode(atom) { return Buffer.from(atom, 'hex').toString('utf8'); }");
    assert.equal(workspaceDuplication(root, { minimumBytes: 1 }).candidateCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prioritizes concentrated package-local duplication over a larger cross-package family", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    const spreadSource = "export function normalizeSource(source) { return source.trim().toLocaleUpperCase() + 'cross-package-only-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; }";
    const concentratedSource = "export function normalizeValue(value) { return value.trim().toUpperCase(); }";
    packageAt(root, "spread-one", "@x/spread-one", {}, spreadSource);
    packageAt(root, "spread-two", "@x/spread-two", {}, spreadSource);
    packageAt(root, "concentrated", "@x/concentrated", {}, concentratedSource);
    writeFileSync(path.join(root, "concentrated", "src/second.mjs"), concentratedSource);
    writeFileSync(path.join(root, "concentrated", "src/third.mjs"), concentratedSource);

    const result = workspaceDuplication(root, { minimumBytes: 1 });

    assert.equal(result.candidateCount, 2);
    assert.equal(result.candidates[0]?.packageLocalRemovableBytes, 2 * concentratedSource.length);
    assert.deepEqual(result.candidates[0]?.largestPackageConcentration, {
      package: "@x/concentrated",
      implementationCount: 3,
      totalBytes: 3 * concentratedSource.length,
      removableBytes: 2 * concentratedSource.length,
    });
    assert.equal(result.candidates[1]?.packageLocalRemovableBytes, 0);
    assert.equal(result.candidates[1]?.largestPackageConcentration.removableBytes, 0);
    assert.ok(
      (result.candidates[1]?.exactDuplicateBytes ?? 0) > (result.candidates[0]?.exactDuplicateBytes ?? 0),
      "the zero-local family would have ranked first before package-local prioritization",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("demotes tiny local adapters after charging a shared owner and every file reference", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    const tiny = "export function requireValue(value) { if (!value) throw new Error('required'); return value; }";
    const large = `export function renderValue(value) { return value.trim().toUpperCase() + '${"x".repeat(1_200)}'; }`;
    packageAt(root, "tiny", "@x/tiny", {}, tiny);
    for (let index = 1; index < 20; index++) {
      writeFileSync(path.join(root, "tiny", "src", `adapter-${index}.mjs`), tiny);
    }
    packageAt(root, "large", "@x/large", {}, large);
    writeFileSync(path.join(root, "large", "src", "second.mjs"), large);
    writeFileSync(path.join(root, "large", "src", "third.mjs"), large);

    const result = workspaceDuplication(root, { minimumBytes: 1 });
    const tinyCandidate = result.candidates.find((candidate) => candidate.packages.includes("@x/tiny"));
    const largeCandidate = result.candidates.find((candidate) => candidate.packages.includes("@x/large"));

    assert.ok(tinyCandidate);
    assert.ok(largeCandidate);
    assert.equal(tinyCandidate.estimatedSharedOwnerBytes, tiny.length);
    assert.equal(tinyCandidate.estimatedReferenceOverheadBytes, 20 * CONSERVATIVE_FILE_REFERENCE_OVERHEAD_BYTES);
    assert.ok(tinyCandidate.estimatedNetByteSavings < 0, "many tiny adapters are theoretical, not actionable");
    assert.equal(largeCandidate.estimatedSharedOwnerBytes, large.length);
    assert.equal(largeCandidate.estimatedReferenceOverheadBytes, 3 * CONSERVATIVE_FILE_REFERENCE_OVERHEAD_BYTES);
    assert.ok(largeCandidate.estimatedNetByteSavings > 0, "a concentrated large implementation remains actionable");
    assert.equal(result.candidates[0]?.semanticFingerprint, largeCandidate.semanticFingerprint);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps workspace consumer evidence when scope limits duplicate extraction", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    packageAt(root, "providers/core", "@x/core", {}, "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    packageAt(root, "providers/site", "@x/site", {}, "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    packageAt(root, "applications/consumer", "@x/consumer", { "@x/core": "1.0.0" }, "export function other(path) { return writeFileSync(path, 'x'); }");

    const result = workspaceDuplication(root, { minimumBytes: 1, scope: "providers" });

    assert.equal(result.analyzedPackages, 2);
    assert.equal(result.candidateCount, 1);
    assert.ok((result.candidates[0]?.exactDuplicateBytes ?? 0) > 0);
    assert.deepEqual(result.candidates[0]?.packages, ["@x/core", "@x/site"]);
    assert.deepEqual(result.candidates[0]?.consumers, ["@x/consumer"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("attributes nested physical sources once and excludes generated or vendored artifacts", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    packageAt(root, "suite", "@x/suite", {}, "export function suiteOnly(path) { return writeFileSync(path, 'suite'); }");
    packageAt(root, "suite/apps/one", "@x/one", {}, "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    packageAt(root, "suite/apps/two", "@x/two", { "@x/one": "1.0.0" }, "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    packageAt(root, "suite/vendor/copied", "@x/vendor-copy", {}, "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    packageAt(root, "suite/test/fixtures/copied", "@x/fixture-copy", {}, "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    packageAt(root, "suite/lib/legacy/copied", "@x/legacy-copy", {}, "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    const artifact = path.join(root, "suite/apps/two/.lake/packages/verso/vendored-js/katex");
    mkdirSync(artifact, { recursive: true });
    writeFileSync(path.join(artifact, "katex.js"), "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    const generated = path.join(root, "suite/apps/two/generated");
    mkdirSync(generated, { recursive: true });
    writeFileSync(path.join(generated, "mirror.mjs"), "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    // A `wrangler dev` run bundles a site's whole dependency graph, minified,
    // under .wrangler/tmp/dev-*/index.js — reproduced 2026-09-06, this crashed
    // workspace duplication analysis entirely (no top-level declaration found
    // for the bundle's own minified anonymous behaviors) before it was added
    // to the artifact-directory exclusion list.
    const wranglerTmp = path.join(root, "suite/apps/two/.wrangler/tmp/dev-abc123");
    mkdirSync(wranglerTmp, { recursive: true });
    writeFileSync(path.join(wranglerTmp, "index.js"), "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");

    const result = workspaceDuplication(root, { minimumBytes: 1 });
    assert.equal(result.analyzedPackages, 3);
    assert.equal(result.candidateCount, 1);
    assert.deepEqual(result.candidates[0]?.packages, ["@x/one", "@x/two"]);
    assert.deepEqual(result.candidates[0]?.consumers, ["@x/two"]);
    assert.equal(result.candidates[0]?.implementations.length, 2);
    assert.ok(result.nestedPackageSourceFilesExcluded >= 2, "ancestor package scans do not reattribute child files");
    assert.equal(result.artifactSourceFilesExcluded, 3);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("detail:false (the default) caps a candidate's implementations while implementationCount stays the true total", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    const source = "export function pingValue(value) { return value == null ? 'unset' : String(value); }";
    packageAt(root, "many", "@x/many", {}, source);
    for (let index = 1; index <= 6; index++) {
      writeFileSync(path.join(root, "many", "src", `site-${index}.mjs`), source);
    }

    const compact = workspaceDuplication(root, { minimumBytes: 1 });
    assert.equal(compact.candidates[0]?.implementationCount, 7);
    assert.equal(compact.candidates[0]?.implementations.length, 5, "compact view caps the array, not the count");

    const full = workspaceDuplication(root, { minimumBytes: 1, detail: true });
    assert.equal(full.candidates[0]?.implementationCount, 7);
    assert.equal(full.candidates[0]?.implementations.length, 7, "detail:true returns every implementation site");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("offset pages past already-ranked candidates while candidateCount stays the full unpaged total", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    const spreadSource = "export function normalizeSource(source) { return source.trim().toLocaleUpperCase() + 'cross-package-only-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; }";
    const concentratedSource = "export function normalizeValue(value) { return value.trim().toUpperCase(); }";
    packageAt(root, "spread-one", "@x/spread-one", {}, spreadSource);
    packageAt(root, "spread-two", "@x/spread-two", {}, spreadSource);
    packageAt(root, "concentrated", "@x/concentrated", {}, concentratedSource);
    writeFileSync(path.join(root, "concentrated", "src", "second.mjs"), concentratedSource);
    writeFileSync(path.join(root, "concentrated", "src", "third.mjs"), concentratedSource);

    const whole = workspaceDuplication(root, { minimumBytes: 1 });
    assert.equal(whole.candidateCount, 2);

    const firstPage = workspaceDuplication(root, { minimumBytes: 1, limit: 1 });
    const secondPage = workspaceDuplication(root, { minimumBytes: 1, offset: 1, limit: 1 });
    assert.equal(firstPage.candidateCount, 2);
    assert.equal(secondPage.candidateCount, 2, "candidateCount reports the full total regardless of offset");
    assert.equal(firstPage.candidates.length, 1);
    assert.equal(secondPage.candidates.length, 1);
    assert.equal(firstPage.candidates[0]?.semanticFingerprint, whole.candidates[0]?.semanticFingerprint);
    assert.equal(secondPage.candidates[0]?.semanticFingerprint, whole.candidates[1]?.semanticFingerprint);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skips a file the behavior analyzer cannot extract from, instead of losing the whole scan (reproduced 2026-09-06 against a real bundled site's minified .wrangler output)", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    packageAt(root, "core", "@x/core", {}, "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    packageAt(root, "site", "@x/site", { "@x/core": "1.0.0" }, "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    // Deeply nested arrow functions overflow the analyzer's own AST walk —
    // the real crash was a minified bundle, this is a minimal stand-in that
    // throws for the same reason (RangeError, not a parse error).
    const unanalyzable = "(" + "()=>(".repeat(20000) + "1" + ")".repeat(20000) + ")();";
    writeFileSync(path.join(root, "site/src/unanalyzable.mjs"), unanalyzable);

    const result = workspaceDuplication(root, { minimumBytes: 1 });
    assert.equal(result.candidateCount, 1, "the real duplicate is still found despite the unrelated bad file");
    assert.deepEqual(result.candidates[0]?.packages, ["@x/core", "@x/site"]);
    assert.equal(result.unanalyzableSourceFiles.length, 1);
    assert.ok(result.unanalyzableSourceFiles[0]?.endsWith("unanalyzable.mjs"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("excludes source-marked generated carriers outside artifact directories", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  try {
    packageAt(root, "author", "@x/author", {}, "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    packageAt(root, "projection", "@x/projection", {}, "// @generated by fixture\nexport function readText(file) { return readFileSync(file, 'utf8').trim(); }");

    const result = workspaceDuplication(root, { minimumBytes: 1 });

    assert.equal(result.analyzedFiles, 1);
    assert.equal(result.artifactSourceFilesExcluded, 1);
    assert.equal(result.candidateCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reuses content-addressed extraction results and invalidates them when source changes", () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-"));
  const cacheDir = path.join(root, ".jsnode-duplication-cache");
  try {
    packageAt(root, "one", "@x/one", {}, "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    packageAt(root, "two", "@x/two", {}, "export function readText(file) { return readFileSync(file, 'utf8').trim(); }");
    const first = workspaceDuplication(root, { minimumBytes: 1, cacheDir });
    const entries = readdirSync(cacheDir).filter((entry) => entry.endsWith(".json"));
    assert.equal(entries.length, 1, "identical sources share one content-addressed extraction entry");
    const entryPath = path.join(cacheDir, entries[0]);
    const cached = JSON.parse(readFileSync(entryPath, "utf8"));
    const analyzer = JSON.parse(readFileSync(new URL(import.meta.resolve("@red-cup-engineering/javascript-computer/package.json")), "utf8"));
    assert.equal(cached.analyzerVersion, `${analyzer.name}@${analyzer.version}`);
    writeFileSync(entryPath, JSON.stringify({ ...cached, analyzerVersion: "stale-analyzer", behaviors: [] }));
    const repeated = workspaceDuplication(root, { minimumBytes: 1, cacheDir });
    assert.deepEqual(repeated, first, "an incompatible analyzer cache is recomputed");
    assert.deepEqual(workspaceDuplication(root, { minimumBytes: 1, cacheDir }), first, "a cache hit leaves the ranking report unchanged");

    writeFileSync(path.join(root, "two", "src/index.mjs"), "export function writeText(file) { return writeFileSync(file, 'changed'); }");
    const invalidated = workspaceDuplication(root, { minimumBytes: 1, cacheDir });
    const uncached = workspaceDuplication(root, { minimumBytes: 1 });
    assert.deepEqual(invalidated, uncached, "a changed source cannot reuse its previous extraction");
    assert.equal(invalidated.candidateCount, 0);
    assert.equal(readdirSync(cacheDir).filter((entry) => entry.endsWith(".json")).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
