import { admitMarkdownJsnodeOperationPackageFabricationReceipt, foldFabricationReceiptIntoWorldRows } from "@red-cup-engineering/jsnode-package-services-section/fabrication-receipts";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { admitArtifactFabricationSpecification } from "@red-cup-engineering/computer-data-engineering-services-section/artifact-fabrication";
import { fabricateMarkdownJsnodeOperationPackage, selectSingleJsnodeProjection, publishJsnodeOperationPackageToRegistry } from "../src/fabricate-markdown-jsnode-operation-package.mjs";
import { translateMarkdownJsnodeOperationPackageSpecification } from "@red-cup-engineering/jsnode-package-services-section/translate-markdown-jsnode-operation-package-specification";
import { JSNODE_PACKAGE_DIALECT_EXAMPLE } from "@red-cup-engineering/jsnode-package-services-section/jsnode-package-dialect";

const fixturePath = fileURLToPath(new URL("./fixtures/greet-person.md", import.meta.url));
const fixture = await readFile(fixturePath, "utf8");
const registry = "http://127.0.0.1:4873";

test("receiving rejects a substituted work-order requirement before admitting creation evidence", () => {
  const translated = translateMarkdownJsnodeOperationPackageSpecification({
    type: "MarkdownJsnodeOperationPackageSpecificationTranslationRequest", version: 1,
    source: { type: "MarkdownDocumentSource", path: "/controlled/number-topic.md", text: JSNODE_PACKAGE_DIALECT_EXAMPLE },
  });
  const specification = admitArtifactFabricationSpecification(translated.artifactSpecificationCandidate);
  const orderCandidate = structuredClone(translated.artifactSpecificationCandidate);
  for (const projection of orderCandidate.projections) {
    projection.configuration.sources = [];
    projection.configuration.tests = [];
  }
  orderCandidate.requirements[0].statement = "Substituted after source derivation.";
  const substituted = admitArtifactFabricationSpecification(orderCandidate);
  // Deliberately incomplete receipt: the receiver must detect requirement
  // substitution before inspecting any claimed package creation evidence.
  assert.throws(() => admitMarkdownJsnodeOperationPackageFabricationReceipt({
    type: "MarkdownJsnodeOperationPackageFabricationReceipt", version: 1,
    artifactSpecification: specification,
    specificationDigest: specification.specificationDigest,
    sourceDigest: specification.source.provenance.digest,
    derivation: { type: "JsnodeClosureDerivation", version: 2,
      workOrderSpecification: substituted, workOrderSpecificationDigest: substituted.specificationDigest },
  }), { code: "WORK_ORDER_REALIZATION_BINDING_MISMATCH" });
});

function request(source, destination, publish = false) {
  return {
    type: "MarkdownJsnodeOperationPackageFabricationRequest",
    version: 1,
    source: { type: "MarkdownDocumentSource", path: fixturePath, text: source },
    destination,
    registry,
    publish,
  };
}

test("fabricates the admitted Markdown work order through package birth and binds all realization evidence", async () => {
  const root = await mkdtemp(path.join("/tmp", "markdown-jsnode-package-"));
  const destination = path.join(root, "greet-person-service");
  try {
    const result = await fabricateMarkdownJsnodeOperationPackage(request(fixture, destination));
    assert.equal(result.type, "MarkdownJsnodeOperationPackageFabricationReceipt");
    assert.match(result.sourceDigest, /^sha256:[a-f0-9]{64}$/u);
    assert.match(result.specificationDigest, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(result.jsnodeOperationPackageCreationReceipt.type, "JsnodeOperationPackageCreationReceipt");
    assert.equal(result.artifactFabricationRealizationReceipt.type, "ArtifactFabricationRealizationReceipt");
    assert.equal(result.artifactFabricationRealizationReceipt.specificationDigest, result.specificationDigest);
    assert.deepEqual(result.artifactFabricationRealizationReceipt.traceability.map((trace) => trace.requirementId), ["greeting-result", "missing-name-refusal"]);
    assert.equal(result.artifactFabricationRealizationReceipt.realizations.length, 1);
    assert.equal(result.artifactFabricationRealizationReceipt.acceptances.length, 1);
    const manifest = JSON.parse(await readFile(path.join(destination, "package.json"), "utf8"));
    assert.equal(manifest.name, "@red-cup-engineering/greet-person-service");
    assert.equal(manifest.engines.node, ">=24.2.0");
    assert.match(await readFile(path.join(destination, "README.md"), "utf8"), /Greets one named person/u);
    const { greetPerson } = await import(pathToFileURL(path.join(destination, "src", "greet-person.mjs")).href);
    assert.equal((await greetPerson({ name: "Ada" })).text, "Hello, Ada!");
    assert.throws(() => greetPerson({}), /name is required/u);
    assert.match(await readFile(path.join(destination, "test", "operation-contracts.test.mjs"), "utf8"), /greetPerson/u);
    assert.ok(result.jsnodeOperationPackageCreationReceipt.assays.length >= 6);
    assert.deepEqual(result.jsnodeOperationPackageRegistryPublication, { type: "JsnodeOperationPackageRegistryPublicationSkipped", version: 1, reason: "publish:false" });
    assert.ok(Object.isFrozen(result));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("publish:false writes the admitted source-to-realization receipt FROG folds with traceability", async () => {
  const root = await mkdtemp(path.join("/tmp", "markdown-jsnode-package-receipt-"));
  const destination = path.join(root, "greet-person-service");
  try {
    const result = await fabricateMarkdownJsnodeOperationPackage(request(fixture, destination));
    assert.equal(result.type, "MarkdownJsnodeOperationPackageFabricationReceipt", JSON.stringify(result));
    assert.equal(result.receiptPath, path.join(destination, "data", "records", `${new Date().toISOString().slice(0, 10)}-greet-person-fabrication-receipt.json`));

    const diskReceipt = JSON.parse(await readFile(result.receiptPath, "utf8"));
    assert.equal(diskReceipt.type, "MarkdownJsnodeOperationPackageFabricationReceipt");
    assert.equal(diskReceipt.jsnodeOperationPackageCreationReceipt.packageName, "@red-cup-engineering/greet-person-service");
    assert.equal(diskReceipt.jsnodeOperationPackageCreationReceipt.packageVersion, result.jsnodeOperationPackageCreationReceipt.packageVersion);
    assert.equal(diskReceipt.sourceDigest, result.sourceDigest);
    assert.equal(diskReceipt.specificationDigest, result.specificationDigest);
    assert.deepEqual(diskReceipt.jsnodeOperationPackageCreationReceipt.assays, result.jsnodeOperationPackageCreationReceipt.assays);
    assert.deepEqual(diskReceipt.artifactFabricationRealizationReceipt.traceability, result.artifactFabricationRealizationReceipt.traceability);

    const folded = foldFabricationReceiptIntoWorldRows({ receipt: diskReceipt, t: 1 });
    assert.equal(folded.type, "WorldRowsFold");
    assert.match(folded.address, /^jsnode-operation-package:/u);
    const genesisRow = folded.rows[0];
    assert.equal(genesisRow.a, "constituted");
    assert.equal(genesisRow.v.name, "@red-cup-engineering/greet-person-service");
    assert.ok(folded.rows.some((row) => row.a === "born-from-work-order" && row.v === fixturePath));
    assert.ok(folded.rows.some((row) => row.a === "assay-passed" && row.v === "syntax"));
    assert.deepEqual(folded.traceability, result.artifactFabricationRealizationReceipt.traceability);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("omitting publish performs development fabrication without registry publication", async () => {
  const root = await mkdtemp(path.join("/tmp", "markdown-jsnode-package-development-"));
  const destination = path.join(root, "greet-person-service");
  try {
    const input = request(fixture, destination);
    delete input.publish;
    const result = await fabricateMarkdownJsnodeOperationPackage(input);
    assert.equal(result.type, "MarkdownJsnodeOperationPackageFabricationReceipt", JSON.stringify(result));
    assert.equal(result.jsnodeOperationPackageRegistryPublication.type, "JsnodeOperationPackageRegistryPublicationSkipped");
    const diskReceipt = JSON.parse(await readFile(result.receiptPath, "utf8"));
    assert.equal(Object.hasOwn(diskReceipt, "registryPublication"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the public Markdown driver reaches grouped fabrication with publication omitted", async () => {
  const root = await mkdtemp(path.join("/tmp", "markdown-jsnode-topic-"));
  const translation = translateMarkdownJsnodeOperationPackageSpecification({ type: "MarkdownJsnodeOperationPackageSpecificationTranslationRequest", version: 1, source: { type: "MarkdownDocumentSource", path: "/test/topic.md", text: JSNODE_PACKAGE_DIALECT_EXAMPLE } });
  const candidate = translation.jsnodeOperationPackageSpecificationCandidate;
  const destination = path.join(root, candidate.packageName.split("/")[1]);
  try {
    const input = request(JSNODE_PACKAGE_DIALECT_EXAMPLE, destination);
    delete input.publish;
    const result = await fabricateMarkdownJsnodeOperationPackage(input);
    assert.equal(result.type, "MarkdownJsnodeOperationPackageFabricationReceipt", JSON.stringify(result));
    const manifest = JSON.parse(await readFile(path.join(destination, "package.json"), "utf8"));
    assert.deepEqual(Object.values(manifest.bin), ["apps/number-topic-cli.mjs"]);
    assert.equal(result.jsnodeOperationPackageRegistryPublication.type, "JsnodeOperationPackageRegistryPublicationSkipped");
    assert.equal(result.artifactSpecification.projections[0].configuration.version, 2);
    // Controlled receiving fixture: reconstruct a source-free order from this
    // authored example solely to exercise the order/realization identity rule.
    // This does not claim the authored package was inference-derived.
    const { type, version, specificationDigest, ...candidate } = result.artifactSpecification;
    const order = admitArtifactFabricationSpecification({
      type: "ArtifactFabricationSpecificationCandidate", version: 1, ...candidate,
      projections: candidate.projections.map((projection) => ({
        ...projection, configuration: { ...projection.configuration, sources: [], tests: [] },
      })),
    });
    const bound = { ...result, derivation: {
      type: "JsnodeClosureDerivation", version: 2,
      workOrderSpecification: order, workOrderSpecificationDigest: order.specificationDigest,
    } };
    assert.equal(admitMarkdownJsnodeOperationPackageFabricationReceipt(bound).derivation.workOrderSpecificationDigest, order.specificationDigest);
    assert.ok(foldFabricationReceiptIntoWorldRows({ receipt: bound, t: 1 }).rows.some((row) => row.a === "work-order-specification-digest" && row.v === order.specificationDigest));
    const altered = structuredClone(bound);
    const { type: orderType, version: orderVersion, specificationDigest: oldDigest, ...alteredCandidate } = altered.derivation.workOrderSpecification;
    alteredCandidate.requirements[0].statement = "A different requirement supplied after fabrication.";
    const alteredOrder = admitArtifactFabricationSpecification({ type: "ArtifactFabricationSpecificationCandidate", version: 1, ...alteredCandidate });
    altered.derivation.workOrderSpecification = alteredOrder;
    altered.derivation.workOrderSpecificationDigest = alteredOrder.specificationDigest;
    assert.throws(() => admitMarkdownJsnodeOperationPackageFabricationReceipt(altered), { code: "WORK_ORDER_REALIZATION_BINDING_MISMATCH" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("explicit publication propagates the shared gate refusal without its own npm publish loop", async () => {
  const commands = [];
  const result = await publishJsnodeOperationPackageToRegistry({ destination: "/tmp/topic", packageName: "@red-cup-engineering/topic", packageVersion: "0.1.0", registry: "https://registry.561.group" }, {
    execute: (request) => {
      commands.push(request);
      return { result: { status: 1, stdout: JSON.stringify({ outcome: "refused", refusal: { code: "TESTS_FAILED" } }), stderr: "" } };
    },
  });
  assert.equal(result.code, "TESTS_FAILED");
  assert.equal(result.phase, "publish-gate");
  assert.equal(commands.length, 1);
  assert.ok(commands[0].arguments.some((value) => value.endsWith("/scripts/publish-package.mjs")));
  assert.ok(commands[0].arguments.includes("--apply"));
});

test("blocking open questions refuse before JSNode package birth and leave the destination absent", async () => {
  const root = await mkdtemp(path.join("/tmp", "markdown-jsnode-package-blocked-"));
  const destination = path.join(root, "greet-person-service");
  try {
    const blocked = fixture.replace("none\n## Package", "- `license-choice` [blocking]: Decide the license.\n## Package");
    const result = await fabricateMarkdownJsnodeOperationPackage(request(blocked, destination));
    assert.equal(result.type, "MarkdownJsnodeOperationPackageFabricationRefusal");
    assert.equal(result.phase, "artifact-specification-admission");
    assert.equal(result.code, "BLOCKING_OPEN_QUESTION");
    await assert.rejects(stat(destination), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("additional admitted projections are refused by pre-creation JSNode projection selection", async () => {
  const translated = translateMarkdownJsnodeOperationPackageSpecification({ type: "MarkdownJsnodeOperationPackageSpecificationTranslationRequest", version: 1, source: { type: "MarkdownDocumentSource", path: fixturePath, text: fixture } });
  const candidate = structuredClone(translated.artifactSpecificationCandidate);
  candidate.projections.push({ type: "ArtifactFabricationProjection", version: 1, id: "unexecuted-projection", target: "example://unexecuted", configuration: {}, sourceSpan: { type: "ArtifactFabricationSourceSpan", startLine: 13, endLine: 13 } });
  const specification = admitArtifactFabricationSpecification(candidate);
  const selected = selectSingleJsnodeProjection(specification);
  assert.equal(selected.type, "MarkdownJsnodeOperationPackageFabricationRefusal");
  assert.equal(selected.phase, "jsnode-projection-selection");
  assert.equal(selected.code, "INVALID_JSNODE_PROJECTION");
});

test("preflight admits an evidence-free plan rather than synthetic realization evidence", async () => {
  const source = await readFile(new URL("../src/fabricate-markdown-jsnode-operation-package.mjs", import.meta.url), "utf8");
  assert.match(source, /admitArtifactFabricationRealizationPlan\(specification, realizationPlanCandidate\(specification\)\)/u);
  assert.doesNotMatch(source, /preflight:\/\//u);
  assert.doesNotMatch(source, /"0"\.repeat\(64\)/u);
});
