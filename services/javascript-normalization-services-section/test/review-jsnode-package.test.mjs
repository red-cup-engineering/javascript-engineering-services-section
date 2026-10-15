import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createHash } from "node:crypto";
import {
  barrelDeviation,
  distPresentDeviation,
  exportTargetMissingDeviations,
  expectedPackageScope,
  houseDependencyUndeclaredDeviations,
  houseDependencyUnusedDeviations,
  lockfilePresentDeviations,
  reviewJsnodePackage,
  reviewJsnodePackageDirectory,
  reviewJsnodePackageTree,
  typescriptSourceDeviations,
} from "../scripts/review-jsnode-package.mjs";

const normalManifest = {
  name: "@red-cup-engineering/example-service",
  version: "1.0.0",
  type: "module",
  description: "An example.",
  scripts: { test: "node --test test/*.test.mjs" },
};

test("a normal package reviews clean", () => {
  const review = reviewJsnodePackage({ manifest: normalManifest, files: ["scripts/example.mjs", "test/example.test.mjs"] });
  assert.deepEqual(review.deviations, []);
  assert.equal(review.normalizedManifest.name, normalManifest.name);
});

test("verification script layers are reported", () => {
  const manifest = {
    ...normalManifest,
    scripts: { ...normalManifest.scripts, check: "node check-mts.mjs src/*.mts", verify: "npm run check && npm test" },
  };
  const review = reviewJsnodePackage({ manifest, files: ["test/example.test.mjs"] });
  const codes = review.deviations.map((deviation) => deviation.code);
  assert.deepEqual(codes, ["verification-script-layer"]);
  assert.match(review.deviations[0].detail, /^verify:/u);
});

test("a check script that chains other scripts is reported; a direct tool check is not", () => {
  const chained = reviewJsnodePackage({
    manifest: { ...normalManifest, scripts: { ...normalManifest.scripts, check: "npm run lint && npm test" } },
    files: [],
  });
  assert.equal(chained.deviations.filter((deviation) => deviation.code === "verification-script-layer").length, 1);
  const direct = reviewJsnodePackage({
    manifest: { ...normalManifest, scripts: { ...normalManifest.scripts, check: "tsc --noEmit" } },
    files: [],
  });
  assert.deepEqual(direct.deviations, []);
});

test("test files without a test script are reported", () => {
  const manifest = { ...normalManifest, scripts: {} };
  const review = reviewJsnodePackage({ manifest, files: ["src/thing.test.mts"] });
  assert.deepEqual(review.deviations.map((deviation) => deviation.code), ["missing-test-script"]);
});

test("a test script that names no known runner is reported", () => {
  const manifest = { ...normalManifest, scripts: { test: "node run-all-checks.mjs" } };
  const review = reviewJsnodePackage({ manifest, files: ["test/example.test.mjs"] });
  assert.deepEqual(review.deviations.map((deviation) => deviation.code), ["nonstandard-test-script"]);
});

test("Node test scripts may preload TypeScript loaders with either import form", () => {
  for (const command of [
    "node --import tsx --test test/*.test.mjs",
    "node --import=tsx --test test/*.test.mjs",
    "node --import tsx --import=@scope/loader --test test/*.test.mjs",
  ]) {
    const review = reviewJsnodePackage({
      manifest: { ...normalManifest, scripts: { test: command } },
      files: ["test/example.test.mts"],
    });
    assert.ok(!review.deviations.some((deviation) => deviation.code === "nonstandard-test-script"), command);
  }
});

test("test scripts cannot hide workflows or arbitrary commands around a runner", () => {
  for (const command of [
    "npm run build && node --test test/*.test.mjs",
    "node --import tsx --test test/*.test.mjs && npm pack",
    "node scripts/prepare-tests.mjs --test test/*.test.mjs",
    "vitest; npm publish",
  ]) {
    const review = reviewJsnodePackage({
      manifest: { ...normalManifest, scripts: { test: command } },
      files: ["test/example.test.mts"],
    });
    assert.ok(review.deviations.some((deviation) => deviation.code === "nonstandard-test-script"), command);
  }
});

test("a combined verify workflow remains a verification-layer deviation", () => {
  const review = reviewJsnodePackage({
    manifest: {
      ...normalManifest,
      scripts: { test: "node --import tsx --test test/*.test.mts", verify: "npm test && npm pack" },
    },
    files: ["test/example.test.mts"],
  });
  assert.deepEqual(review.deviations.map(({ code }) => code), ["verification-script-layer"]);
});

test("pnpm declarations normalize away and are reported as manifest drift", () => {
  const manifest = { ...normalManifest, packageManager: "pnpm@9.0.0", engines: { node: ">=20", pnpm: ">=9" } };
  const review = reviewJsnodePackage({ manifest, files: [] });
  assert.ok(review.deviations.some((deviation) => deviation.code === "manifest-not-normalized"));
  assert.equal(review.normalizedManifest.packageManager, undefined);
  assert.deepEqual(review.normalizedManifest.engines, { node: ">=20" });
});

test("exact custody-section segments require their owner namespace", () => {
  const cases = [
    ["lib/example/engineering-services-section/services/example-service", "@red-cup-engineering"],
    ["lib/example/science-services-section/services/example-service", "@lenticule-science"],
    ["lib/example/operations-services-section/services/example-service", "@coesite-operations"],
  ];
  for (const [packageDirectory, expectedScope] of cases) {
    const review = reviewJsnodePackage({
      manifest: normalManifest,
      packageDirectory,
    });
    assert.equal(expectedPackageScope(packageDirectory), expectedScope);
    const mismatch = review.deviations.find((deviation) => deviation.code === "custody-namespace-mismatch");
    assert.equal(mismatch === undefined, normalManifest.name.startsWith(`${expectedScope}/`));
  }
});

test("custody matching is exact rather than substring based", () => {
  const packageDirectory = "lib/example/computer-engineering-services-section/services/example-service";
  const review = reviewJsnodePackage({ manifest: normalManifest, packageDirectory });
  assert.equal(expectedPackageScope(packageDirectory), undefined);
  assert.ok(!review.deviations.some((deviation) => deviation.code === "custody-namespace-mismatch"));
});

test("the closest exact custody section controls the namespace", () => {
  const packageDirectory = "lib/engineering-services-section/services/science-services-section/services/example-service";
  assert.equal(expectedPackageScope(packageDirectory), "@lenticule-science");
});

test("malformed service-section directory names are reported", () => {
  const review = reviewJsnodePackage({
    manifest: { ...normalManifest, name: "@red-cup-engineering/term-services" },
    packageDirectory: "lib/engineering-services-section/services/term-services/services/term-services",
  });
  assert.deepEqual(
    review.deviations.filter((deviation) => deviation.code.startsWith("malformed-services-section")).map(({ code }) => code),
    ["malformed-services-section-directory", "malformed-services-section-package-name"],
  );
});

test("a manifest package leaf must match its package directory", () => {
  const review = reviewJsnodePackage({
    manifest: normalManifest,
    packageDirectory: "lib/engineering-services-section/services/different-service",
  });
  assert.ok(review.deviations.some((deviation) => deviation.code === "manifest-name-directory-mismatch"));
});

test("a 561 Group site host maps to its package leaf without relaxing namespace custody", () => {
  const packageDirectory = "lib/science-services-section/sites/l-space.561.group";
  const conformant = reviewJsnodePackage({
    manifest: { ...normalManifest, name: "@lenticule-science/l-space" },
    packageDirectory,
  });
  assert.deepEqual(conformant.deviations, []);

  const wrongNamespace = reviewJsnodePackage({
    manifest: { ...normalManifest, name: "@red-cup-engineering/l-space" },
    packageDirectory,
  });
  assert.deepEqual(wrongNamespace.deviations.map(({ code }) => code), ["custody-namespace-mismatch"]);
});

test("site-host mapping does not excuse unrelated dotted directories or suffixes", () => {
  const cases = [
    "lib/science-services-section/services/l-space.561.group",
    "lib/science-services-section/sites/l-space.example",
    "lib/science-services-section/sites/other.561.group",
  ];
  for (const packageDirectory of cases) {
    const review = reviewJsnodePackage({
      manifest: { ...normalManifest, name: "@lenticule-science/l-space" },
      packageDirectory,
    });
    assert.ok(review.deviations.some(({ code }) => code === "manifest-name-directory-mismatch"), packageDirectory);
  }
});

test("a conformant package path, namespace, and leaf review clean", () => {
  const review = reviewJsnodePackage({
    manifest: normalManifest,
    files: ["scripts/example.mjs", "test/example.test.mjs"],
    packageDirectory: "lib/engineering-services-section/services/example-service",
  });
  assert.deepEqual(review.deviations, []);
});

test("directory review rejects local dependency forms", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-"));
  try {
    const packageDirectory = join(fixtureRoot, "example-service");
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(join(packageDirectory, "package.json"), `${JSON.stringify({ ...normalManifest, dependencies: { local: "file:../local", linked: "link:../linked", workspace: "workspace:*" } })}\n`);
    const review = reviewJsnodePackageDirectory(packageDirectory);
    assert.deepEqual(review.deviations.map(({ code }) => code), ["local-dependency-specifier", "local-dependency-specifier", "local-dependency-specifier"]);
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("runtime and development house dependencies require exact versions while peers remain compatibility contracts", () => {
  const review = reviewJsnodePackage({
    manifest: {
      ...normalManifest,
      dependencies: { "@red-cup-engineering/provider": "^1.0.0" },
      devDependencies: { "@red-cup-engineering/test-provider": "~2.0.0" },
      optionalDependencies: { "@red-cup-engineering/optional-provider": "latest" },
      peerDependencies: { "@red-cup-engineering/peer-provider": "^3.0.0" },
    },
  });
  assert.deepEqual(review.deviations.map(({ code }) => code), ["nonexact-house-dependency", "nonexact-house-dependency", "nonexact-house-dependency"]);
});

test("every routed house scope requires exact runtime pins", () => {
  for (const scope of ["@561-group", "@causeway-services", "@coesite-operations", "@emsenn", "@lenticule-science", "@red-cup-engineering"]) {
    const review = reviewJsnodePackage({ manifest: { ...normalManifest, dependencies: { [`${scope}/provider`]: "^1.0.0" } } });
    assert.ok(review.deviations.some(({ code }) => code === "nonexact-house-dependency"), scope);
  }
});

test("directory review inspects every lockfile package entry", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-"));
  try {
    const packageDirectory = join(fixtureRoot, "example-service");
    mkdirSync(packageDirectory, { recursive: true });
    writeFileSync(join(packageDirectory, "package.json"), `${JSON.stringify(normalManifest)}\n`);
    writeFileSync(join(packageDirectory, "package-lock.json"), `${JSON.stringify({
      name: normalManifest.name,
      lockfileVersion: 3,
      packages: {
        "": { name: normalManifest.name },
        "node_modules/@red-cup-engineering/example": { version: "1.0.0", resolved: "http://127.0.0.1:4873/@red-cup-engineering/example/-/example-1.0.0.tgz", dependencies: { local: "file:../local" } },
        "node_modules/public-package": { version: "1.0.0", resolved: "https://registry.npmjs.org/public-package/-/public-package-1.0.0.tgz" },
      },
    })}\n`);
    const review = reviewJsnodePackageDirectory(packageDirectory);
    assert.deepEqual(review.deviations.map(({ code }) => code), [
      "lockfile-local-dependency-specifier",
      "lockfile-local-registry-url",
      "lockfile-house-registry-url",
      "lockfile-present", // the new shape check: a package-lock.json is present at all
    ]);
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("the batch CLI returns structured reports but fails when any package has deviations", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-"));
  try {
    const cleanDirectory = join(fixtureRoot, "clean");
    const invalidDirectory = join(fixtureRoot, "invalid");
    mkdirSync(cleanDirectory, { recursive: true });
    mkdirSync(invalidDirectory, { recursive: true });
    writeFileSync(join(cleanDirectory, "package.json"), `${JSON.stringify({ ...normalManifest, name: "@red-cup-engineering/clean" })}\n`);
    writeFileSync(join(invalidDirectory, "package.json"), `${JSON.stringify({ ...normalManifest, name: "@red-cup-engineering/invalid", dependencies: { local: "file:../local" } })}\n`);
    const command = fileURLToPath(new URL("../scripts/review-jsnode-package.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [command, cleanDirectory, invalidDirectory], { encoding: "utf8" });
    assert.equal(result.status, 2, result.stderr);
    const reports = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(reports.length, 2);
    assert.deepEqual(reports[0].deviations, []);
    assert.equal(reports[1].deviations[0].code, "local-dependency-specifier");
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("directory review accepts same-package and evidenced browser routes while rejecting filesystem, external, symlink, and nested package imports", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-"));
  try {
    const packageDirectory = join(fixtureRoot, "example-service");
    const externalFile = join(fixtureRoot, "external.mjs");
    mkdirSync(join(packageDirectory, "src"), { recursive: true });
    mkdirSync(join(packageDirectory, "test"), { recursive: true });
    mkdirSync(join(packageDirectory, "nested"), { recursive: true });
    writeFileSync(join(packageDirectory, "package.json"), `${JSON.stringify(normalManifest)}\n`);
    writeFileSync(join(packageDirectory, "src", "same.mjs"), "export const same = true;\n");
    writeFileSync(join(packageDirectory, "src", "inside.mjs"), "import './same.mjs';\n");
    writeFileSync(externalFile, "export const external = true;\n");
    writeFileSync(join(packageDirectory, "src", "outside.mjs"), "import '../../external.mjs';\n");
    symlinkSync(externalFile, join(packageDirectory, "src", "linked.mjs"));
    writeFileSync(join(packageDirectory, "src", "symlink.mjs"), "import './linked.mjs';\n");
    writeFileSync(join(packageDirectory, "nested", "package.json"), `${JSON.stringify(normalManifest)}\n`);
    writeFileSync(join(packageDirectory, "nested", "entry.mjs"), "export const nested = true;\n");
    writeFileSync(join(packageDirectory, "src", "nested.mjs"), "import '../nested/entry.mjs';\n");
    writeFileSync(join(packageDirectory, "src", "browser.mjs"), "import '/assets/client.mjs';\n");
    mkdirSync(join(packageDirectory, "scripts"), { recursive: true });
    writeFileSync(join(packageDirectory, "scripts", "release.mjs"), "const assets = [['client.mjs', 'browser module']];\n");
    writeFileSync(join(packageDirectory, "src", "absolute.mjs"), `import ${JSON.stringify(externalFile)};\n`);
    writeFileSync(join(packageDirectory, "src", "file-url.mjs"), `import ${JSON.stringify(`file://${externalFile}`)};\n`);
    writeFileSync(join(packageDirectory, "test", "runtime-path.test.mjs"), [
      'import { execFileSync } from "node:child_process";',
      'import { fileURLToPath } from "node:url";',
      'const launcher = fileURLToPath(new URL("../../external' + '.mjs", import.meta.url));',
      'execFileSync(process.execPath, [launcher]);',
      '',
    ].join("\n"));
    mkdirSync(join(packageDirectory, "src", "deep", "one", "two", "three", "four"), { recursive: true });
    writeFileSync(join(packageDirectory, "src", "deep", "one", "two", "three", "four", "escape.mjs"), "import '../../../../../../../external.mjs';\n");
    const review = reviewJsnodePackageDirectory(packageDirectory);
    assert.ok(!review.deviations.some(({ detail }) => detail === "src/inside.mjs:./same.mjs"));
    assert.ok(!review.deviations.some(({ detail }) => detail === "src/browser.mjs:/assets/client.mjs"));
    assert.ok(review.deviations.some(({ code, detail }) => code === "relative-import-outside-package" && detail === "src/outside.mjs:../../external.mjs"));
    assert.ok(review.deviations.some(({ code, detail }) => code === "relative-import-outside-package" && detail === `src/absolute.mjs:${externalFile}`));
    assert.ok(review.deviations.some(({ code, detail }) => code === "relative-import-outside-package" && detail === `src/file-url.mjs:file://${externalFile}`));
    assert.ok(review.deviations.some(({ code, detail }) => code === "relative-import-outside-package" && detail === "test/runtime-path.test.mjs:../../external.mjs"));
    assert.ok(review.deviations.some(({ code, detail }) => code === "relative-import-outside-package" && detail === "src/deep/one/two/three/four/escape.mjs:../../../../../../../external.mjs"));
    assert.ok(review.deviations.some(({ code, detail }) => code === "relative-import-symlink-outside-package" && detail === "src/symlink.mjs:./linked.mjs"));
    assert.ok(review.deviations.some(({ code, detail }) => code === "relative-import-into-nested-package" && detail === "src/nested.mjs:../nested/entry.mjs"));
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("barrelDeviation reports a module whose statements are all export-from or export-star, and nothing else", () => {
  assert.deepEqual(barrelDeviation("src/index.mjs", 'export * from "./a.mjs";\nexport * from "./b.mjs";\n'), { code: "barrel", detail: "src/index.mjs" });
  assert.deepEqual(barrelDeviation("src/index.mjs", 'export * as ns from "./a.mjs";\n'), { code: "barrel", detail: "src/index.mjs" });
  assert.deepEqual(barrelDeviation("src/index.mjs", 'export { a, b } from "./a.mjs";\n'), { code: "barrel", detail: "src/index.mjs" });
  assert.deepEqual(
    barrelDeviation("src/index.mjs", '#!/usr/bin/env node\n// re-export everything\nexport {\n  a,\n  b,\n} from "./a.mjs";\n'),
    { code: "barrel", detail: "src/index.mjs" },
    "a shebang and comments around a multi-line export-from still count as a barrel",
  );
  assert.equal(barrelDeviation("src/index.mjs", 'export * from "./a.mjs";\nexport function extra() { return 1; }\n'), undefined, "a real statement disqualifies it");
  assert.equal(barrelDeviation("src/index.mjs", "export function real() { return 1; }\n"), undefined, "no export-from statement at all is not a barrel");
  assert.equal(barrelDeviation("src/index.mjs", ""), undefined, "an empty file has no export-from statement to forward");
});

test("a manifest's declared deliberateEntries path is never reported \"barrel\", reported instead as informational \"deliberate-entry\" outside deviations", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-"));
  try {
    mkdirSync(join(fixtureRoot, "src"), { recursive: true });
    writeFileSync(join(fixtureRoot, "src", "a.mjs"), "export const a = 1;\n");
    writeFileSync(join(fixtureRoot, "src", "index.mjs"), 'export * from "./a.mjs";\n');
    writeFileSync(join(fixtureRoot, "src", "other-barrel.mjs"), 'export * from "./a.mjs";\n');
    const manifest = {
      ...normalManifest,
      name: "@red-cup-engineering/example-service",
      deliberateEntries: [{ path: "src/index.mjs", reason: "a documented chokepoint, not re-export laziness" }],
    };
    writeFileSync(join(fixtureRoot, "package.json"), `${JSON.stringify(manifest)}\n`);
    const review = reviewJsnodePackageDirectory(fixtureRoot);
    assert.ok(!review.deviations.some(({ detail }) => detail === "src/index.mjs"), "the declared path carries no deviation at all");
    assert.ok(review.deviations.some(({ code, detail }) => code === "barrel" && detail === "src/other-barrel.mjs"), "an undeclared barrel elsewhere in the package is still reported");
    assert.deepEqual(review.informational, [{ code: "deliberate-entry", detail: "src/index.mjs" }]);
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("reviewJsnodePackageTree never counts a deliberate-entry finding toward findings or the census", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-tree-"));
  try {
    const packageDirectory = join(fixtureRoot, "pkg");
    mkdirSync(join(packageDirectory, "src"), { recursive: true });
    writeFileSync(join(packageDirectory, "src", "a.mjs"), "export const a = 1;\n");
    writeFileSync(join(packageDirectory, "src", "index.mjs"), 'export * from "./a.mjs";\n');
    const manifest = {
      ...normalManifest,
      name: "@red-cup-engineering/pkg",
      deliberateEntries: [{ path: "src/index.mjs", reason: "a documented chokepoint" }],
    };
    writeFileSync(join(packageDirectory, "package.json"), `${JSON.stringify(manifest)}\n`);
    const map = { packages: { "@red-cup-engineering/pkg": "pkg" } };
    const { reports, findings, census } = reviewJsnodePackageTree({ root: fixtureRoot, map });
    assert.equal(findings, 0, "the deliberate entry contributes nothing to findings");
    assert.deepEqual(census, {}, "the deliberate entry never reaches the \"barrel\" census");
    assert.deepEqual(reports[0].informational, [{ code: "deliberate-entry", detail: "src/index.mjs" }]);
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("distPresentDeviation reports a checked-in dist/ directory", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-"));
  try {
    assert.equal(distPresentDeviation(fixtureRoot), undefined);
    mkdirSync(join(fixtureRoot, "dist"));
    assert.deepEqual(distPresentDeviation(fixtureRoot), { code: "dist-present", detail: "dist" });
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("lockfilePresentDeviations reports every package-manager lockfile checked in beside the manifest", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-"));
  try {
    assert.deepEqual(lockfilePresentDeviations(fixtureRoot), []);
    writeFileSync(join(fixtureRoot, "package-lock.json"), "{}\n");
    writeFileSync(join(fixtureRoot, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    assert.deepEqual(lockfilePresentDeviations(fixtureRoot), [
      { code: "lockfile-present", detail: "package-lock.json" },
      { code: "lockfile-present", detail: "pnpm-lock.yaml" },
    ]);
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("typescriptSourceDeviations reports .ts/.mts/.cts source but not .d.* declarations or plain JavaScript", () => {
  const files = ["src/a.ts", "src/b.d.ts", "src/c.mts", "src/d.mjs", "src/e.d.mts", "src/f.cts"];
  assert.deepEqual(typescriptSourceDeviations(files), [
    { code: "typescript-source", detail: "src/a.ts" },
    { code: "typescript-source", detail: "src/c.mts" },
    { code: "typescript-source", detail: "src/f.cts" },
  ]);
});

test("exportTargetMissingDeviations reports an exports entry whose file does not exist, and skips '*' patterns", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-"));
  try {
    mkdirSync(join(fixtureRoot, "src"), { recursive: true });
    writeFileSync(join(fixtureRoot, "src", "index.mjs"), "export const x = 1;\n");
    const manifest = {
      exports: {
        ".": "./src/index.mjs",
        "./sub": { import: "./src/sub.mjs" },
        "./services/*": "./src/services/*.mjs",
      },
    };
    assert.deepEqual(exportTargetMissingDeviations(manifest, fixtureRoot), [{ code: "export-target-missing", detail: "./sub: ./src/sub.mjs" }]);
    assert.deepEqual(exportTargetMissingDeviations({ exports: "./missing.mjs" }, fixtureRoot), [{ code: "export-target-missing", detail: ".: ./missing.mjs" }]);
    assert.deepEqual(exportTargetMissingDeviations({}, fixtureRoot), []);
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("houseDependencyUndeclaredDeviations reports a house package imported under src/scripts but absent from dependencies", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-"));
  try {
    mkdirSync(join(fixtureRoot, "src"), { recursive: true });
    mkdirSync(join(fixtureRoot, "lib"), { recursive: true });
    writeFileSync(join(fixtureRoot, "src", "a.mjs"), 'import { thing } from "@red-cup-engineering/example";\nimport { self } from "@red-cup-engineering/here";\n');
    writeFileSync(join(fixtureRoot, "lib", "b.mjs"), 'import { other } from "@red-cup-engineering/only-in-lib";\n');
    const files = ["src/a.mjs", "lib/b.mjs"];
    const manifestMissing = { name: "@red-cup-engineering/here" };
    assert.deepEqual(houseDependencyUndeclaredDeviations(manifestMissing, fixtureRoot, files), [
      { code: "house-dependency-undeclared", detail: "@red-cup-engineering/example imported under src/scripts but absent from dependencies" },
    ]);
    const manifestDeclared = { name: "@red-cup-engineering/here", dependencies: { "@red-cup-engineering/example": "1.0.0" } };
    assert.deepEqual(houseDependencyUndeclaredDeviations(manifestDeclared, fixtureRoot, files), [], "a declared dependency and a self-import are not flagged");
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("houseDependencyUnusedDeviations reports a declared house dependency never imported anywhere, but leaves non-house names alone", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-"));
  try {
    mkdirSync(join(fixtureRoot, "lib"), { recursive: true });
    writeFileSync(join(fixtureRoot, "lib", "a.mjs"), 'import { used } from "@red-cup-engineering/used-elsewhere";\n');
    const files = ["lib/a.mjs"];
    const manifest = {
      name: "@red-cup-engineering/example",
      dependencies: { "@red-cup-engineering/used-elsewhere": "1.0.0", "@red-cup-engineering/never-imported": "1.0.0", "plain-npm-package": "^1.0.0" },
    };
    assert.deepEqual(houseDependencyUnusedDeviations(manifest, fixtureRoot, files), [
      { code: "house-dependency-unused", detail: "@red-cup-engineering/never-imported declared in dependencies but never imported" },
    ]);
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("reviewJsnodePackageTree reviews every mapped package under root, censuses by kind, and skips a directory with no package.json yet", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-tree-"));
  try {
    const cleanDirectory = join(fixtureRoot, "clean");
    const dirtyDirectory = join(fixtureRoot, "dirty");
    mkdirSync(cleanDirectory, { recursive: true });
    mkdirSync(dirtyDirectory, { recursive: true });
    writeFileSync(join(cleanDirectory, "package.json"), `${JSON.stringify({ ...normalManifest, name: "@red-cup-engineering/clean" })}\n`);
    writeFileSync(join(dirtyDirectory, "package.json"), `${JSON.stringify({ ...normalManifest, name: "@red-cup-engineering/dirty" })}\n`);
    mkdirSync(join(dirtyDirectory, "dist"));
    const map = {
      packages: {
        "@red-cup-engineering/clean": "clean",
        "@red-cup-engineering/dirty": "dirty",
        "@red-cup-engineering/not-yet-materialized": "not-yet-materialized",
      },
    };
    const { reports, findings, census } = reviewJsnodePackageTree({ root: fixtureRoot, map });
    assert.equal(reports.length, 2, "the not-yet-materialized package is skipped");
    assert.equal(findings, 1);
    assert.deepEqual(census, { "dist-present": 1 });
    const dirtyReport = reports.find((report) => report.package === "@red-cup-engineering/dirty");
    assert.deepEqual(dirtyReport.deviations, [{ code: "dist-present", detail: "dist" }]);
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("the --all CLI mode prints a tree-wide report, and --summary collapses it to a census", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-tree-"));
  try {
    const cleanDirectory = join(fixtureRoot, "clean");
    mkdirSync(cleanDirectory, { recursive: true });
    writeFileSync(join(cleanDirectory, "package.json"), `${JSON.stringify({ ...normalManifest, name: "@red-cup-engineering/clean" })}\n`);
    mkdirSync(join(cleanDirectory, "dist"));
    const mapPath = join(fixtureRoot, "map.json");
    writeFileSync(mapPath, JSON.stringify({ packages: { "@red-cup-engineering/clean": "clean" } }));
    const command = fileURLToPath(new URL("../scripts/review-jsnode-package.mjs", import.meta.url));

    const summary = spawnSync(process.execPath, [command, "--all", "--root", fixtureRoot, "--map", mapPath, "--summary"], { encoding: "utf8" });
    assert.equal(summary.status, 2, summary.stderr);
    assert.deepEqual(JSON.parse(summary.stdout), { packages: 1, findings: 1, census: { "dist-present": 1 } });

    const full = spawnSync(process.execPath, [command, "--all", "--root", fixtureRoot, "--map", mapPath], { encoding: "utf8" });
    assert.equal(full.status, 2, full.stderr);
    const report = JSON.parse(full.stdout.trim());
    assert.equal(report.package, "@red-cup-engineering/clean");
    assert.deepEqual(report.deviations, [{ code: "dist-present", detail: "dist" }]);
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});

test("the CLI accepts --package/--root, the flags every javascript-node audit takes, giving the same answer the positional form gives -- and still exits 2 on deviations, 0 on a clean package", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "review-jsnode-package-flags-"));
  try {
    const invalidDirectory = join(fixtureRoot, "invalid");
    mkdirSync(invalidDirectory, { recursive: true });
    writeFileSync(
      join(invalidDirectory, "package.json"),
      `${JSON.stringify({ ...normalManifest, name: "@red-cup-engineering/invalid", dependencies: { local: "file:../local" } })}\n`,
    );
    const cleanDirectory = join(fixtureRoot, "clean");
    mkdirSync(cleanDirectory, { recursive: true });
    writeFileSync(join(cleanDirectory, "package.json"), `${JSON.stringify({ ...normalManifest, name: "@red-cup-engineering/clean" })}\n`);
    const command = fileURLToPath(new URL("../scripts/review-jsnode-package.mjs", import.meta.url));

    // Positional form: the pre-existing shape, still working unchanged.
    const positional = spawnSync(process.execPath, [command, invalidDirectory], { encoding: "utf8" });
    assert.equal(positional.status, 2, positional.stderr);
    const positionalReport = JSON.parse(positional.stdout.trim());

    // --package/--root: the shape every javascript-node audit (audit-hull-kernel.mjs and its
    // siblings) takes; a writer who reached for that shape here used to get treated positional
    // directories named "--package", "invalid", "--root", <fixtureRoot> instead.
    const flagged = spawnSync(process.execPath, [command, "--package", "invalid", "--root", fixtureRoot], { encoding: "utf8" });
    assert.equal(flagged.status, 2, flagged.stderr);
    const flaggedReport = JSON.parse(flagged.stdout.trim());

    assert.deepEqual(flaggedReport.deviations, positionalReport.deviations);
    assert.equal(flaggedReport.deviations[0].code, "local-dependency-specifier");
    assert.equal(flaggedReport.packageDirectory, resolve(fixtureRoot, "invalid"));

    const cleanFlagged = spawnSync(process.execPath, [command, "--package", "clean", "--root", fixtureRoot], { encoding: "utf8" });
    assert.equal(cleanFlagged.status, 0, cleanFlagged.stderr);
    assert.deepEqual(JSON.parse(cleanFlagged.stdout.trim()).deviations, []);
  } finally {
    rmSync(fixtureRoot, { recursive: true });
  }
});


// These are static-evidence fixtures, not assertions that a native install ran.
function sourceFixture({ local = 'workspace:*', field = 'dependencies', purpose = 'development', rootPackage = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'source-review-'));
  const evidence = mkdtempSync(join(tmpdir(), 'source-evidence-'));
  const hash = value => createHash('sha256').update(value).digest('hex');
  const blob = value => createHash('sha1').update(Buffer.from('blob ' + Buffer.byteLength(value) + '\0')).update(value).digest('hex');
  const appPath = rootPackage ? '.' : 'example-service';
  const manifest = {...normalManifest, [field]: {'@red-cup-engineering/provider': local}};
  const inventory = {purpose, sources:[{repository:'fixtures/source',revision:'a'.repeat(40),workspacePath:'.'}],packages:[],files:[],generatedRoots:['node_modules', ...(rootPackage?[]:['example-service/node_modules']), 'provider/node_modules']};
  const add = (path, text) => {
    const absolute=join(root,path);mkdirSync(resolve(absolute,'..'),{recursive:true});writeFileSync(absolute,text);
    inventory.files.push({repository:'fixtures/source',revision:'a'.repeat(40),path,workspacePath:path,gitBlob:blob(text),sha256:hash(text),mode:'100644'});
  };
  for(const [path, value] of [[appPath,manifest],['provider',{...normalManifest,name:'@red-cup-engineering/provider'}]]) {
    inventory.packages.push({repository:'fixtures/source',revision:'a'.repeat(40),path,workspacePath:path,name:value.name,version:value.version});
    add((path==='.'?'':path+'/')+'package.json',JSON.stringify(value));
    add((path==='.'?'':path+'/')+'src/owned.mjs','export const owned = true;\n');
  }
  const configuration='packages: ["'+appPath+'", "provider"]\n';
  const lock='lockfileVersion: \'9.0\'\n';
  writeFileSync(join(root,'pnpm-workspace.yaml'),configuration);writeFileSync(join(root,'pnpm-lock.yaml'),lock);
  const inventoryBytes=JSON.stringify(inventory);writeFileSync(join(evidence,'inventory.json'),inventoryBytes);
  const native={sourceInventorySha256:hash(inventoryBytes),workspaceConfigurationSha256:hash(configuration),lockSha256:hash(lock),tools:{node:process.versions.node,pnpm:'11.25.0'},commands:[{argv:['pnpm','install','--frozen-lockfile'],cwd:root,exitCode:0}],provenance:{kind:'unit-test-fixture',recordedBy:'test',observedAt:'2026-10-15',execution:'not-observed'}};
  const nativeBytes=JSON.stringify(native);writeFileSync(join(evidence,'native.json'),nativeBytes);
  const artifact={kind:'source-workspace',workspace:root,inventory:{path:join(evidence,'inventory.json'),sha256:hash(inventoryBytes)},configuration:{path:'pnpm-workspace.yaml',sha256:hash(configuration)},lockfile:{path:'pnpm-lock.yaml',sha256:hash(lock)},nativeReceiving:{path:join(evidence,'native.json'),sha256:hash(nativeBytes)}};
  return {root,evidence,manifest,inventory,artifact,packageDirectory:join(root,appPath),finish(){rmSync(root,{recursive:true,force:true});rmSync(evidence,{recursive:true,force:true});},writeInventory(){const bytes=JSON.stringify(inventory);writeFileSync(artifact.inventory.path,bytes);artifact.inventory.sha256=hash(bytes);native.sourceInventorySha256=hash(bytes);const bytes2=JSON.stringify(native);writeFileSync(artifact.nativeReceiving.path,bytes2);artifact.nativeReceiving.sha256=hash(bytes2);}};
}

for (const local of ['workspace:*','file:../provider','link:../provider','1.0.0']) test('source context binds its exact edge '+local, () => {
  const f=sourceFixture({local});try {
    const review=reviewJsnodePackage({manifest:f.manifest,packageDirectory:f.packageDirectory,artifact:f.artifact});
    assert.deepEqual(review.deviations,[]);
    assert.equal(review.evidenceBinding.sourceVerified,true);assert.equal(review.evidenceBinding.nativeRecordBound,true);
    assert.equal(review.evidenceBinding.executionVerified,false);assert.equal(review.evidenceBinding.provenanceVerified,false);
    assert.ok(reviewJsnodePackage({manifest:f.manifest}).deviations.some(d=>d.code==='local-dependency-specifier') || local==='1.0.0');
  } finally {f.finish();}
});

test('source context requires an actual directory and cannot waive registry checks',()=>{
 const f=sourceFixture();try {
  const source=reviewJsnodePackage({manifest:f.manifest,artifact:f.artifact});
  for(const code of ['source-workspace-unreceived','local-dependency-specifier','nonexact-house-dependency'])assert.ok(source.deviations.some(d=>d.code===code));
  const registry=reviewJsnodePackage({manifest:f.manifest,packageDirectory:f.packageDirectory,artifact:{kind:'registry-package'}});
  assert.ok(registry.deviations.some(d=>d.code==='local-dependency-specifier'));assert.ok(!('evidenceBinding'in registry));
 }finally{f.finish();}
});

for (const change of ['modify','add','delete','symlink','manifest','lock','configuration','native-record']) test('source context refuses changed '+change,()=>{
 const f=sourceFixture();try{
  const source=join(f.packageDirectory,'src/owned.mjs');
  if(change==='modify')writeFileSync(source,'export const changed = true;');
  if(change==='add')writeFileSync(join(f.packageDirectory,'src/unlisted.mjs'),'export const hidden = true;');
  if(change==='delete')rmSync(source);
  if(change==='symlink'){rmSync(source);symlinkSync(join(f.root,'provider/src/owned.mjs'),source);}
  if(change==='manifest')writeFileSync(join(f.packageDirectory,'package.json'),JSON.stringify({...f.manifest,version:'2.0.0'}));
  if(change==='lock')writeFileSync(join(f.root,'pnpm-lock.yaml'),'changed');
  if(change==='configuration')writeFileSync(join(f.root,'pnpm-workspace.yaml'),'changed');
  if(change==='native-record')writeFileSync(f.artifact.nativeReceiving.path,'{}');
  const review=reviewJsnodePackage({manifest:f.manifest,packageDirectory:f.packageDirectory,artifact:f.artifact});
  assert.ok(review.deviations.some(d=>d.code==='source-workspace-unreceived'));assert.equal(review.evidenceBinding.sourceVerified,change==='native-record');
  assert.ok(review.deviations.some(d=>d.code==='local-dependency-specifier'));assert.ok(review.deviations.some(d=>d.code==='nonexact-house-dependency'));
 }finally{f.finish();}
});

for(const field of ['dependencies','devDependencies','optionalDependencies','peerDependencies'])test('source closure retains '+field+' obligations',()=>{
 const f=sourceFixture({field});try{
  f.inventory.packages=f.inventory.packages.filter(row=>row.name!== '@red-cup-engineering/provider');f.inventory.generatedRoots=f.inventory.generatedRoots.filter(path=>path!=='provider/node_modules');f.writeInventory();
  const review=reviewJsnodePackage({manifest:f.manifest,packageDirectory:f.packageDirectory,artifact:f.artifact});
  assert.ok(review.deviations.some(d=>d.code==='source-workspace-unreceived'&&d.detail.includes(field)));
 }finally{f.finish();}
});

for(const local of ['workspace:^','^1.0.0','file:../runtime.tgz','link:../../outside'])test('unsupported or escaping source edge remains visible '+local,()=>{
 const f=sourceFixture({local});try{assert.ok(reviewJsnodePackage({manifest:f.manifest,packageDirectory:f.packageDirectory,artifact:f.artifact}).deviations.some(d=>d.code==='source-workspace-unreceived'));}finally{f.finish();}
});

test('source inventory cannot hide authored changes under a generated exclusion',()=>{
 const f=sourceFixture();try{f.inventory.generatedRoots.push('example-service/src');f.writeInventory();assert.ok(reviewJsnodePackage({manifest:f.manifest,packageDirectory:f.packageDirectory,artifact:f.artifact}).deviations.some(d=>d.code==='source-workspace-unreceived'));}finally{f.finish();}
});

test('a standalone source root owns its native lock; another adjacent lock stays visible',()=>{
 const f=sourceFixture({rootPackage:true});try{
  assert.deepEqual(lockfilePresentDeviations(f.root,f.artifact),[]);
  assert.deepEqual(lockfilePresentDeviations(f.root),[{code:'lockfile-present',detail:'pnpm-lock.yaml'}]);
  writeFileSync(join(f.root,'yarn.lock'),'unreceived');assert.ok(lockfilePresentDeviations(f.root,f.artifact).some(d=>d.detail==='yarn.lock'));
 }finally{f.finish();}
});

test('source-context CLI preserves its execution limit in ordinary and summary output',()=>{
 const f=sourceFixture();try{
  const input=join(f.evidence,'context.json');writeFileSync(input,JSON.stringify(f.artifact));
  const command=fileURLToPath(new URL('../scripts/review-jsnode-package.mjs',import.meta.url));
  for(const args of [[f.packageDirectory],['--all','--root',f.root,'--summary']]){
   const child=spawnSync(process.execPath,[command,...args,'--artifact',input],{encoding:'utf8',env:process.env});
   assert.ok([0,2].includes(child.status),child.stderr);
   const value=JSON.parse(child.stdout);const bindings=value.evidenceBindings??[value.evidenceBinding];assert.ok(bindings.length>0);
   for(const binding of bindings){assert.equal(binding.executionVerified,false);assert.equal(binding.provenanceVerified,false);}
  }
 }finally{f.finish();}
});


for (const extra of ['package.json','.npmrc','.pnpmfile.cjs','unselected/extra.mjs']) test('multi-root composition refuses added native input '+extra,()=>{
 const f=sourceFixture();try {
  f.inventory.sources=f.inventory.packages.map(row=>({repository:'fixtures/'+row.workspacePath,revision:row.revision,workspacePath:row.workspacePath}));
  for(const row of f.inventory.packages){row.repository='fixtures/'+row.workspacePath;row.path='.';}
  for(const row of f.inventory.files){const [mount,...parts]=row.workspacePath.split('/');row.repository='fixtures/'+mount;row.path=parts.join('/');}
  f.writeInventory();
  assert.equal(reviewJsnodePackage({manifest:f.manifest,packageDirectory:f.packageDirectory,artifact:f.artifact}).evidenceBinding.sourceVerified,true);
  const target=join(f.root,extra);mkdirSync(resolve(target,'..'),{recursive:true});writeFileSync(target,extra==='package.json'?'{}':'// unreceived native input\n');
  const review=reviewJsnodePackage({manifest:f.manifest,packageDirectory:f.packageDirectory,artifact:f.artifact});
  assert.equal(review.evidenceBinding.sourceVerified,false);assert.ok(review.deviations.some(d=>d.code==='source-workspace-unreceived'&&d.detail.includes(extra)));
 }finally{f.finish();}
});


for(const fault of ['wrong-command','conflicting-frozen','missing-tools','missing-provenance','wrong-target','missing-cwd'])test('native evidence rejects '+fault,()=>{
 const f=sourceFixture();try{
  const record=JSON.parse(readFileSync(f.artifact.nativeReceiving.path,'utf8'));
  if(fault==='wrong-command')record.commands[0].argv=['echo','install','--frozen-lockfile'];
  if(fault==='wrong-target')record.commands[0].argv=['pnpm','--dir','/unrelated-workspace','install','--frozen-lockfile'];
  if(fault==='missing-cwd')delete record.commands[0].cwd;
  if(fault==='conflicting-frozen')record.commands[0].argv.push('--no-frozen-lockfile');
  if(fault==='missing-tools')delete record.tools;
  if(fault==='missing-provenance')record.provenance={};
  const bytes=JSON.stringify(record);writeFileSync(f.artifact.nativeReceiving.path,bytes);f.artifact.nativeReceiving.sha256=createHash('sha256').update(bytes).digest('hex');
  const review=reviewJsnodePackage({manifest:f.manifest,packageDirectory:f.packageDirectory,artifact:f.artifact});
  assert.ok(review.deviations.some(d=>d.code==='source-workspace-unreceived'));assert.equal(review.evidenceBinding.nativeRecordBound,false);assert.equal(review.evidenceBinding.executionVerified,false);
 }finally{f.finish();}
});

test('relative standalone source directory retains its received native lock',()=>{
 const f=sourceFixture({rootPackage:true});try{assert.deepEqual(lockfilePresentDeviations(relative(process.cwd(),f.root),f.artifact),[]);}finally{f.finish();}
});

test('source tree review errors still expose native execution and provenance limits',()=>{
 const f=sourceFixture();try{
  writeFileSync(join(f.packageDirectory,'package.json'),'not-json');
  const result=reviewJsnodePackageTree({root:f.root,map:{packages:{example:'example-service'}},artifact:f.artifact});
  assert.ok(result.reports[0].deviations.some(d=>d.code==='review-error'));
  assert.equal(result.evidenceBindings[0].executionVerified,false);assert.equal(result.evidenceBindings[0].provenanceVerified,false);
 }finally{f.finish();}
});
