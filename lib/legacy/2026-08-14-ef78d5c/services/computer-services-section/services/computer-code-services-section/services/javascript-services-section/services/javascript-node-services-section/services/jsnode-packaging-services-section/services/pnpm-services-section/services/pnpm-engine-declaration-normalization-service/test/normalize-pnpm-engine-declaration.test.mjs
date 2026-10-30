import assert from "node:assert/strict";
import test from "node:test";
import { normalizePnpmEngineDeclaration } from "../scripts/normalize-pnpm-engine-declaration.mjs";

test("removes the pnpm engine declaration and preserves other engines", () => {
  const manifest = { engines: { node: ">=22", pnpm: ">=11" } };
  assert.deepEqual(normalizePnpmEngineDeclaration(manifest), { engines: { node: ">=22" } });
  assert.deepEqual(manifest.engines, { node: ">=22", pnpm: ">=11" });
});
