import assert from "node:assert/strict";
import test from "node:test";
import { assayPackageBackedSettlement } from "../services/package-backed-settlement-assay-service/src/assay-package-backed-settlement.mjs";
import worker from "../services/package-backed-settlement-assay-service/src/worker.mjs";

const id = "ni:///sha-256;" + "A".repeat(43);
const pkg = Object.freeze({name: "@red-cup-engineering/example-cell", version: "1.0.0"});
const name = (i) => "@inert/material-" + i;
const material = (i) => ({package: name(i), semanticId: id, authority: "none"});
const make = (indices, installed, extra = {}) => assayPackageBackedSettlement({
  specification: {package: pkg, materials: indices.map(material)},
  packageManifest: {...pkg, dependencies: Object.fromEntries(installed.map(i => [name(i), "1.0.0"])), ...extra},
});

test("declared material cover equals the actual direct dependency cover: 64 exhaustive finite cases", () => {
  for (let want = 0; want < 8; want++) {
    for (let found = 0; found < 8; found++) {
      const required = [0,1,2].filter(i => want & (1 << i));
      const installed = [0,1,2].filter(i => found & (1 << i));
      const receipt = make(required, installed);
      assert.equal(receipt.settled, want === found, "want=" + want + ", found=" + found);
      assert.equal(receipt.scope, "declared-direct-runtime-dependencies");
      for (const i of required.filter(i => !installed.includes(i)))
        assert(receipt.defects.includes("material:" + name(i) + ":not-in-dependencies"));
      for (const i of installed.filter(i => !required.includes(i)))
        assert(receipt.defects.includes("dependency:" + name(i) + ":unbound-effect"));
    }
  }
});

test("missing and malformed dependency declarations are not evidence of an empty cover", () => {
  const source = {package: pkg, materials: [material(0)]};
  for (const dependencies of [undefined, null, [], "nope"]) {
    const manifest = {...pkg};
    if (dependencies !== undefined) manifest.dependencies = dependencies;
    assert.equal(assayPackageBackedSettlement({specification: source, packageManifest: manifest}).settled, false);
  }
  const manifest = {...pkg};
  let access = 0;
  Object.defineProperty(manifest, "dependencies", {get() {access++;return {[name(0)]: "1.0.0"};}});
  const receipt = assayPackageBackedSettlement({specification: source, packageManifest: manifest});
  assert.deepEqual(receipt.defects, ["dependencies:unreadable"]);
  assert.equal(access, 0);
});

test("duplicate, effectful and unknown material identities and malformed dependency values remain obstructions", () => {
  const source = {package: pkg, materials: [
    material(0), material(0), {...material(1), authority: "network"}, {...material(2), semanticId: null},
  ]};
  const receipt = assayPackageBackedSettlement({specification: source,
    packageManifest: {...pkg, dependencies: {
      [name(0)]: "1.0.0", [name(1)]: null, [name(2)]: "1.0.0",
    }}});
  assert(receipt.defects.includes("material:" + name(0) + ":duplicate"));
  assert(receipt.defects.includes("material:" + name(1) + ":effectful"));
  assert(receipt.defects.includes("material:" + name(2) + ":identity-unobserved"));
  assert(receipt.defects.includes("dependency:" + name(1) + ":declaration-invalid"));
  assert.equal(receipt.settled, false);
});

test("unassayed runtime dependency groups and lifecycle hooks cannot be silently hidden", () => {
  for (const key of ["optionalDependencies", "peerDependencies", "bundleDependencies", "bundledDependencies"]) {
    const receipt = make([0], [0], {[key]: {[name(1)]: "1.0.0"}});
    assert(receipt.defects.includes("dependency-group:" + key + ":unassayed"));
  }
  for (const key of ["preinstall", "install", "postinstall", "prepack", "prepare", "postpack"]) {
    const receipt = make([0], [0], {scripts: {[key]: "node scripts/do-work.mjs"}});
    assert(receipt.defects.includes("package-lifecycle:" + key + ":unassayed"));
  }
  assert.equal(make([0], [0], {scripts: {test: "node --test"}}).settled, true);
});

test("a missing manifest or wrong package identity remains an explicit refusal", () => {
  const specification = {package: pkg, materials: [material(0)]};
  const absent = assayPackageBackedSettlement({specification});
  assert.deepEqual(absent.defects, ["package-manifest:unobserved"]);
  assert.equal(assayPackageBackedSettlement({specification,
    packageManifest: {...pkg, name: "@wrong/package", dependencies: {[name(0)]: "1.0.0"}}}).settled, false);
});

test("the actual HTTP worker refuses the missing-material case and accepts the matching declared cover", async () => {
  const specification = {package: pkg, materials: [material(0)]};
  for (const [dependencies, expected] of [[{}, false], [{[name(0)]: "1.0.0"}, true]]) {
    const response = await worker.fetch(new Request("https://example.invalid/invoke", {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({specification, packageManifest: {...pkg, dependencies}}),
    }));
    assert.equal(response.status, 200);
    const receipt = await response.json();
    assert.equal(receipt.settled, expected);
    assert.equal(receipt.scope, "declared-direct-runtime-dependencies");
  }
});
