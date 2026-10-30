import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const configPath = fileURLToPath(
  new URL("../content/config/config.yaml", import.meta.url),
);

test("registry policy exposes exactly the six legitimate estate scopes", () => {
  const config = readFileSync(configPath, "utf8");
  const scopes = [
    ...config.matchAll(/^  '(@[^/']+)\/\*':/gm),
  ].map((match) => match[1]);

  assert.deepEqual(scopes, [
    "@561-group",
    "@causeway-services",
    "@coesite-operations",
    "@emsenn",
    "@lenticule-science",
    "@red-cup-engineering",
  ]);
});

test("the public fallback cannot publish or unpublish packages", () => {
  const config = readFileSync(configPath, "utf8");
  const fallback = config.match(/^  '\*\*':\n((?: {4}.+\n)+)/m)?.[1] ?? "";

  assert.match(fallback, /^    access: \$all$/m);
  assert.match(fallback, /^    proxy: npmjs$/m);
  assert.doesNotMatch(fallback, /^    (?:un)?publish:/m);
});
