import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { measureServicesSectionFitness } from "../scripts/measure-services-section-fitness.mjs";
import { installSectionLaw } from "./section-law-fixture.mjs";

test("each law location a section violates is one misfit, however many entries violate it", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "section-fitness-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await installSectionLaw(root);
  const fitting = "services/engineering-services-section/services/widget-engineering-services-section";
  const misfitting = "services/engineering-services-section/services/gadget-engineering-services-section";
  await mkdir(resolve(root, fitting, "apps/widget-engine"), { recursive: true });
  await mkdir(resolve(root, misfitting, "apps"), { recursive: true });
  await mkdir(resolve(root, misfitting, "data/cache"), { recursive: true });
  await Promise.all([
    writeFile(resolve(root, fitting, "README.md"), "# Widget\n"),
    writeFile(resolve(root, fitting, "apps/widget-engine/cli.mjs"), "\n"),
    writeFile(resolve(root, misfitting, "README.md"), "# Gadget\n"),
    writeFile(resolve(root, misfitting, "apps/gadget-cli.mjs"), "\n"),
    writeFile(resolve(root, misfitting, "apps/shop.mjs"), "\n"),
    writeFile(resolve(root, misfitting, "data/cache/x.json"), "{}\n"),
  ]);
  const fitness = await measureServicesSectionFitness({ root });
  assert.equal(fitness.type, "ServicesSectionFitness");
  assert.equal(fitness.lens, "directory");
  assert.equal(fitness.sections, 4, "the two houses holding them and the two sections");
  assert.equal(fitness.fitting, 3);
  assert.deepEqual(fitness.misfitting.map(section => section.path), [misfitting]);
  assert.deepEqual(Object.keys(fitness.misfitting[0].misfits).sort(), ["/code/apps pattern", "/data/other maxItems"]);
  assert.deepEqual(fitness.misfitting[0].misfits["/code/apps pattern"].map(misfit => [misfit.at, misfit.value]),
    [["/code/apps/0", "gadget-cli.mjs"], ["/code/apps/1", "shop.mjs"]], "each violating entry is named where it stands");
  assert.deepEqual(fitness.misfits, { "/code/apps pattern": 1, "/data/other maxItems": 1 });
});

test("refuses a missing root", async () => {
  await assert.rejects(measureServicesSectionFitness({}), TypeError);
});
