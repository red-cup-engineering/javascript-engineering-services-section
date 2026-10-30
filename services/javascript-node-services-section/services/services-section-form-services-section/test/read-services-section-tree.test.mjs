import assert from "node:assert/strict";
import test from "node:test";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { readServicesSectionTree } from "../scripts/read-services-section-tree.mjs";
import { findServicesSectionRepositoryRoot, readServicesSectionLaw, readSourceOrganizations } from "../scripts/read-services-section-law.mjs";
import { installSectionLaw, law, sourceOrganizations } from "./section-law-fixture.mjs";
import { hypotheticalServiceSection } from "./fixtures/service-section.mjs";
import { readServiceSection } from "../src/service-section.mjs";

const legacyParent = "lib/emsenn/services/561-group";
const currentGroup = "services/internal-services-section";

async function temporaryRoot(t) {
  const root = await mkdtemp(resolve(tmpdir(), "section-reader-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function moveServicesToLegacy(root) {
  await mkdir(resolve(root, legacyParent), { recursive: true });
  await rename(resolve(root, "services"), resolve(root, legacyParent, "services"));
}

test("reads the current forest without importing section code", async (t) => {
  const root = await temporaryRoot(t);
  await installSectionLaw(root);
  const section = "services/public-services-section/services/example-public-services-section";
  const source = resolve(root, section);
  await mkdir(resolve(source, "apps/example"), { recursive: true });
  await mkdir(resolve(source, "src"), { recursive: true });
  const manifest = { name: "@example/public-source", version: "0.1.0", type: "module" };
  await Promise.all([
    writeFile(resolve(source, "README.md"), "# Source section\n"),
    writeFile(resolve(source, "package.json"), JSON.stringify(manifest)),
    writeFile(resolve(source, "apps/example/package.json"), JSON.stringify({ name: "@example/application", version: "0.1.0" })),
    writeFile(resolve(source, "src/unselected.mjs"), "throw new Error('a section read must not execute this module');\n"),
  ]);
  const path = section;
  assert.equal(await findServicesSectionRepositoryRoot(resolve(root, path)), root);
  const tree = await readServicesSectionTree({ root });
  assert.equal(tree.type, "ServicesSectionTree");
  assert.equal(tree.version, 1);
  assert.equal(tree.root, root);
  const found = tree.sections.find(entry => entry.form.path === path);
  assert.ok(found);
  assert.equal(found.form.custody, "public");
  assert.equal(found.readme, "# Source section\n");
  assert.deepEqual(found.packageJson, manifest);
  assert.deepEqual(found.packages.map(entry => entry.path), ["apps/example", ""]);
  assert.deepEqual(found.form.code.src, ["unselected.mjs"]);
  assert.equal(found.serviceSection, null, "directory presence does not fabricate a semantic Service Section");
  assert.deepEqual(await readServicesSectionLaw(root), law);
  assert.deepEqual(await readSourceOrganizations(root), sourceOrganizations);
});

test("selects the nearest qualified current forest", async (t) => {
  const outer = await temporaryRoot(t);
  await installSectionLaw(outer);
  const inner = resolve(outer, "nested");
  await installSectionLaw(inner);
  const inside = resolve(inner, "services");
  assert.equal(await findServicesSectionRepositoryRoot(inside), inner);
});

test("a legacy-only forest is not selected as the current Group law source", async (t) => {
  const root = await temporaryRoot(t);
  await installSectionLaw(root);
  await moveServicesToLegacy(root);
  assert.equal(await findServicesSectionRepositoryRoot(root), null);
  await assert.rejects(readServicesSectionTree({ root }), /services-section law requires a repository root/u);
});

test("current law takes precedence and incomplete current law does not borrow legacy files", async (t) => {
  const root = await temporaryRoot(t);
  await installSectionLaw(root);
  const legacy = resolve(root, legacyParent, currentGroup);
  await mkdir(resolve(root, legacyParent, "services"), { recursive: true });
  await cp(resolve(root, currentGroup), legacy, { recursive: true });
  const currentTaxonomy = resolve(root, currentGroup, "data/records/schemas/services-section-form-content-taxonomy.json");
  const legacyTaxonomy = resolve(legacy, "data/records/schemas/services-section-form-content-taxonomy.json");
  await writeFile(legacyTaxonomy, JSON.stringify({ ...law.contentTaxonomy, qualificationOnly: "legacy" }));
  assert.deepEqual((await readServicesSectionLaw(root)).contentTaxonomy, law.contentTaxonomy);
  await rm(currentTaxonomy);
  await assert.rejects(readServicesSectionLaw(root), error => error.code === "ENOENT" && error.path === currentTaxonomy);
  assert.equal(JSON.parse(await readFile(legacyTaxonomy, "utf8")).qualificationOnly, "legacy");
});

test("the existing forest reader consumes the same source-qualified Section and preserves its cells", async (t) => {
  const root = await temporaryRoot(t);
  await installSectionLaw(root);
  const path = "services/public-services-section/services/example-public-services-section";
  const source = resolve(root, path);
  await mkdir(resolve(source, "data/records"), { recursive: true });
  await mkdir(resolve(source, "src"), { recursive: true });
  const document = hypotheticalServiceSection();
  await Promise.all([
    writeFile(resolve(source, "data/records/service-section.json"), JSON.stringify(document)),
    writeFile(resolve(source, "src/never-run.mjs"), "throw new Error('a section read must not execute this module');\n"),
  ]);
  const tree = await readServicesSectionTree({ root });
  const found = tree.sections.find(entry => entry.form.path === path);
  assert.deepEqual(found.serviceSection, readServiceSection(document));
  assert.equal(found.form.type, "ServicesSectionForm");
  assert.ok(found.form.code.src.includes("never-run.mjs"));
  assert.equal(tree.sections.find(entry => entry.form.path === "services/public-services-section").serviceSection, null);
});

test("a present malformed Service Section is refused rather than reported absent", async (t) => {
  const root = await temporaryRoot(t);
  await installSectionLaw(root);
  const directory = resolve(root, "services/public-services-section/data/records");
  await mkdir(directory, { recursive: true });
  for (const malformed of ["null", "{"]) {
    await writeFile(resolve(directory, "service-section.json"), malformed);
    await assert.rejects(readServicesSectionTree({ root }), malformed === "null" ? TypeError : SyntaxError);
  }
});

test("a selected root without Group law refuses instead of using a machine checkout", async (t) => {
  const root = await temporaryRoot(t);
  assert.equal(await findServicesSectionRepositoryRoot(root), null);
  await assert.rejects(readServicesSectionLaw(root), error => error.code === "ENOENT");
  await assert.rejects(readServicesSectionTree({ root }), /services-section law requires a repository root/u);
});

test("only an unbroken services/<name> chain is a section; a snapshot's services/ is record content", async (t) => {
  const root = await temporaryRoot(t);
  await installSectionLaw(root);
  const section = "services/engineering-services-section/services/widget-engineering-services-section";
  const snapshot = `${section}/data/state/widget-snapshots/2026-10-28/services/copied-engineering-services-section`;
  await mkdir(resolve(root, snapshot), { recursive: true });
  await mkdir(resolve(root, section, "apps/widget-engine/src"), { recursive: true });
  await Promise.all([
    writeFile(resolve(root, section, "README.md"), "# Widget\n"),
    writeFile(resolve(root, snapshot, "README.md"), "# Copied\n"),
    writeFile(resolve(root, section, "apps/widget-engine/src/cli.mjs"), "\n"),
  ]);
  const tree = await readServicesSectionTree({ root });
  assert.deepEqual(tree.sections.map(entry => entry.form.path), ["services/engineering-services-section", section, "services/internal-services-section"]);
  const widget = tree.sections.find(entry => entry.form.path === section).form;
  assert.deepEqual(widget.data, { present: true, logs: false, records: false, state: true, other: [] });
  assert.deepEqual(widget.code.apps, ["widget-engine"]);
});

test("a read rooted inside the forest reports repository-relative paths and their custody", async (t) => {
  const root = await temporaryRoot(t);
  await installSectionLaw(root);
  const section = "services/internal-services-section/services/internal-widget-services-section";
  await mkdir(resolve(root, section), { recursive: true });
  await writeFile(resolve(root, section, "README.md"), "# Widget\n");
  const tree = await readServicesSectionTree({ root: resolve(root, "services/internal-services-section") });
  const found = tree.sections.find(entry => entry.form.path === section);
  assert.ok(found, tree.sections.map(entry => entry.form.path).join(", "));
  assert.equal(found.form.custody, "internal");
  assert.equal(found.readme, "# Widget\n");
});
