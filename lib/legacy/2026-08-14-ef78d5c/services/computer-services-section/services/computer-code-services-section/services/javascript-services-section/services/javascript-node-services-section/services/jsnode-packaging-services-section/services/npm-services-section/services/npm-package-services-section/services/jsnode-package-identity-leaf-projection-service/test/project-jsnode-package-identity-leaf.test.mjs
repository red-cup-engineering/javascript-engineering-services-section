import assert from "node:assert/strict";
import test from "node:test";

import { projectJsnodePackageIdentityLeaf } from "../scripts/project-jsnode-package-identity-leaf.mjs";

test("projects the repository's normalized JSNode identity leaf", () => {
  assert.equal(projectJsnodePackageIdentityLeaf("@emsenn/EO-Thing Service"), "thing-service");
});

test("refuses a name which yields no package leaf", () => {
  assert.throws(() => projectJsnodePackageIdentityLeaf("---"), /valid npm package leaf/u);
});
