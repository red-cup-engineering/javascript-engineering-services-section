import assert from "node:assert/strict";
import test from "node:test";
import { normalizeNpmPackageLifecycleScripts } from "../scripts/normalize-npm-package-lifecycle-scripts.mjs";

test("maps lifecycle-command normalization across manifest scripts", () => {
  const manifest = { scripts: { check: "pnpm run lint", test: "pnpm test" } };
  assert.deepEqual(normalizeNpmPackageLifecycleScripts(manifest), { scripts: { check: "npm run lint", test: "npm test" } });
  assert.deepEqual(manifest, { scripts: { check: "pnpm run lint", test: "pnpm test" } });
});
