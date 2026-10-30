import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = fileURLToPath(new URL("../scripts/normalize-jsnode-package-identity.mjs", import.meta.url));

test("the CLI entrypoint prints the normalized identity as JSON", () => {
  const output = execFileSync(process.execPath, [
    scriptPath,
    "--package-name", "@emsenn/example-service",
    "--owner", "red-cup-engineering",
  ], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(output), {
    type: "JsnodePackageIdentityNormalization",
    priorName: "@emsenn/example-service",
    owner: "red-cup-engineering",
    leaf: "example-service",
    name: "@red-cup-engineering/example-service",
  });
});

test("the CLI refuses to run without required arguments", () => {
  assert.throws(() => execFileSync(process.execPath, [scriptPath], { encoding: "utf8", stdio: "pipe" }));
});

test("the CLI prints usage on --help without requiring other arguments", () => {
  const output = execFileSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });
  assert.match(output, /usage: normalize-jsnode-package-identity/u);
});
