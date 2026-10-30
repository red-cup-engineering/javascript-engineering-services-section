import assert from "node:assert/strict";
import test from "node:test";
import { normalizePnpmLifecycleCommand } from "../scripts/normalize-pnpm-lifecycle-command.mjs";

test("normalizes pnpm lifecycle command invocations", () => {
  assert.equal(normalizePnpmLifecycleCommand("pnpm run check && pnpm test"), "npm run check && npm test");
});
