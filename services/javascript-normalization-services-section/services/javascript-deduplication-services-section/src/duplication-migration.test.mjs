import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { workspaceDuplication } from "./duplication.mjs";
import { callableSubstitutionForm } from "@red-cup-engineering/javascript-computer";
import {
  applyDuplicationMigrationPlan,
  planDuplicationMigration,
  planDuplicationMigrationBatch,
  applyDuplicationMigrationBatch,
  applyOwnerExportPromotions,
  ownerPublishedExportPresent,
  applyPackageEditsWithTestGate,
} from "./duplication-migration.mjs";

function packageAt(root, dir, manifest, files) {
  const target = path.join(root, dir);
  mkdirSync(target, { recursive: true });
  writeFileSync(path.join(target, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
  for (const [rel, content] of Object.entries(files)) {
    const filePath = path.join(target, rel);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  // Every fixture starts with its dependencies already "installed" so the
  // batch apply gates' ensureInstalledForTests skips straight to `npm test`
  // — exactly the fixtures below that exercise the install gate itself
  // remove this directory afterward.
  mkdirSync(path.join(target, "node_modules"), { recursive: true });
  return target;
}

/** Writes a fake `npm` at `<binDir>/npm` that appends its argv to `logPath`
 *  as one JSON line per invocation and exits with the code named by
 *  `FAKE_NPM_INSTALL_EXIT` (for `ci`/`install`) or `FAKE_NPM_TEST_EXIT`
 *  (for `test`) in its environment, defaulting to 0 — lets a test observe
 *  and control ensureInstalledForTests's spawned `npm` without ever
 *  running the real one. */
function writeFakeNpm(binDir, logPath) {
  mkdirSync(binDir, { recursive: true });
  const script = [
    "#!/usr/bin/env node",
    "const fs = require(\"node:fs\");",
    `const logPath = ${JSON.stringify(logPath)};`,
    "const argv = process.argv.slice(2);",
    "fs.appendFileSync(logPath, JSON.stringify(argv) + \"\\n\");",
    "const exitVar = argv[0] === \"test\" ? \"FAKE_NPM_TEST_EXIT\" : \"FAKE_NPM_INSTALL_EXIT\";",
    "process.exit(Number(process.env[exitVar] ?? \"0\"));",
    "",
  ].join("\n");
  writeFileSync(path.join(binDir, "npm"), script, { mode: 0o755 });
}

/** The fake npm's logged invocations as parsed argv arrays, in call order,
 *  or an empty array when the log was never written (no invocation). */
function fakeNpmInvocations(logPath) {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8").split("\n").filter((line) => line.trim() !== "").map((line) => JSON.parse(line));
}

/** A single package whose src/index.mjs and src/helper.mjs duplicate one
 *  another (`canonical`/`canonicalToo`, both `x + 1`) — a within-package
 *  duplication candidate on its own, sufficient to exercise the batch
 *  apply gates without a second package. */
function buildInstallGateWorkspace(root, dir, name) {
  packageAt(root, dir, {
    name,
    version: "1.0.0",
    exports: { ".": "./src/index.mjs" },
    dependencies: {},
    scripts: { test: "node --test test.mjs" },
  }, {
    "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    "src/helper.mjs": "export function canonicalToo(x) { return x + 1; }\n",
    "test.mjs": [
      "import assert from \"node:assert/strict\";",
      "import test from \"node:test\";",
      "import { canonical } from \"./src/index.mjs\";",
      "import { canonicalToo } from \"./src/helper.mjs\";",
      "test(\"both compute x + 1\", () => {",
      "  assert.equal(canonical(1), 2);",
      "  assert.equal(canonicalToo(1), 2);",
      "});",
      "",
    ].join("\n"),
  });
}

/** A fetchImpl stub reporting the registry has nothing for any request —
 *  exercises ownerPublishedExportPresent's conservative "absent" fallback
 *  without ever making a real network call. */
const ABSENT_FETCH = (async () => new Response(null, { status: 404 }));

/** Build a minimal, real single-file POSIX ustar tar entry (correct name,
 *  size, and checksum fields) — genuine enough for `ownerPublishedExportPresent`'s
 *  own minimal parser and its dedicated end-to-end fixture test. */
function buildMinimalTar(entryName, content) {
  const contentBuffer = Buffer.from(content, "utf8");
  const header = Buffer.alloc(512);
  header.write(entryName, 0, "ascii");
  header.write("0000644\0", 100, "ascii");
  header.write("0000000\0", 108, "ascii");
  header.write("0000000\0", 116, "ascii");
  header.write(`${contentBuffer.length.toString(8).padStart(11, "0")}\0`, 124, "ascii");
  header.write("00000000000\0", 136, "ascii");
  header.write("        ", 148, "ascii");
  header.write("0", 156, "ascii");
  header.write("ustar\0", 257, "ascii");
  header.write("00", 263, "ascii");
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  const paddedContent = Buffer.alloc(Math.ceil(contentBuffer.length / 512) * 512);
  contentBuffer.copy(paddedContent);
  return Buffer.concat([header, paddedContent, Buffer.alloc(1024)]);
}

function buildHappyPathWorkspace(root) {
  packageAt(root, "owner", {
    name: "@scope/owner",
    version: "1.2.3",
    exports: { ".": "./src/index.mjs" },
    dependencies: {},
  }, {
    "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
  });
  packageAt(root, "consumer-a", {
    name: "@scope/consumer-a",
    version: "1.0.0",
    dependencies: {},
  }, {
    // Byte-different (renamed local parameter) but semantically identical, and never exported.
    "src/index.mjs": "function canonical(value) { return value + 1; }\n",
  });
  packageAt(root, "consumer-b", {
    name: "@scope/consumer-b",
    version: "1.0.0",
    dependencies: { "@scope/owner": "1.2.3" },
  }, {
    "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
  });
}

test("plans migrating a cross-package duplicate onto an explicit owner: finds the export, both sites, one manifest edit, no refusals", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-"));
  try {
    buildHappyPathWorkspace(root);
    const plan = await planDuplicationMigration(root, { rank: 1 }, { owner: "@scope/owner", minimumBytes: 1 });

    assert.equal(plan.kind, "jsnode.duplication-migration.plan");
    assert.equal(plan.owner, "@scope/owner");
    assert.deepEqual(plan.refusals, []);
    assert.equal(plan.applicable, true);
    assert.ok(plan.ownerExport);
    assert.deepEqual(plan.ownerExport, { file: "src/index.mjs", name: "canonical", subpath: "." });

    assert.equal(plan.sites.length, 2);
    const byPackage = new Map(plan.sites.map((site) => [site.package, site]));
    const siteA = byPackage.get("@scope/consumer-a");
    const siteB = byPackage.get("@scope/consumer-b");
    assert.ok(siteA);
    assert.ok(siteB);
    assert.equal(siteA.wasExported, false);
    assert.equal(siteB.wasExported, true);
    for (const site of [siteA, siteB]) {
      assert.equal(site.action, "replace-declaration-with-import");
      assert.equal(site.importSpecifier, "@scope/owner");
      assert.equal(site.importedName, "canonical");
      assert.equal(site.localName, "canonical");
    }

    assert.deepEqual(plan.manifestEdits, [{ package: "@scope/consumer-a", dependency: "@scope/owner", version: "1.2.3" }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--apply rewrites both sites, re-exports the previously-exported one, adds the missing dependency, and clears the duplicate", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-"));
  try {
    buildHappyPathWorkspace(root);
    const plan = await planDuplicationMigration(root, { rank: 1 }, { owner: "@scope/owner", minimumBytes: 1 });
    assert.equal(plan.applicable, true);

    const applied = applyDuplicationMigrationPlan(root, plan);
    assert.ok(applied.applied);
    assert.equal(applied.applied.length, 3); // two rewritten source files + one rewritten manifest

    const consumerAFile = readFileSync(path.join(root, "consumer-a/src/index.mjs"), "utf8");
    assert.match(consumerAFile, /import \{ canonical \} from "@scope\/owner";/u);
    assert.doesNotMatch(consumerAFile, /function canonical/u);

    const consumerBFile = readFileSync(path.join(root, "consumer-b/src/index.mjs"), "utf8");
    assert.match(consumerBFile, /import \{ canonical \} from "@scope\/owner";/u);
    assert.match(consumerBFile, /export \{ canonical \};/u);
    assert.doesNotMatch(consumerBFile, /function canonical\(/u);

    const consumerAManifest = JSON.parse(readFileSync(path.join(root, "consumer-a/package.json"), "utf8"));
    assert.equal(consumerAManifest.dependencies["@scope/owner"], "1.2.3");

    const afterReport = workspaceDuplication(root, { minimumBytes: 1 });
    assert.ok(!afterReport.candidates.some((candidate) => candidate.semanticFingerprint === plan.candidate.semanticFingerprint));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses with owner-not-exporting-fingerprint, applicable:false, promoteOwnerExport:null, and writes nothing when apply is attempted anyway (owner has NO implementation of the fingerprint at all)", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-"));
  try {
    // The named --owner has no matching implementation whatsoever (not even
    // an unexported one): the duplicate family lives entirely between
    // consumer-a and consumer-e, so no promotion is possible either.
    packageAt(root, "owner", {
      name: "@scope/owner",
      version: "1.0.0",
      exports: { ".": "./src/index.mjs" },
      dependencies: {},
    }, {
      "src/index.mjs": "export function unrelatedOwnerThing(x) { return x - 1; }\n",
    });
    packageAt(root, "consumer-a", {
      name: "@scope/consumer-a",
      version: "1.0.0",
      dependencies: { "@scope/owner": "1.0.0" },
    }, {
      "src/index.mjs": "function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "consumer-e", {
      name: "@scope/consumer-e",
      version: "1.0.0",
      dependencies: { "@scope/consumer-a": "1.0.0" },
    }, {
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    });

    const plan = await planDuplicationMigration(root, { rank: 1 }, { owner: "@scope/owner", minimumBytes: 1 });
    assert.equal(plan.applicable, false);
    assert.deepEqual(plan.refusals, [{
      reason: "owner-not-exporting-fingerprint",
      detail: "@scope/owner has no exported implementation matching fingerprint " + plan.candidate.semanticFingerprint,
    }]);
    assert.equal(plan.ownerExport, null);
    assert.equal(plan.promoteOwnerExport, null);
    assert.equal(plan.ownerRepublishRequired, false);

    const before = readFileSync(path.join(root, "consumer-a/src/index.mjs"), "utf8");
    const applied = applyDuplicationMigrationPlan(root, plan);
    assert.equal(applied.applied, undefined);
    const after = readFileSync(path.join(root, "consumer-a/src/index.mjs"), "utf8");
    assert.equal(before, after, "a non-applicable plan must never write");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses with local-name-collision when a site already binds the owner's exported name from elsewhere", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-"));
  try {
    packageAt(root, "owner", {
      name: "@scope/owner",
      version: "1.0.0",
      exports: { ".": "./src/index.mjs" },
      dependencies: {},
    }, {
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "consumer-c", {
      name: "@scope/consumer-c",
      version: "1.0.0",
      dependencies: {},
    }, {
      // Already binds "canonical" from an unrelated module; the duplicate itself
      // is named differently, so the collision can only be about importedName.
      "src/index.mjs": [
        "import { canonical } from \"@scope/unrelated\";",
        "function otherCanonical(x) { return x + 1; }",
        "",
      ].join("\n"),
    });
    packageAt(root, "consumer-d", {
      name: "@scope/consumer-d",
      version: "1.0.0",
      dependencies: { "@scope/owner": "1.0.0" },
    }, {
      "src/index.mjs": "export function unrelatedThing() { return 1; }\n",
    });

    const plan = await planDuplicationMigration(root, { rank: 1 }, { owner: "@scope/owner", minimumBytes: 1 });
    assert.equal(plan.applicable, false);
    assert.equal(plan.refusals.length, 1);
    assert.equal(plan.refusals[0]?.reason, "local-name-collision");
    assert.equal(plan.sites.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses with no-owner when no --owner is given and the candidate has no owner", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-"));
  try {
    buildHappyPathWorkspace(root);
    const plan = await planDuplicationMigration(root, { rank: 1 }, { minimumBytes: 1 });
    assert.deepEqual(plan.refusals, [{
      reason: "no-owner",
      detail: "no --owner given and the candidate has no owner",
    }]);
    assert.equal(plan.owner, null);
    assert.equal(plan.applicable, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("defaults to the org-layering owner over a plain dependency-graph owner (org-layering, 2026-09-06)", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-"));
  try {
    packageAt(root, "computer-data-engineering-services-section/owner", {
      name: "@scope/data-owner",
      version: "1.0.0",
      exports: { ".": "./src/index.mjs" },
      dependencies: {},
    }, {
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "consumer", {
      name: "@scope/consumer",
      version: "1.0.0",
      dependencies: {},
    }, {
      // Byte-different, no dependency on data-owner: the dependency-graph
      // signal alone stays null (no edge to derive it from), so before this
      // fix the batch planner dropped this candidate entirely — never even
      // reported as a refusal — despite the law naming an owner for it.
      "src/index.mjs": "function canonical(value) { return value + 1; }\n",
    });
    // --rank requires a consumer-backed candidate; this package supplies one
    // without affecting `owner` (it does not implement the duplicate, so it
    // never enters candidate.packages).
    packageAt(root, "user", {
      name: "@scope/user",
      version: "1.0.0",
      dependencies: { "@scope/consumer": "1.0.0" },
    }, {
      "src/index.mjs": "export function unrelated() { return 0; }\n",
    });

    const plan = await planDuplicationMigration(root, { rank: 1 }, { minimumBytes: 1 });
    assert.equal(plan.owner, "@scope/data-owner");
    assert.equal(plan.applicable, true, JSON.stringify(plan.refusals));

    const batch = await planDuplicationMigrationBatch(root, { minimumBytes: 1 });
    assert.equal(batch.planned, 1, "the layering owner must make this candidate reachable even with no dependency edge");
    assert.equal(batch.plans[0]?.owner, "@scope/data-owner");
    assert.equal(batch.applicable, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("within-package mode canonicalizes a single-package, cross-file candidate onto the manifest-exported implementation, as a relative import", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-"));
  try {
    // Two implementations of the same fingerprint, both inside one package: this
    // candidate has packages.length === 1, so --rank's cross-package filter would
    // never surface it — --fingerprint names it directly instead. Only "canonical"
    // is reachable through the package's own exports map (rule 1).
    packageAt(root, "owner", {
      name: "@scope/owner",
      version: "1.0.0",
      exports: { ".": "./src/index.mjs" },
      dependencies: {},
    }, {
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
      "src/second.mjs": "export function canonicalToo(x) { return x + 1; }\n",
    });

    const report = workspaceDuplication(root, { minimumBytes: 1 });
    const target = report.candidates.find((candidate) => candidate.packages.length === 1);
    assert.ok(target, "the fixture must produce a single-package duplicate family");

    const plan = await planDuplicationMigration(root, { fingerprint: target.semanticFingerprint }, { minimumBytes: 1 });
    assert.equal(plan.applicable, true, JSON.stringify(plan.refusals));
    assert.equal(plan.owner, "@scope/owner");
    assert.deepEqual(plan.manifestEdits, []);
    assert.equal(plan.sites.length, 1);
    const site = plan.sites[0];
    assert.equal(site.action, "replace-declaration-with-import");
    assert.equal(site.file, "src/second.mjs");
    assert.equal(site.importedName, "canonical");
    assert.equal(site.localName, "canonicalToo");
    if (site.action === "replace-declaration-with-import") {
      assert.equal(site.importSpecifier, "./index.mjs");
    }

    const applied = applyDuplicationMigrationPlan(root, plan);
    assert.ok(applied.applied);
    assert.equal(applied.applied.length, 1);
    const secondFile = readFileSync(path.join(root, "owner/src/second.mjs"), "utf8");
    assert.match(secondFile, /import \{ canonical as canonicalToo \} from "\.\/index\.mjs";/u);
    assert.match(secondFile, /export \{ canonicalToo \};/u);
    assert.doesNotMatch(secondFile, /function canonicalToo\(/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolves an owner's exports target naming an unbuilt dist/index.mjs to its src/index.mjs, tagging resolvedVia", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-"));
  try {
    packageAt(root, "owner", {
      name: "@scope/owner",
      version: "1.2.3",
      // No dist/ directory exists anywhere in this fixture: the checkout is unbuilt.
      exports: { ".": "./dist/index.mjs" },
      dependencies: {},
    }, {
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "consumer-a", {
      name: "@scope/consumer-a",
      version: "1.0.0",
      dependencies: { "@scope/owner": "1.2.3" },
    }, {
      "src/index.mjs": "function canonical(value) { return value + 1; }\n",
    });

    const plan = await planDuplicationMigration(root, { rank: 1 }, { owner: "@scope/owner", minimumBytes: 1 });
    assert.equal(plan.applicable, true, JSON.stringify(plan.refusals));
    assert.deepEqual(plan.ownerExport, { file: "src/index.mjs", name: "canonical", subpath: ".", resolvedVia: "source-of-dist" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resolves a dist output built with rootDir '.' (dist/src/index.mjs) back to src/index.mjs, not src/src/index.mjs", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-"));
  try {
    // The exact shape that produced the real-tree friction: a package whose
    // tsconfig.build.json mirrors the whole package root into dist/ (rootDir
    // "."), so its main points at "./dist/src/index.mjs" — the naive
    // dist/ -> src/ prefix swap this module used to perform would look for
    // "src/src/index.mjs", which never exists.
    packageAt(root, "owner", {
      name: "@scope/owner",
      version: "1.2.3",
      main: "./dist/src/index.mjs",
      dependencies: {},
    }, {
      "tsconfig.build.json": JSON.stringify({
        extends: "./tsconfig.json",
        compilerOptions: { rootDir: ".", outDir: "dist" },
        include: ["src/**/*.mjs"],
      }, null, 2) + "\n",
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "consumer-a", {
      name: "@scope/consumer-a",
      version: "1.0.0",
      dependencies: { "@scope/owner": "1.2.3" },
    }, {
      "src/index.mjs": "function canonical(value) { return value + 1; }\n",
    });

    const plan = await planDuplicationMigration(root, { rank: 1 }, { owner: "@scope/owner", minimumBytes: 1 });
    assert.equal(plan.applicable, true, JSON.stringify(plan.refusals));
    assert.deepEqual(plan.ownerExport, { file: "src/index.mjs", name: "canonical", subpath: ".", resolvedVia: "source-of-dist" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("within-package mode aliases a same-file duplicate onto the exported one, re-exporting the alias where the duplicate was exported", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-"));
  try {
    packageAt(root, "owner", {
      name: "@scope/owner",
      version: "1.0.0",
      exports: { ".": "./src/index.mjs" },
      dependencies: {},
    }, {
      // Two duplicates in ONE file: both are reachable through the package's
      // "." export (they share its target file), so rule 1 ties and rule 2
      // (in-package reference count) picks "canonical", which the trailing
      // `total` line references twice while "canonicalToo" is never called.
      "src/index.mjs": [
        "export function canonical(x) { return x + 1; }",
        "export function canonicalToo(x) { return x + 1; }",
        "export const total = canonical(1) + canonical(2);",
        "",
      ].join("\n"),
    });

    const report = workspaceDuplication(root, { minimumBytes: 1 });
    const target = report.candidates.find((candidate) => candidate.packages.length === 1);
    assert.ok(target, "the fixture must produce a single-package duplicate family");

    const plan = await planDuplicationMigration(root, { fingerprint: target.semanticFingerprint }, { minimumBytes: 1 });
    assert.equal(plan.applicable, true, JSON.stringify(plan.refusals));
    assert.equal(plan.sites.length, 1);
    const site = plan.sites[0];
    assert.equal(site.action, "replace-declaration-with-alias");
    assert.equal(site.file, "src/index.mjs");
    assert.equal(site.importedName, "canonical");
    assert.equal(site.localName, "canonicalToo");
    assert.equal(site.wasExported, true);

    const applied = applyDuplicationMigrationPlan(root, plan);
    assert.ok(applied.applied);
    assert.equal(applied.applied.length, 1);
    const rewritten = readFileSync(path.join(root, "owner/src/index.mjs"), "utf8");
    assert.match(rewritten, /export function canonical\(x\) \{ return x \+ 1; \}/u);
    assert.match(rewritten, /const canonicalToo = canonical;/u);
    assert.match(rewritten, /export \{ canonicalToo \};/u);
    assert.doesNotMatch(rewritten, /function canonicalToo\(x\)/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps distinct validator wrapper contracts separate in strict comparison and discovery", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-validators-"));
  try {
    const chatWrapper = "export function chat(value) { return chatContract.assert(value, \"chat\"); }";
    const modelsWrapper = "export function models(value) { return modelsContract.assert(value, \"models\"); }";
    assert.notEqual(
      callableSubstitutionForm(chatWrapper, "chat.mjs", "chat"),
      callableSubstitutionForm(modelsWrapper, "models.mjs", "models"),
      "the strict gate retains the captured validator and label that discovery used to erase",
    );
    packageAt(root, "within", {
      name: "@scope/within", version: "1.0.0", exports: { ".": "./src/index.mjs" }, dependencies: {},
    }, {
      "src/index.mjs": "export { chat } from \"./chat.mjs\"; export { models } from \"./models.mjs\";\n",
      "src/chat.mjs": "import { chatContract } from \"./chat-contract.mjs\"; export function chat(value: unknown) { return chatContract.assert(value, \"chat\") as unknown; }\n",
      "src/models.mjs": "import { modelsContract } from \"./models-contract.mjs\"; export function models(value: unknown) { return modelsContract.assert(value, \"models\") as unknown; }\n",
      "src/chat-contract.mjs": "export const chatContract = { assert(input: unknown, label: string) { return { kind: \"chat\", label, input }; } };\n",
      "src/models-contract.mjs": "export const modelsContract = { assert(input: unknown, label: string) { return { kind: \"models\", label, input }; } };\n",
    });
    const withinReport = workspaceDuplication(root, { minimumBytes: 1, detail: true });
    const withinCandidate = withinReport.candidates.find((candidate) => candidate.implementations.some((site) => site.name === "chat")
      && candidate.implementations.some((site) => site.name === "models"));
    assert.equal(withinCandidate, undefined, "the current analyzer also keeps separate contracts out of a within-package candidate");

    packageAt(root, "owner", {
      name: "@scope/owner", version: "1.0.0", exports: { ".": "./src/index.mjs" }, dependencies: {},
    }, {
      "src/index.mjs": "export { chat } from \"./chat.mjs\";\n",
      "src/chat.mjs": "import { chatContract } from \"./chat-contract.mjs\"; export function chat(value: unknown) { return chatContract.assert(value, \"chat\") as unknown; }\n",
      "src/chat-contract.mjs": "export const chatContract = { assert(input: unknown, label: string) { return { kind: \"chat\", label, input }; } };\n",
    });
    packageAt(root, "consumer", {
      name: "@scope/consumer", version: "1.0.0", dependencies: { "@scope/owner": "1.0.0" },
    }, {
      "src/index.mjs": "import { modelsContract } from \"./models-contract.mjs\"; export function models(value: unknown) { return modelsContract.assert(value, \"models\") as unknown; }\n",
      "src/models-contract.mjs": "export const modelsContract = { assert(input: unknown, label: string) { return { kind: \"models\", label, input }; } };\n",
    });
    const crossReport = workspaceDuplication(root, { minimumBytes: 1, detail: true });
    const crossCandidate = crossReport.candidates.find((candidate) => candidate.packages.includes("@scope/owner")
      && candidate.packages.includes("@scope/consumer") && candidate.implementations.some((site) => site.name === "chat")
      && candidate.implementations.some((site) => site.name === "models"));
    assert.equal(crossCandidate, undefined, "the current analyzer also keeps separate contracts out of a cross-package candidate");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// Two independent single-package candidates with structurally distinct bodies
// (an addition vs. a multiplication, so normalized-literal matching can never
// merge them into one cross-package family): pkg-ok's migration keeps its
// test green, pkg-broken's migration breaks a test asserting the duplicate's
// own `.name` — aliasing/importing binds the SAME function object (named
// after the canonical), so `.name` changes even though behavior does not.
function buildBatchWorkspace(root) {
  packageAt(root, "pkg-ok", {
    name: "@batch/pkg-ok",
    version: "1.0.0",
    exports: { ".": "./src/index.mjs" },
    dependencies: {},
    scripts: { test: "node --test test.mjs" },
  }, {
    "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    "src/helper.mjs": "export function canonicalToo(x) { return x + 1; }\n",
    "test.mjs": [
      "import assert from \"node:assert/strict\";",
      "import test from \"node:test\";",
      "import { canonical } from \"./src/index.mjs\";",
      "import { canonicalToo } from \"./src/helper.mjs\";",
      "test(\"both compute x + 1\", () => {",
      "  assert.equal(canonical(1), 2);",
      "  assert.equal(canonicalToo(1), 2);",
      "});",
      "",
    ].join("\n"),
  });
  packageAt(root, "pkg-broken", {
    name: "@batch/pkg-broken",
    version: "1.0.0",
    exports: { ".": "./src/index.mjs" },
    dependencies: {},
    scripts: { test: "node --test test.mjs" },
  }, {
    "src/index.mjs": "export function canonical(x) { return x * 2; }\n",
    "src/helper.mjs": "export function canonicalToo(x) { return x * 2; }\n",
    "test.mjs": [
      "import assert from \"node:assert/strict\";",
      "import test from \"node:test\";",
      "import { canonicalToo } from \"./src/helper.mjs\";",
      "test(\"canonicalToo keeps its own declared name\", () => {",
      "  assert.equal(canonicalToo.name, \"canonicalToo\");",
      "});",
      "",
    ].join("\n"),
  });
}

test("--batch without --apply plans a report and writes nothing", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-batch-"));
  try {
    buildBatchWorkspace(root);
    const before = readFileSync(path.join(root, "pkg-ok/src/helper.mjs"), "utf8");
    const batch = await planDuplicationMigrationBatch(root, { minimumBytes: 1 });
    assert.equal(batch.kind, "jsnode.duplication-migration.batch");
    assert.equal(batch.planned, 2);
    assert.equal(batch.applicable, 2);
    assert.equal(batch.plans.length, batch.planned);
    assert.equal(batch.packageResults, undefined);
    const after = readFileSync(path.join(root, "pkg-ok/src/helper.mjs"), "utf8");
    assert.equal(before, after, "planning must never write");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--batch --apply commits pkg-ok (tests still pass) and reverts pkg-broken byte-for-byte (tests fail), package by package", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-batch-"));
  try {
    buildBatchWorkspace(root);
    const okHelperBefore = readFileSync(path.join(root, "pkg-ok/src/helper.mjs"), "utf8");
    const brokenHelperBefore = readFileSync(path.join(root, "pkg-broken/src/helper.mjs"), "utf8");

    const batch = await planDuplicationMigrationBatch(root, { minimumBytes: 1 });
    assert.equal(batch.planned, 2);
    assert.equal(batch.applicable, 2);

    const applied = applyDuplicationMigrationBatch(root, batch);
    assert.ok(applied.packageResults);
    const byPackage = new Map(applied.packageResults.map((r) => [r.package, r]));

    const okHelperAfter = readFileSync(path.join(root, "pkg-ok/src/helper.mjs"), "utf8");
    assert.notEqual(okHelperAfter, okHelperBefore);
    assert.match(okHelperAfter, /import \{ canonical as canonicalToo \}/u);

    const ok = byPackage.get("@batch/pkg-ok");
    assert.ok(ok);
    assert.equal("reverted" in ok, false, JSON.stringify(ok));
    if (!("reverted" in ok)) {
      assert.equal(ok.applied, 1);
      // Honesty (spec item 3): bytesRemoved is the actual delta of the one
      // touched file, not the candidate's estimate — for this tiny fixture a
      // one-line function replaced by an import+re-export is a net GROWTH,
      // and the report must say so rather than assume dedup always shrinks.
      const expectedBytesRemoved = Buffer.byteLength(okHelperBefore, "utf8") - Buffer.byteLength(okHelperAfter, "utf8");
      assert.equal(ok.bytesRemoved, expectedBytesRemoved);
      assert.ok(ok.bytesRemoved < 0, `expected this fixture's single-site migration to grow the file, got ${ok.bytesRemoved}`);
    }

    const broken = byPackage.get("@batch/pkg-broken");
    assert.ok(broken);
    assert.equal("reverted" in broken && broken.reverted, true, JSON.stringify(broken));
    if ("reverted" in broken) {
      assert.ok(broken.failingTests && broken.failingTests.length > 0, JSON.stringify(broken));
    }
    const brokenHelperAfter = readFileSync(path.join(root, "pkg-broken/src/helper.mjs"), "utf8");
    assert.equal(brokenHelperAfter, brokenHelperBefore, "a reverted package must be restored byte-for-byte");

    const okManifest = JSON.parse(readFileSync(path.join(root, "pkg-ok/package.json"), "utf8"));
    assert.deepEqual(okManifest.dependencies, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------- promoting an owner's own unexported implementation ----------

test("plans an add-named-reexport promotion when the owner's matching implementation lives outside its entry module, and blocks sites on republish", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-promote-"));
  try {
    packageAt(root, "owner", {
      name: "@scope/owner",
      version: "1.0.0",
      exports: { ".": "./src/index.mjs" },
      dependencies: {},
    }, {
      "src/index.mjs": "export function unrelated() { return 0; }\n",
      // Present, but never exported, and not in the entry module either.
      "src/internal.mjs": "function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "consumer-a", {
      name: "@scope/consumer-a",
      version: "1.0.0",
      dependencies: {},
    }, {
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    });
    // A rank-eligible candidate needs a consumer of one of its participating
    // packages; this package supplies that without pre-wiring consumer-a's
    // own dependency, which the manifestEdits assertion below still expects.
    packageAt(root, "downstream", {
      name: "@scope/downstream",
      version: "1.0.0",
      dependencies: { "@scope/owner": "1.0.0" },
    }, {
      "src/index.mjs": "export function unrelatedDownstream() { return 1; }\n",
    });

    const plan = await planDuplicationMigration(root, { rank: 1 }, {
      owner: "@scope/owner", minimumBytes: 1, fetchImpl: ABSENT_FETCH,
    });
    assert.equal(plan.applicable, false, JSON.stringify(plan.refusals));
    assert.deepEqual(plan.promoteOwnerExport, {
      file: "src/index.mjs",
      name: "canonical",
      action: "add-named-reexport",
      declarationFile: "src/internal.mjs",
      relativeSpecifier: "./internal.mjs",
      needsDeclarationExport: true,
      subpath: ".",
    });
    assert.equal(plan.ownerRepublishRequired, true);
    assert.deepEqual(plan.refusals, [{
      reason: "owner-republish-required",
      detail: "@scope/owner's published 1.0.0 does not yet export \"canonical\" — publish it, then re-run",
    }]);

    // Sites are computed exactly as though the export already existed.
    assert.equal(plan.sites.length, 1);
    const site = plan.sites[0];
    assert.equal(site.action, "replace-declaration-with-import");
    assert.equal(site.importSpecifier, "@scope/owner");
    assert.equal(site.importedName, "canonical");
    assert.deepEqual(plan.manifestEdits, [{ package: "@scope/consumer-a", dependency: "@scope/owner", version: "1.0.0" }]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plans an add-export-keyword promotion when the owner's matching implementation already lives in its entry module", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-promote-"));
  try {
    packageAt(root, "owner", {
      name: "@scope/owner",
      version: "1.0.0",
      exports: { ".": "./src/index.mjs" },
      dependencies: {},
    }, {
      // Present in the entry module itself, but never exported.
      "src/index.mjs": "function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "consumer-a", {
      name: "@scope/consumer-a",
      version: "1.0.0",
      dependencies: {},
    }, {
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "downstream", {
      name: "@scope/downstream",
      version: "1.0.0",
      dependencies: { "@scope/owner": "1.0.0" },
    }, {
      "src/index.mjs": "export function unrelatedDownstream() { return 1; }\n",
    });

    const plan = await planDuplicationMigration(root, { rank: 1 }, {
      owner: "@scope/owner", minimumBytes: 1, fetchImpl: ABSENT_FETCH,
    });
    assert.deepEqual(plan.promoteOwnerExport, {
      file: "src/index.mjs",
      name: "canonical",
      action: "add-export-keyword",
      subpath: ".",
    });
    assert.equal(plan.ownerRepublishRequired, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses owner-export-name-collision when the entry module already exports a different declaration under the promoted name", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-promote-"));
  try {
    packageAt(root, "owner", {
      name: "@scope/owner",
      version: "1.0.0",
      exports: { ".": "./src/index.mjs" },
      dependencies: {},
    }, {
      // A DIFFERENT function, unrelated to the duplicate, already exported under the same name.
      "src/index.mjs": "export function canonical() { return \"unrelated\"; }\n",
      "src/internal.mjs": "function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "consumer-a", {
      name: "@scope/consumer-a",
      version: "1.0.0",
      dependencies: {},
    }, {
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "downstream", {
      name: "@scope/downstream",
      version: "1.0.0",
      dependencies: { "@scope/owner": "1.0.0" },
    }, {
      "src/index.mjs": "export function unrelatedDownstream() { return 1; }\n",
    });

    const plan = await planDuplicationMigration(root, { rank: 1 }, {
      owner: "@scope/owner", minimumBytes: 1, fetchImpl: ABSENT_FETCH,
    });
    assert.equal(plan.applicable, false);
    assert.equal(plan.promoteOwnerExport, null);
    assert.ok(plan.refusals.some((r) => r.reason === "owner-not-exporting-fingerprint"), JSON.stringify(plan.refusals));
    assert.ok(plan.refusals.some((r) => r.reason === "owner-export-name-collision"), JSON.stringify(plan.refusals));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ownerPublishedExportPresent parses a real minimal gzip'd tarball fixture end to end", async () => {
  const tarBuffer = buildMinimalTar("package/dist/index.mjs", "export function canonical(x) { return x + 1; }\n");
  const gzipped = gzipSync(tarBuffer);
  const manifest = {
    name: "@scope/owner",
    version: "1.0.0",
    exports: { ".": "./dist/index.mjs" },
    dist: { tarball: "https://fake-registry.invalid/owner/-/owner-1.0.0.tgz" },
  };
  const fetchImpl = (async (input) => {
    const href = typeof input === "string" ? input : input.toString();
    if (href.endsWith(".tgz")) return new Response(gzipped);
    return new Response(JSON.stringify(manifest));
  });

  const present = await ownerPublishedExportPresent("https://fake-registry.invalid", "@scope/owner", "1.0.0", "canonical", fetchImpl);
  assert.equal(present, true);
  const absent = await ownerPublishedExportPresent("https://fake-registry.invalid", "@scope/owner", "1.0.0", "somethingElse", fetchImpl);
  assert.equal(absent, false);
});

test("ownerPublishedExportPresent reports false, never throwing, when the registry is unreachable", async () => {
  const throwingFetch = (async () => { throw new Error("network unavailable"); });
  const present = await ownerPublishedExportPresent("https://fake-registry.invalid", "@scope/owner", "1.0.0", "canonical", throwingFetch);
  assert.equal(present, false);
});

test("a promotable plan becomes applicable once ownerPublishedExportPresent reports the promoted export already live", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-promote-"));
  try {
    packageAt(root, "owner", {
      name: "@scope/owner",
      version: "1.0.0",
      exports: { ".": "./src/index.mjs" },
      dependencies: {},
    }, {
      "src/index.mjs": "export function unrelated() { return 0; }\n",
      "src/internal.mjs": "function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "consumer-a", {
      name: "@scope/consumer-a",
      version: "1.0.0",
      dependencies: {},
    }, {
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "downstream", {
      name: "@scope/downstream",
      version: "1.0.0",
      dependencies: { "@scope/owner": "1.0.0" },
    }, {
      "src/index.mjs": "export function unrelatedDownstream() { return 1; }\n",
    });

    const tarBuffer = buildMinimalTar("package/index.mjs", "export function canonical(x) { return x + 1; }\n");
    const gzipped = gzipSync(tarBuffer);
    const publishedManifest = { exports: { ".": "./index.mjs" }, dist: { tarball: "https://fake-registry.invalid/owner.tgz" } };
    const fetchImpl = (async (input) => {
      const href = typeof input === "string" ? input : input.toString();
      if (href.endsWith(".tgz")) return new Response(gzipped);
      return new Response(JSON.stringify(publishedManifest));
    });

    const plan = await planDuplicationMigration(root, { rank: 1 }, {
      owner: "@scope/owner", minimumBytes: 1, registry: "https://fake-registry.invalid", fetchImpl,
    });
    assert.equal(plan.ownerRepublishRequired, false, JSON.stringify(plan.refusals));
    assert.equal(plan.applicable, true, JSON.stringify(plan.refusals));
    assert.ok(plan.promoteOwnerExport);
    assert.equal(plan.sites.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses with owner-not-exporting-fingerprint alone when the owner has no implementation of the fingerprint at all (no promotion attempted)", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-promote-"));
  try {
    packageAt(root, "owner", {
      name: "@scope/owner",
      version: "1.0.0",
      exports: { ".": "./src/index.mjs" },
      dependencies: {},
    }, {
      "src/index.mjs": "export function unrelatedOwnerThing(x) { return x - 1; }\n",
    });
    packageAt(root, "consumer-a", {
      name: "@scope/consumer-a",
      version: "1.0.0",
      dependencies: { "@scope/owner": "1.0.0" },
    }, {
      "src/index.mjs": "function canonical(x) { return x + 1; }\n",
    });
    packageAt(root, "consumer-e", {
      name: "@scope/consumer-e",
      version: "1.0.0",
      dependencies: { "@scope/consumer-a": "1.0.0" },
    }, {
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    });

    const plan = await planDuplicationMigration(root, { rank: 1 }, { owner: "@scope/owner", minimumBytes: 1 });
    assert.deepEqual(plan.refusals, [{
      reason: "owner-not-exporting-fingerprint",
      detail: "@scope/owner has no exported implementation matching fingerprint " + plan.candidate.semanticFingerprint,
    }]);
    assert.equal(plan.promoteOwnerExport, null);
    assert.equal(plan.ownerRepublishRequired, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--promote-owners applies only the owner's promotion edits and runs only the owner's own tests", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-promote-batch-"));
  try {
    packageAt(root, "owner-promote", {
      name: "@batch/owner-promote",
      version: "1.0.0",
      exports: { ".": "./src/index.mjs" },
      dependencies: {},
      scripts: { test: "node --test test.mjs" },
    }, {
      "src/index.mjs": "export function unrelated() { return 0; }\n",
      "src/internal.mjs": "function canonical(x) { return x + 1; }\n",
      "test.mjs": [
        "import assert from \"node:assert/strict\";",
        "import test from \"node:test\";",
        "import { unrelated } from \"./src/index.mjs\";",
        "test(\"owner's own test still passes\", () => {",
        "  assert.equal(unrelated(), 0);",
        "});",
        "",
      ].join("\n"),
    });
    packageAt(root, "consumer-promote", {
      name: "@batch/consumer-promote",
      version: "1.0.0",
      dependencies: { "@batch/owner-promote": "1.0.0" },
    }, {
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    });

    const batch = await planDuplicationMigrationBatch(root, { minimumBytes: 1, fetchImpl: ABSENT_FETCH });
    const promotable = batch.plans.find((p) => p.promoteOwnerExport !== null);
    assert.ok(promotable, JSON.stringify(batch.plans));

    const applied = applyOwnerExportPromotions(root, batch);
    assert.deepEqual(applied.reverted, []);
    assert.deepEqual(applied.ownersPromoted, [{ package: "@batch/owner-promote", exports: ["canonical"] }]);

    const ownerEntry = readFileSync(path.join(root, "owner-promote/src/index.mjs"), "utf8");
    assert.match(ownerEntry, /export \{ canonical \} from "\.\/internal\.mjs";/u);
    const ownerInternal = readFileSync(path.join(root, "owner-promote/src/internal.mjs"), "utf8");
    assert.match(ownerInternal, /export function canonical\(x\)/u);

    const consumerFile = readFileSync(path.join(root, "consumer-promote/src/index.mjs"), "utf8");
    assert.equal(consumerFile, "export function canonical(x) { return x + 1; }\n", "a non-owner package must never be touched by --promote-owners");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--promote-owners reverts an owner's promotion byte-for-byte when its own tests fail", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-promote-batch-"));
  try {
    packageAt(root, "owner-broken-promote", {
      name: "@batch/owner-broken-promote",
      version: "1.0.0",
      exports: { ".": "./src/index.mjs" },
      dependencies: {},
      scripts: { test: "node --test test.mjs" },
    }, {
      "src/index.mjs": "export function unrelated() { return 0; }\n",
      "src/internal.mjs": "function canonical(x) { return x + 1; }\n",
      "test.mjs": [
        "import assert from \"node:assert/strict\";",
        "import test from \"node:test\";",
        "import * as entry from \"./src/index.mjs\";",
        "test(\"canonical must not be exported (deliberately broken by the promotion)\", () => {",
        "  assert.equal(\"canonical\" in entry, false);",
        "});",
        "",
      ].join("\n"),
    });
    packageAt(root, "consumer-broken-promote", {
      name: "@batch/consumer-broken-promote",
      version: "1.0.0",
      dependencies: { "@batch/owner-broken-promote": "1.0.0" },
    }, {
      "src/index.mjs": "export function canonical(x) { return x + 1; }\n",
    });

    const before = readFileSync(path.join(root, "owner-broken-promote/src/index.mjs"), "utf8");
    const batch = await planDuplicationMigrationBatch(root, { minimumBytes: 1, fetchImpl: ABSENT_FETCH });
    const applied = applyOwnerExportPromotions(root, batch);

    assert.deepEqual(applied.ownersPromoted, []);
    assert.equal(applied.reverted.length, 1);
    assert.equal(applied.reverted[0]?.package, "@batch/owner-broken-promote");
    assert.ok(applied.reverted[0]?.failingTests && applied.reverted[0].failingTests.length > 0, JSON.stringify(applied.reverted));

    const after = readFileSync(path.join(root, "owner-broken-promote/src/index.mjs"), "utf8");
    assert.equal(after, before, "a reverted owner must be restored byte-for-byte");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--batch --apply runs `npm ci` before `npm test` when node_modules is missing and a package-lock.json is present", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-install-"));
  const originalPath = process.env["PATH"];
  try {
    buildInstallGateWorkspace(root, "pkg-install", "@batch/pkg-install");
    const pkgDir = path.join(root, "pkg-install");
    rmSync(path.join(pkgDir, "node_modules"), { recursive: true, force: true });
    writeFileSync(path.join(pkgDir, "package-lock.json"), "{}\n");

    const binDir = path.join(root, "_fakebin");
    const logPath = path.join(root, "_fakenpm.log");
    writeFakeNpm(binDir, logPath);
    process.env["PATH"] = `${binDir}:${originalPath ?? ""}`;

    const batch = await planDuplicationMigrationBatch(root, { minimumBytes: 1 });
    const applied = applyDuplicationMigrationBatch(root, batch);

    const invocations = fakeNpmInvocations(logPath);
    assert.ok(invocations.length > 0, "expected the fake npm to be invoked at least once");
    assert.equal(invocations[0]?.[0], "ci", JSON.stringify(invocations));

    const result = applied.packageResults?.find((r) => r.package === "@batch/pkg-install");
    assert.ok(result, JSON.stringify(applied.packageResults));
    assert.equal("reverted" in result, false, JSON.stringify(result));
    if (!("reverted" in result)) {
      assert.equal(result.installed, true);
      assert.deepEqual(result.installCommand, ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
    }
  } finally {
    if (originalPath === undefined) delete process.env["PATH"]; else process.env["PATH"] = originalPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("--batch --apply runs `npm install` before `npm test` when node_modules is missing and no package-lock.json is present", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-install-"));
  const originalPath = process.env["PATH"];
  try {
    buildInstallGateWorkspace(root, "pkg-install", "@batch/pkg-install");
    const pkgDir = path.join(root, "pkg-install");
    rmSync(path.join(pkgDir, "node_modules"), { recursive: true, force: true });

    const binDir = path.join(root, "_fakebin");
    const logPath = path.join(root, "_fakenpm.log");
    writeFakeNpm(binDir, logPath);
    process.env["PATH"] = `${binDir}:${originalPath ?? ""}`;

    const batch = await planDuplicationMigrationBatch(root, { minimumBytes: 1 });
    const applied = applyDuplicationMigrationBatch(root, batch);

    const invocations = fakeNpmInvocations(logPath);
    assert.ok(invocations.length > 0, "expected the fake npm to be invoked at least once");
    assert.equal(invocations[0]?.[0], "install", JSON.stringify(invocations));

    const result = applied.packageResults?.find((r) => r.package === "@batch/pkg-install");
    assert.ok(result, JSON.stringify(applied.packageResults));
    assert.equal("reverted" in result, false, JSON.stringify(result));
    if (!("reverted" in result)) {
      assert.equal(result.installed, true);
      assert.deepEqual(result.installCommand, ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"]);
    }
  } finally {
    if (originalPath === undefined) delete process.env["PATH"]; else process.env["PATH"] = originalPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("--batch --apply reverts and records install-failed when the install fails, and never invokes npm test", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-install-"));
  const originalPath = process.env["PATH"];
  try {
    buildInstallGateWorkspace(root, "pkg-install", "@batch/pkg-install");
    const pkgDir = path.join(root, "pkg-install");
    rmSync(path.join(pkgDir, "node_modules"), { recursive: true, force: true });
    const helperBefore = readFileSync(path.join(pkgDir, "src/helper.mjs"), "utf8");

    const binDir = path.join(root, "_fakebin");
    const logPath = path.join(root, "_fakenpm.log");
    writeFakeNpm(binDir, logPath);
    process.env["PATH"] = `${binDir}:${originalPath ?? ""}`;
    process.env["FAKE_NPM_INSTALL_EXIT"] = "1";

    const batch = await planDuplicationMigrationBatch(root, { minimumBytes: 1 });
    const applied = applyDuplicationMigrationBatch(root, batch);

    const invocations = fakeNpmInvocations(logPath);
    assert.equal(invocations.length, 1, `npm test must never be invoked when install fails: ${JSON.stringify(invocations)}`);
    assert.equal(invocations[0]?.[0], "install", JSON.stringify(invocations));

    const result = applied.packageResults?.find((r) => r.package === "@batch/pkg-install");
    assert.ok(result, JSON.stringify(applied.packageResults));
    assert.equal("reverted" in result && result.reverted, true, JSON.stringify(result));
    if ("reverted" in result) {
      assert.equal(result.reason, "install-failed");
      assert.deepEqual(result.command, ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"]);
      assert.equal(typeof result.stderrTail, "string");
    }

    const helperAfter = readFileSync(path.join(pkgDir, "src/helper.mjs"), "utf8");
    assert.equal(helperAfter, helperBefore, "a package reverted for install-failed must be restored byte-for-byte");
  } finally {
    delete process.env["FAKE_NPM_INSTALL_EXIT"];
    if (originalPath === undefined) delete process.env["PATH"]; else process.env["PATH"] = originalPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("--batch --apply reuses node_modules when the manifest is unchanged", { timeout: 60_000 }, async () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-duplication-migration-install-"));
  const originalPath = process.env["PATH"];
  try {
    buildInstallGateWorkspace(root, "pkg-install", "@batch/pkg-install");
    // node_modules is left in place, as packageAt creates it by default.

    const binDir = path.join(root, "_fakebin");
    const logPath = path.join(root, "_fakenpm.log");
    writeFakeNpm(binDir, logPath);
    process.env["PATH"] = `${binDir}:${originalPath ?? ""}`;

    const batch = await planDuplicationMigrationBatch(root, { minimumBytes: 1 });
    const applied = applyDuplicationMigrationBatch(root, batch);

    const invocations = fakeNpmInvocations(logPath);
    assert.deepEqual(invocations.filter((argv) => argv[0] === "ci" || argv[0] === "install"), [], JSON.stringify(invocations));

    const result = applied.packageResults?.find((r) => r.package === "@batch/pkg-install");
    assert.ok(result, JSON.stringify(applied.packageResults));
    assert.equal("reverted" in result, false, JSON.stringify(result));
    if (!("reverted" in result)) {
      assert.equal(result.installed, undefined);
      assert.equal(result.installCommand, undefined);
    }
  } finally {
    if (originalPath === undefined) delete process.env["PATH"]; else process.env["PATH"] = originalPath;
    rmSync(root, { recursive: true, force: true });
  }
});

test("manifest migration installs the new owner into existing node_modules before the real consumer test", { timeout: 60_000 }, () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-migration-installed-owner-"));
  try {
    const owner = packageAt(root, "owner", { name: "@fixture/owner", version: "1.0.0", type: "module", exports: "./index.mjs" }, {
      "index.mjs": "export const value = 42;\n",
    });
    const consumer = packageAt(root, "consumer", { name: "@fixture/consumer", version: "1.0.0", scripts: { test: "node test.mjs" } }, {
      "test.mjs": "import assert from 'node:assert/strict'; import { value } from '@fixture/owner'; assert.equal(value, 42);\n",
    });
    writeFileSync(path.join(consumer, "package-lock.json"), JSON.stringify({ name: "@fixture/consumer", version: "1.0.0", lockfileVersion: 3, packages: { "": { name: "@fixture/consumer", version: "1.0.0" } } }));
    const result = applyPackageEditsWithTestGate(consumer, "@fixture/consumer", [], [
      { package: "@fixture/consumer", dependency: "@fixture/owner", version: `file:${owner}` },
    ]);
    assert.equal("reverted" in result, false, JSON.stringify(result));
    if (!("reverted" in result)) assert.equal(result.installCommand?.[1], "install");
    assert.ok(existsSync(path.join(consumer, "node_modules/@fixture/owner/index.mjs")));
    assert.match(readFileSync(path.join(consumer, "package-lock.json"), "utf8"), /@fixture\/owner/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a failed consumer test restores preexisting manifest and lockfile after installing a new owner", { timeout: 60_000 }, () => {
  const root = mkdtempSync(path.join(tmpdir(), "jsnode-migration-lock-restore-"));
  try {
    const owner = packageAt(root, "owner", { name: "@fixture/owner", version: "1.0.0" }, {});
    const consumer = packageAt(root, "consumer", { name: "@fixture/consumer", version: "1.0.0", scripts: { test: "node -e 'process.exit(1)'" } }, {});
    const manifest = readFileSync(path.join(consumer, "package.json"), "utf8");
    const lock = JSON.stringify({ name: "@fixture/consumer", lockfileVersion: 3, packages: {} }) + "\n";
    writeFileSync(path.join(consumer, "package-lock.json"), lock);
    const result = applyPackageEditsWithTestGate(consumer, "@fixture/consumer", [], [
      { package: "@fixture/consumer", dependency: "@fixture/owner", version: `file:${owner}` },
    ]);
    assert.equal("reverted" in result, true, JSON.stringify(result));
    assert.equal(readFileSync(path.join(consumer, "package.json"), "utf8"), manifest);
    assert.equal(readFileSync(path.join(consumer, "package-lock.json"), "utf8"), lock);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
