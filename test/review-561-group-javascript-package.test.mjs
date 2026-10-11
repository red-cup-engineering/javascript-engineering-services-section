import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { review561GroupJavascriptPackage } from "../scripts/review-561-group-javascript-package.mjs";

function makePackage(manifest, files = []) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "561-js-review-"));
  const directory = join(fixtureRoot, manifest.name.slice(manifest.name.lastIndexOf("/") + 1));
  mkdirSync(directory);
  writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
  for (const file of files) {
    const path = join(directory, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "");
  }
  return directory;
}

test("reviews exactly one clean package", () => {
  const directory = makePackage({ name: "@561-group/clean-service", version: "1.0.0", type: "module", scripts: { test: "node --test test/*.test.mjs" } }, ["test/clean.test.mjs"]);
  const review = review561GroupJavascriptPackage(directory);
  assert.equal(review.packageDirectory, directory);
  assert.deepEqual(review.deviations, []);
});

test("reports deviations without changing the package", () => {
  const manifest = { name: "@561-group/drifted-service", version: "1.0.0", type: "module", packageManager: "pnpm@9.0.0", scripts: { verify: "npm run check && npm test" } };
  const directory = makePackage(manifest);
  const review = review561GroupJavascriptPackage(directory);
  assert.deepEqual(review.deviations.map(({ code }) => code).sort(), ["manifest-not-normalized", "verification-script-layer"]);
  assert.deepEqual(JSON.parse(readFileSync(join(directory, "package.json"), "utf8")), manifest);
});
