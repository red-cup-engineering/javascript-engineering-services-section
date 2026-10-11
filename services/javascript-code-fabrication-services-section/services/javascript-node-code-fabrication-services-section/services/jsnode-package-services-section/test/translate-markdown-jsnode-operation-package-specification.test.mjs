import assert from "node:assert/strict";
import { runJavascriptNodeOperationModule } from "@red-cup-engineering/javascript-node-services-section/operation";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { admitJsnodeOperationPackageSpecification } from "../src/admit-jsnode-operation-package-specification.mjs";
import { createJsnodeOperationPackage } from "../src/create-jsnode-operation-package.mjs";
import { projectJsnodeOperationPackage } from "../src/project-jsnode-operation-package.mjs";
import { JSNODE_PACKAGE_DIALECT_EXAMPLE } from "../src/jsnode-package.mjs";
import { translateMarkdownJsnodeOperationPackageSpecification } from "../src/translate-markdown-jsnode-operation-package-specification.mjs";

function translate(text = JSNODE_PACKAGE_DIALECT_EXAMPLE) {
  return translateMarkdownJsnodeOperationPackageSpecification({
    type: "MarkdownJsnodeOperationPackageSpecificationTranslationRequest", version: 1,
    source: { type: "MarkdownDocumentSource", path: "fixtures/number-topic.md", text },
  });
}

test("translates the grouped v2 Markdown dialect through admission and projection", () => {
  const translation = translate();
  assert.equal(translation.type, "MarkdownJsnodeOperationPackageSpecificationTranslation", JSON.stringify(translation));
  const admitted = admitJsnodeOperationPackageSpecification(translation.jsnodeOperationPackageSpecificationCandidate);
  assert.equal(admitted.type, "JsnodeOperationPackageSpecification", JSON.stringify(admitted));
  assert.equal(admitted.version, 2);
  assert.equal(admitted.operations.length, 2);
  assert.equal(
    translation.artifactSpecificationCandidate.projections[0].target,
    "@red-cup-engineering/jsnode-package-services-section/admit-jsnode-operation-package-specification",
  );
  const projection = projectJsnodeOperationPackage(admitted);
  assert.equal(projection.type, "JsnodeOperationPackageProjection");
  assert.ok(projection.files.some((file) => file.path === "apps/number-topic-cli.mjs"));
  assert.ok(projection.files.some((file) => file.path === "src/numbers.mjs"));
});

test("creates a two-operation Markdown v2 topic with one shared source and one CLI", async (t) => {
  const parent = await mkdtemp("/tmp/markdown-v2-topic-");
  t.after(() => rm(parent, { recursive: true, force: true }));
  const translation = translate();
  const result = await createJsnodeOperationPackage({
    type: "JsnodeOperationPackageCreationRequest", version: 1, destination: path.join(parent, "number-topic-service"), registry: "http://127.0.0.1:4873/",
    specification: translation.jsnodeOperationPackageSpecificationCandidate,
  });
  assert.equal(result.type, "JsnodeOperationPackageCreationReceipt", JSON.stringify(result));
});

test("refuses malformed v2 operation fences with their source span", () => {
  const result = translate(JSNODE_PACKAGE_DIALECT_EXAMPLE.replace('"module":"src/numbers.mjs"', '"module":false'));
  assert.equal(result.type, "MarkdownJsnodeOperationPackageSpecificationTranslationRefusal");
  assert.equal(result.code, "INVALID_OPERATION_SECTION");
  assert.ok(result.sourceSpan.startLine > 1);
});

test("the Markdown-file command delegates to the parent translator", async (t) => {
  const directory = await mkdtemp("/tmp/markdown-cli-");
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixturePath = path.join(directory, "number-topic.md");
  await writeFile(fixturePath, JSNODE_PACKAGE_DIALECT_EXAMPLE);
  const { command } = await import("../apps/translate-markdown-cli.mjs");
  let stdout = "";
  const result = await runJavascriptNodeOperationModule({ command }, {
    arguments: [fixturePath],
    standardOutput: { write(text, done) { stdout += text; done?.(); return true; } },
    standardError: { write(text, done) { done?.(); return true; } },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(JSON.parse(stdout).type, "MarkdownJsnodeOperationPackageSpecificationTranslation");
});
