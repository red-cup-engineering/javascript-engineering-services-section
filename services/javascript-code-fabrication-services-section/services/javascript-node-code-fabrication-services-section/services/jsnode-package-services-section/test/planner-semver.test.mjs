import assert from "node:assert/strict";
import test from "node:test";
import { planJsnodeModules } from "../src/plan-jsnode-modules.mjs";
import { moduleWorkOrder } from "./fixtures/module-work-order.mjs";

const planWithVersion = version => {
  const candidate = moduleWorkOrder();
  // A version-token grammar assay, not a claim that this test dependency is installed.
  candidate.projections[0].configuration.dependencies = { "fixture-dependency": version };
  return planJsnodeModules(candidate);
};

test("ordinary module planning retains exact stable dependency versions", () => {
  assert.equal(planWithVersion("1.2.3").type, "JsnodeModuleFabricationPlan");
});

test("ordinary module planning admits exact development SemVer and build metadata", () => {
  for (const version of ["0.1.4-dev.1", "1.2.3-rc.2+build.5"]) {
    assert.equal(planWithVersion(version).type, "JsnodeModuleFabricationPlan", version);
  }
});

test("the existing canonical version admission refuses malformed versions and ranges", () => {
  for (const version of ["1.2", "01.2.3", "1.2.3-dev.01", "^1.2.3", "latest"]) {
    const result = planWithVersion(version);
    assert.equal(result.type, "JsnodeModuleDerivationRefusal", version);
    assert.equal(result.phase, "module-meaning-closure-admission", version);
    assert.match(result.message, /exact SemVer/u);
  }
});
