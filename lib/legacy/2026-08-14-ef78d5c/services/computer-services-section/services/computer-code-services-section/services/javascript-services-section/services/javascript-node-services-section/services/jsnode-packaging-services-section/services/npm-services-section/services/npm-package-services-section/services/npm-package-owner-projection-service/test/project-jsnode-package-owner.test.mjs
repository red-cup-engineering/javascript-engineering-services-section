import assert from "node:assert/strict";
import test from "node:test";
import { projectJsnodePackageOwner } from "../scripts/project-jsnode-package-owner.mjs";

test("projects the most specific declared package-owner territory", () => {
  assert.equal(projectJsnodePackageOwner("services/rsc-quiescent/services/aagaard/services/x").owner, "aagaard");
  assert.equal(projectJsnodePackageOwner("services/red-cup-engineering/services/x").owner, "red-cup-engineering");
  assert.equal(projectJsnodePackageOwner("services/engineering-services-section/services/computer-services-section/services/x").owner, "red-cup-engineering");
});

test("refuses a path outside the declared projection", () => {
  assert.throws(() => projectJsnodePackageOwner("tmp/example"), /no package-owner projection/u);
});
