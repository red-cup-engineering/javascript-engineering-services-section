import assert from "node:assert/strict";
import test from "node:test";
import { parseSnapshotPublicationOptions, publishNpmRegistrySnapshot } from "../src/npm-registry-snapshot-publication-app.mjs";
test("requires explicit snapshot-pointer publication inputs", () => { assert.throws(() => parseSnapshotPublicationOptions([]), /required/u); assert.throws(() => parseSnapshotPublicationOptions(["--package", "a", "--host", "h", "--snapshot", "../bad", "--registry-url", "http://registry.invalid/"]), /safe snapshot/u); assert.deepEqual(parseSnapshotPublicationOptions(["--package", "a", "--host", "h", "--snapshot", "next", "--registry-url", "http://registry.invalid/"]).snapshotName, "next"); });

test("composes an immutable named snapshot, base snapshot, and pointer activation through injected capabilities", async () => {
  let directory, request;
  const result = await publishNpmRegistrySnapshot({ packages: ["/sources/a", "/sources/b"], hostDirectory: "/host", snapshotName: "next", baseSnapshot: "previous", registryUrl: "https://registry.example/", concurrency: 2 }, {
    async makeDirectory(path, options) { directory = { path, options }; },
    async capabilityLoader() { return {
      async coordinate(value) { request = value; return { type: "PublishedSnapshot", registry: value.registryUrl, packageCount: 2, activation: { activeSnapshot: "next" } }; },
      projectReleaseManifest() {}, projectCarrier() {}, pack() {}, assemble() {}, verify() {}, activate() {},
    }; },
  });
  assert.deepEqual(directory, { path: "/host/snapshots", options: { recursive: true } });
  assert.equal(request.outputDirectory, "/host/snapshots/next");
  assert.equal(request.baseRegistryDirectory, "/host/snapshots/previous");
  assert.deepEqual(request.packageDirectories, ["/sources/a", "/sources/b"]);
  assert.deepEqual(request.activation, { hostDirectory: "/host", candidateName: "next" });
  assert.equal(request.dependencies.projectReleaseManifest instanceof Function, true);
  assert.deepEqual(result, { type: "PublishedSnapshot", registry: "https://registry.example/", packageCount: 2, activation: { activeSnapshot: "next" } });
});
