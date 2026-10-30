import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkServicesSectionPlacement, deriveServicesSectionPath, servicesSectionCustody } from "../scripts/derive-services-section-path.mjs";

const S = "services";
const sections = [
  "engineering-services-section", "computer-engineering-services-section", "computer-systems-engineering-services-section",
  "computer-finance-systems-engineering-services-section", "science-services-section", "internal-services-section",
  "internal-operations-services-section", "public-services-section", "public-media-services-section",
];

test("custody is read from the name: internal, external, or the house its last word names", () => {
  assert.deepEqual(servicesSectionCustody("internal-operations-services-section"), { custody: "internal", root: "internal-services-section" });
  assert.deepEqual(servicesSectionCustody("public-media-services-section"), { custody: "public", root: "public-services-section" });
  assert.deepEqual(servicesSectionCustody("computer-systems-engineering-services-section"), { custody: "engineering", root: "engineering-services-section" });
  assert.equal(servicesSectionCustody("computer-services-section"), null);
  assert.equal(servicesSectionCustody("signcell"), null);
});

test("a section nests under the existing section whose name it specializes most closely", () => {
  assert.deepEqual(deriveServicesSectionPath({ name: "computer-finance-systems-engineering-services-section", sections }), {
    name: "computer-finance-systems-engineering-services-section", custody: "engineering", parent: "computer-systems-engineering-services-section",
    chain: ["engineering-services-section", "computer-engineering-services-section", "computer-systems-engineering-services-section", "computer-finance-systems-engineering-services-section"],
    path: `${S}/engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/computer-finance-systems-engineering-services-section`,
  });
  // A new name is placed through the sections that exist, the custody root being the least specific.
  assert.equal(deriveServicesSectionPath({ name: "computer-venue-systems-engineering-services-section", sections }).parent, "computer-systems-engineering-services-section");
  assert.equal(deriveServicesSectionPath({ name: "public-media-services-section", sections }).path, `${S}/public-services-section/services/public-media-services-section`);
  assert.equal(deriveServicesSectionPath({ name: "engineering-services-section", sections }).path, `${S}/engineering-services-section`);
});

test("a name the script cannot place is refused as a defect of the name", () => {
  assert.equal(deriveServicesSectionPath({ name: "computer-services-section", sections }).refused, "NAME_DERIVES_NO_CUSTODY");
  assert.equal(deriveServicesSectionPath({ name: "signcell", sections }).refused, "NOT_A_SECTION_NAME");
  const ambiguous = deriveServicesSectionPath({ name: "computer-data-code-engineering-services-section", sections: [...sections, "computer-data-engineering-services-section", "computer-code-engineering-services-section"] });
  assert.deepEqual(ambiguous, { refused: "AMBIGUOUS_PARENT", name: "computer-data-code-engineering-services-section", candidates: ["computer-code-engineering-services-section", "computer-data-engineering-services-section"] });
});

test("the placement check lists each section standing where its name does not place it", () => {
  const result = checkServicesSectionPlacement({ sections: [
    { name: "engineering-services-section", path: `${S}/engineering-services-section` },
    { name: "computer-engineering-services-section", path: `${S}/engineering-services-section/services/computer-engineering-services-section` },
    { name: "computer-systems-engineering-services-section", path: `${S}/engineering-services-section/services/computer-systems-engineering-services-section` },
    { name: "computer-services-section", path: `${S}/engineering-services-section/services/computer-services-section` },
  ] });
  assert.equal(result.checked, 4);
  assert.equal(result.placed, 2);
  assert.deepEqual(result.misplaced, [{ name: "computer-systems-engineering-services-section", path: `${S}/engineering-services-section/services/computer-systems-engineering-services-section`, derived: `${S}/engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section` }]);
  assert.deepEqual(result.refused.map((row) => [row.name, row.refused]), [["computer-services-section", "NAME_DERIVES_NO_CUSTODY"]]);
});

test("a section's name is derived from where it stands: its own words within its parent's, closed by the custody", async () => {
  const { deriveServicesSectionName } = await import("../scripts/derive-services-section-path.mjs");
  assert.deepEqual(deriveServicesSectionName({ name: "javascript-node-services-section", parent: "javascript-engineering-services-section" }),
    { name: "javascript-node-services-section", derived: "javascript-node-engineering-services-section", renamed: true });
  assert.equal(deriveServicesSectionName({ name: "javascript-engineering-services-section", parent: "computer-code-engineering-services-section" }).derived, "computer-code-javascript-engineering-services-section");
  assert.equal(deriveServicesSectionName({ name: "koios-news-services-section", parent: "public-media-services-section" }).derived, "public-media-koios-news-services-section");
  assert.equal(deriveServicesSectionName({ name: "computer-engineering-services-section", parent: "engineering-services-section" }).renamed, false);
  assert.equal(deriveServicesSectionName({ name: "engineering-services-section", parent: null }).renamed, false);
  assert.equal(deriveServicesSectionName({ name: "x-science-services-section", parent: "computer-engineering-services-section" }).refused, "CUSTODY_CONFLICT");
  assert.equal(deriveServicesSectionName({ name: "bare-cedar-fog-services-section", parent: null }).refused, "NO_PARENT_SECTION");
});

test("names are planned parents first, each child derived against its parent's planned name", async () => {
  const { planServicesSectionNames } = await import("../scripts/derive-services-section-path.mjs");
  const plan = planServicesSectionNames({ sections: [
    { name: "deployment-services-section", path: `${S}/engineering-services-section/services/software-development-services-section/services/deployment-services-section` },
    { name: "software-development-services-section", path: `${S}/engineering-services-section/services/software-development-services-section` },
    { name: "engineering-services-section", path: `${S}/engineering-services-section` },
  ] });
  assert.deepEqual(plan.planned.map((row) => row.derived), ["software-development-engineering-services-section", "software-development-deployment-engineering-services-section"]);
  assert.equal(plan.unchanged, 1);
  assert.deepEqual(plan.refused, []);
  assert.deepEqual(plan.collisions, []);
  const clash = planServicesSectionNames({ sections: [
    { name: "engineering-services-section", path: `${S}/engineering-services-section` },
    { name: "computer-engineering-services-section", path: `${S}/engineering-services-section/services/computer-engineering-services-section` },
    { name: "computer-services-section", path: `${S}/engineering-services-section/services/computer-services-section` },
  ] });
  assert.deepEqual(clash.collisions, [{ name: "computer-engineering-services-section", paths: [`${S}/engineering-services-section/services/computer-engineering-services-section`, `${S}/engineering-services-section/services/computer-services-section`] }]);
});

test("the command derives the same result through a symbolic-link alias as through its physical path", async (t) => {
  const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const holder = await mkdtemp(join(tmpdir(), "derive-alias-"));
  t.after(() => rm(holder, { recursive: true, force: true }));
  // A Guix profile reaches an installed package through a symbolic link, as this alias does.
  const alias = join(holder, "profile-package");
  await symlink(packageDir, alias);
  const input = `${JSON.stringify({ name: "computer-venue-systems-engineering-services-section", sections })}\n`;
  const run = (dir) => spawnSync(process.execPath, [join(dir, "scripts/derive-services-section-path.mjs")], { input, encoding: "utf8" });
  const physical = run(packageDir), through = run(alias);
  assert.equal(physical.status, 0, physical.stderr);
  assert.equal(through.status, 0, through.stderr);
  assert.notEqual(through.stdout, "", "the alias runs main instead of exiting with nothing");
  assert.equal(through.stdout, physical.stdout);
  assert.equal(JSON.parse(through.stdout).parent, "computer-systems-engineering-services-section");
});
