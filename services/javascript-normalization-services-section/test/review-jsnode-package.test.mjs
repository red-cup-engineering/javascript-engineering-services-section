import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
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
