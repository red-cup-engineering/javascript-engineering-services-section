import assert from "node:assert/strict";
import test from "node:test";
import { importsOfFiles } from "../src/package-imports.mjs";
import { formatManifestLike, syncPackageManifest } from "../src/sync-package-manifest.mjs";

const R = "@red-cup-engineering/";
const manifest = {
  name: `${R}subject`,
  scripts: { audit: `node node_modules/${R}script-tool/bin/audit.mjs` },
  loadsByName: [`${R}named-driver`],
  dependencies: { semver: "7.7.2", [`${R}used`]: "workspace:*", [`${R}unused`]: "workspace:*", [`${R}tested`]: "0.2.0", [`${R}named-driver`]: "workspace:*", [`${R}script-tool`]: "workspace:*" },
  devDependencies: { [`${R}stale-dev`]: "workspace:*", [`${R}runtime-in-dev`]: "workspace:*" },
  peerDependencies: { [`${R}peer`]: "workspace:*" },
};
const imports = importsOfFiles([
  { path: "src/a.mjs", text: `import "${R}used"; import "${R}runtime-in-dev"; import "${R}undeclared"; import "${R}peer"; import "${R}subject/self";` },
  { path: "test/a.test.mjs", text: `import "${R}tested"; import "${R}used"; import "${R}unknown-test";` },
]);

test("house dependencies become exactly what the code uses, scripts name and loadsByName declares", () => {
  const { manifest: synced, changes, unresolved } = syncPackageManifest(manifest, imports, { rangeOf: (name) => name === `${R}undeclared` ? "workspace:*" : null });
  assert.deepEqual(synced.dependencies, { semver: "7.7.2", [`${R}used`]: "workspace:*", [`${R}named-driver`]: "workspace:*", [`${R}script-tool`]: "workspace:*", [`${R}runtime-in-dev`]: "workspace:*", [`${R}undeclared`]: "workspace:*" });
  assert.deepEqual(synced.devDependencies, { [`${R}tested`]: "0.2.0" });
  assert.deepEqual(synced.peerDependencies, manifest.peerDependencies);
  assert.deepEqual(changes.map(({ dependency, action }) => [dependency.slice(R.length), action]), [
    ["unused", "removed"], ["tested", "moved-to-devDependencies"], ["stale-dev", "removed"], ["runtime-in-dev", "moved-to-dependencies"], ["undeclared", "added"],
  ]);
  assert.deepEqual(unresolved, [{ dependency: `${R}unknown-test`, wanted: "devDependencies" }]);
});

test("a manifest already in sync reports no changes, and loadsByName must name house packages", () => {
  const synced = syncPackageManifest(manifest, imports, { rangeOf: () => "workspace:*" }).manifest;
  assert.deepEqual(syncPackageManifest(synced, imports, { rangeOf: () => "workspace:*" }).changes, []);
  assert.throws(() => syncPackageManifest({ ...manifest, loadsByName: ["semver"] }, imports), TypeError);
});

test("a rewritten manifest keeps its indent, escapes and trailing whitespace", () => {
  const original = '{\n    "description": "a \\u2014 b",\n    "dependencies": {}\n}\n\n';
  assert.equal(formatManifestLike(original, { description: "a — b", dependencies: {} }), original);
});

test("without add, a used but undeclared house package is reported, not declared", () => {
  const { manifest: synced, changes, undeclared } = syncPackageManifest(manifest, imports, { rangeOf: () => "workspace:*", add: false });
  assert.equal(synced.dependencies[`${R}undeclared`], undefined);
  assert.ok(!changes.some((change) => change.action === "added"));
  assert.deepEqual(undeclared.map(({ dependency, wanted }) => [dependency.slice(R.length), wanted]), [["undeclared", "dependencies"], ["unknown-test", "devDependencies"]]);
});
