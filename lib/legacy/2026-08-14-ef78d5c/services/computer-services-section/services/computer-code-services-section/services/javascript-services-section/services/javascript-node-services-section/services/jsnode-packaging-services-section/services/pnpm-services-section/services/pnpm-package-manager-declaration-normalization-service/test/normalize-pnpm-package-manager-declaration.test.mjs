import assert from "node:assert/strict";
import test from "node:test";
import { normalizePnpmPackageManagerDeclaration } from "../scripts/normalize-pnpm-package-manager-declaration.mjs";

test("removes a pnpm package-manager declaration without mutating its manifest", () => {
  const manifest = { name: "x", packageManager: "pnpm@11" };
  assert.deepEqual(normalizePnpmPackageManagerDeclaration(manifest), { name: "x" });
  assert.equal(manifest.packageManager, "pnpm@11");
});
