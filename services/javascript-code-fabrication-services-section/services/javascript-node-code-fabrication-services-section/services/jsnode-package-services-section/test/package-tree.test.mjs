import assert from "node:assert/strict";
import test from "node:test";
import { nestedRootsOf, ownedFiles, packageRoots } from "../src/package-tree.mjs";

const tracked = [
  "package.json", "src/a.mjs", "test/fixtures/package.json", "lib/legacy/old/package.json",
  "services/one/package.json", "services/one/src/b.mjs", "services/one/services/two/package.json", "services/one/services/two/src/c.mjs",
];

test("packages are the tracked manifests outside legacy and test trees, and a file belongs to the deepest one", () => {
  const roots = packageRoots(tracked);
  assert.deepEqual(roots, [".", "services/one", "services/one/services/two"]);
  assert.deepEqual(nestedRootsOf("services/one", roots), ["services/two"]);
  assert.deepEqual(ownedFiles("services/one", roots, tracked), [{ path: "package.json", file: "services/one/package.json" }, { path: "src/b.mjs", file: "services/one/src/b.mjs" }]);
  assert.deepEqual(ownedFiles(".", roots, tracked).map(({ path }) => path), ["package.json", "src/a.mjs", "test/fixtures/package.json", "lib/legacy/old/package.json"]);
});
