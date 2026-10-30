import assert from "node:assert/strict";
import test from "node:test";

import { formNpmPackageLockRegenerationCommand } from "../scripts/form-npm-package-lock-regeneration-command.mjs";

test("forms an immutable shell-free npm package-lock request", () => {
  const command = formNpmPackageLockRegenerationCommand({ directory: "/work/package", npmExecutable: "/bin/npm", offline: true });
  assert.deepEqual(command, {
    type: "NpmPackageLockRegenerationCommand",
    command: "/bin/npm",
    arguments: ["install", "--package-lock-only", "--ignore-scripts", "--offline"],
    directory: "/work/package",
  });
  assert.equal(Object.isFrozen(command), true);
  assert.equal(Object.isFrozen(command.arguments), true);
});
