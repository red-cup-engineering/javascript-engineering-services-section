import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readJsnodePackageBody } from "../scripts/read-jsnode-package-body.mjs";

test("reads only the explicit package set and its active source files", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "jsnode-package-body-read-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const selected = join(root, "selected");
  const omitted = join(root, "omitted");
  await mkdir(join(selected, "src"), { recursive: true });
  await mkdir(join(selected, "test"), { recursive: true });
  await mkdir(omitted);
  await writeFile(join(selected, "package.json"), '{"name":"@owner/selected"}\n');
  await writeFile(join(selected, "src/index.mjs"), "export {};\n");
  await writeFile(join(selected, "test/index.mjs"), "throw new Error();\n");
  await writeFile(join(omitted, "package.json"), '{"name":"@owner/omitted"}\n');
  await writeFile(join(omitted, "index.mjs"), "export {};\n");
  const reading = await readJsnodePackageBody({ root, directories: [selected] });
  assert.deepEqual(reading.packages.map(({ manifest }) => manifest.name), ["@owner/selected"]);
  assert.deepEqual(reading.sourceFiles, ["selected/src/index.mjs"]);
});

test("refuses package directories outside the named root", async () => {
  await assert.rejects(() => readJsnodePackageBody({ root: "/one", directories: ["/two"] }), /outside root/u);
});
