import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { admitArtifactFabricationSpecification, admitArtifactFabricationRealizationReceipt } from "@red-cup-engineering/computer-data-engineering-services-section/artifact-fabrication";
import { semanticId as receiptSemanticId } from "@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address";
import { schemaFromGraph } from "@red-cup-engineering/json-schema-services-section/contracts";
import { address, cell, cellSchema, cellSet, merge, presence, semanticId } from "@red-cup-engineering/signcell/cell";
import { execute as executeEavt } from "@red-cup-engineering/eavt-services-section";
import { moduleWorkOrder } from "./fixtures/module-work-order.mjs";
import { testsOfClosure } from "../src/derive-jsnode-package-from-closure.mjs";
import { admitMarkdownJsnodeOperationPackageFabricationReceipt, projectFabricationReceiptCells,
  admitFabricationReceiptCellProjection, readFabricationReceiptCellRows,
  fabricationReceiptCellProjectionSchema, FABRICATION_CELL_ATTRIBUTE,
  FABRICATION_CELL_PREDICATES as P, foldFabricationReceiptIntoWorldRows } from "../src/fabrication-receipts.mjs";
import { emitFabricationReceiptsToEavt } from "../scripts/emit-fabrication-receipts-to-eavt.mjs";

const digest = value => "sha256:" + createHash("sha256").update(value).digest("hex");

// This is an admitted report fixture, not an assertion that its reported
// assays or package creation were executed. All source witnesses say so.
function receiptFixture({ derivationVersion = 3, changedFiles = false } = {}) {
  const candidate = moduleWorkOrder();
  const orderConfiguration = candidate.projections[0].configuration;
  orderConfiguration.sources = [];
  orderConfiguration.tests = [];
  const order = admitArtifactFabricationSpecification(candidate);
  assert.equal(order.type, "ArtifactFabricationSpecification");
  const cases = [{ operation: "identity", name: "another value", clauses: ["identity"], input: 7, output: 7, throws: null }];
  const closure = { ...orderConfiguration, requirements: candidate.requirements,
    prohibitions: candidate.prohibitions, constraints: candidate.constraints };
  const realized = structuredClone(candidate);
  realized.projections[0].configuration.sources = [{ type: "JavascriptNodePackageSource", path: "src/identity.mjs", text: "export const identity = value => value;\n" }];
  realized.projections[0].configuration.tests = testsOfClosure(closure, cases);
  const specification = admitArtifactFabricationSpecification(realized);
  assert.equal(specification.type, "ArtifactFabricationSpecification");
  const files = [
    { type: "TextFileMaterialization", version: 1, path: "src/identity.mjs", mode: 0o644,
      digest: digest(changedFiles ? "different fixture bytes" : realized.projections[0].configuration.sources[0].text) },
    { type: "TextFileMaterialization", version: 1, path: "test/identity-examples.test.mjs", mode: 0o644,
      digest: digest(realized.projections[0].configuration.tests[0].text) },
  ];
  const creation = {
    type: "JsnodeOperationPackageCreationReceipt", version: 1,
    packageName: "@red-cup-engineering/cell-receipt-fixture", packageVersion: "0.1.0",
    destination: "/controlled/cell-receipt-fixture", filesDigest: digest(JSON.stringify(files)), files,
    assays: [
      { type: "JsnodeOperationPackageAssay", version: 1, name: "syntax", status: "passed" },
      { type: "JsnodeOperationPackageAssay", version: 1, name: "tests", status: "passed", paths: ["test/identity-examples.test.mjs"] },
      { type: "JsnodeOperationPackageAssay", version: 1, name: "pack", status: "passed", filename: "fixture.tgz", digest: digest("fixture archive report") },
      { type: "JsnodeOperationPackageAssay", version: 1, name: "clean-installation", status: "passed", javascriptFiles: 1, reachableJavascriptFiles: 1 },
      { type: "JsnodeOperationPackageAssay", version: 1, name: "import-face", status: "passed", examples: 1 },
    ],
  };
  const evidence = { type: "ArtifactFabricationEvidence", locator: creation.destination, digest: receiptSemanticId(creation) };
  const realization = admitArtifactFabricationRealizationReceipt(specification, {
    type: "ArtifactFabricationRealizationReceiptCandidate", version: 1,
    artifactId: specification.artifact.id, specificationDigest: specification.specificationDigest,
    realizations: specification.projections.map(item => ({ type: "ArtifactFabricationRealizationEvidence", version: 1, projectionId: item.id, evidence })),
    acceptances: specification.acceptanceObligations.map(item => ({ type: "ArtifactFabricationRealizationEvidence", version: 1, acceptanceObligationId: item.id, evidence })),
  });
  assert.equal(realization.type, "ArtifactFabricationRealizationReceipt");
  const receipt = {
    type: "MarkdownJsnodeOperationPackageFabricationReceipt", version: 1,
    artifactSpecification: specification, specificationDigest: specification.specificationDigest,
    sourceDigest: specification.source.provenance.digest,
    jsnodeOperationPackageCreationReceipt: creation,
    jsnodeOperationPackageRegistryPublication: { type: "JsnodeOperationPackageRegistryPublicationSkipped", version: 1, reason: "controlled fixture" },
    artifactFabricationRealizationReceipt: realization,
    receiptPath: "/controlled/data/records/fabrication-receipt-records/2026-10-27-fixture-fabrication-receipt.json",
    fixtureNotice: { independentlyBuilt: false, unknownProjectionField: "retain this original source" },
    ...(derivationVersion === undefined ? {} : { derivation: { type: "JsnodeClosureDerivation", version: derivationVersion,
      workOrderSpecification: order, workOrderSpecificationDigest: order.specificationDigest,
      attempts: [{ phase: "clause-assays", outcome: "derived", cases }, { module: "src/identity.mjs", outcome: "pre-assayed", lot: { carrier: "controlled-report" } }],
      proofing: { independentlyReceived: false, scope: "controlled report only" } } }),
  };
  return admitMarkdownJsnodeOperationPackageFabricationReceipt(receipt);
}

const selected = (projection, predicate) => projection.cells.filter(at => at.predicate === predicate);

test("projects complete native source, requirements, candidate files and assay reports with exact witnesses", () => {
  const receipt = receiptFixture();
  const projection = projectFabricationReceiptCells({ receipt });
  assert.equal(projection.receiptId, semanticId(receipt));
  assert.equal(projection.source, null);
  assert.deepEqual(selected(projection, P.receipt)[0].object, receipt);
  assert.deepEqual(selected(projection, P.requirement).map(at => at.object), receipt.artifactSpecification.requirements);
  assert.deepEqual(selected(projection, P.materialization).map(at => at.object).sort((a,b) => a.path.localeCompare(b.path)), receipt.jsnodeOperationPackageCreationReceipt.files);
  assert.equal(selected(projection, P.assay).length, 5);
  const tests = selected(projection, P.assay).find(at => at.object.name === "tests");
  assert.deepEqual(tests.object.paths, ["test/identity-examples.test.mjs"]);
  assert.deepEqual(tests.for[0].pointers, ["/jsnodeOperationPackageCreationReceipt/assays/1"]);
  assert.equal(tests.for[0].receiptId, projection.receiptId);
  assert.equal(tests.for[0].candidateId, projection.candidateId);
  assert.equal(tests.for[0].receiptPath, receipt.receiptPath);
  assert.equal(tests.for[0].scope, "admitted-receipt-content");
  assert.equal(selected(projection, P.derivationAttempt).length, 2);
  for (const predicate of [P.independentlyReceived, P.customerAccepted, P.deployed]) {
    const [at] = selected(projection, predicate);
    assert.deepEqual(at.for, []);
    assert.deepEqual(at.against, []);
  }
});

test("JSON Schema shape and full original-source replay are distinct native admissions", () => {
  const receipt = receiptFixture();
  const request = { receipt, source: { locator: "file:/controlled/receipt.json", occurrence: "read-1" } };
  const projection = projectFabricationReceiptCells(request);
  const schema = schemaFromGraph({ root: fabricationReceiptCellProjectionSchema.$id,
    schemas: [{ id: fabricationReceiptCellProjectionSchema.$id, schema: fabricationReceiptCellProjectionSchema }, { id: cellSchema.$id, schema: cellSchema }] });
  const decoded = JSON.parse(JSON.stringify(projection));
  schema.assert(decoded);
  assert.deepEqual(admitFabricationReceiptCellProjection(decoded, request), projection);
  const forged = structuredClone(decoded);
  forged.cells.find(at => at.predicate === P.customerAccepted).for.push({ invented: "schema-valid testimony" });
  schema.assert(forged);
  assert.throws(() => admitFabricationReceiptCellProjection(forged, request), { code: "FABRICATION_CELL_BINDING_MISMATCH" });
  assert.throws(() => admitFabricationReceiptCellProjection(decoded, { ...request, source: { occurrence: "different" } }), { code: "FABRICATION_CELL_BINDING_MISMATCH" });
  assert.throws(() => admitFabricationReceiptCellProjection(decoded, { receipt: receiptFixture({ changedFiles: true }) }), { code: "FABRICATION_CELL_BINDING_MISMATCH" });
});

test("same report replay joins idempotently; actual supplied occurrences remain separate witnesses", () => {
  const receipt = receiptFixture();
  const first = projectFabricationReceiptCells({ receipt, source: { occurrence: "source-run-a" } });
  const second = projectFabricationReceiptCells({ receipt, source: { occurrence: "source-run-b" } });
  assert.equal(first.receiptId, second.receiptId);
  assert.equal(first.candidateId, second.candidateId);
  assert.deepEqual(cellSet([...first.cells, ...first.cells]), first.cells);
  const joined = cellSet([...first.cells, ...second.cells]);
  assert.equal(joined.find(at => at.predicate === P.assay).for.length, 2);
  const report = selected(first, P.assay)[0];
  const opposed = merge(report, cell(report.subject, report.predicate, report.object, { against: [{ source: "independent contradiction" }] }));
  assert.equal(opposed.for.length, 1);
  assert.equal(opposed.against.length, 1);
  assert.notEqual(presence(opposed), presence(report));
});

test("candidate identities distinguish changed files despite equal package name and version", () => {
  const before = projectFabricationReceiptCells({ receipt: receiptFixture() });
  const after = projectFabricationReceiptCells({ receipt: receiptFixture({ changedFiles: true }) });
  assert.notEqual(before.candidateId, after.candidateId);
  assert.notEqual(address(selected(before, P.assay)[0]), address(selected(after, P.assay)[0]));
});

test("source snapshots remain stable without freezing or aliasing caller-owned reports", () => {
  const receipt = structuredClone(receiptFixture());
  const source = { occurrence: "read-1" };
  const projection = projectFabricationReceiptCells({ receipt, source });
  assert.equal(Object.isFrozen(receipt), false);
  assert.equal(Object.isFrozen(receipt.artifactSpecification), false);
  receipt.fixtureNotice.unknownProjectionField = "caller changed its copy";
  source.occurrence = "read-2";
  assert.equal(selected(projection, P.receipt)[0].object.fixtureNotice.unknownProjectionField, "retain this original source");
  assert.equal(projection.source.occurrence, "read-1");
  assert.ok(Object.isFrozen(projection.cells));
  assert.ok(Object.isFrozen(selected(projection, P.receipt)[0].object));
});

test("public receipt request wrappers refuse getters before reading any source or ordinal", () => {
  const receipt = receiptFixture();
  for (const [operation, field] of [
    [projectFabricationReceiptCells, "receipt"],
    [projectFabricationReceiptCells, "source"],
    [foldFabricationReceiptIntoWorldRows, "t"],
  ]) {
    const request = { receipt, source: { occurrence: "literal-input" }, t: 0 };
    const value = request[field];
    let reads = 0;
    Object.defineProperty(request, field, { enumerable: true, get() { reads++; return value; } });
    let refusal;
    try { operation(request); } catch (error) { refusal = error; }
    assert.equal(reads, 0, `${field} getter must not execute during receiving`);
    assert.ok(refusal instanceof TypeError);
  }
});

test("ordinary EAVT row receiving refuses getters before selecting or reading a native Cell", () => {
  const projection = projectFabricationReceiptCells({ receipt: receiptFixture() });
  for (const field of ["a", "v", "e", "t"]) {
    const at = projection.cells[0];
    const row = { a: FABRICATION_CELL_ATTRIBUTE, e: address(at), v: at, t: 0 };
    const value = row[field];
    let reads = 0;
    Object.defineProperty(row, field, { enumerable: true, get() { reads++; return value; } });
    let refusal;
    try { readFabricationReceiptCellRows([row]); } catch (error) { refusal = error; }
    assert.equal(reads, 0, `${field} getter must not execute during receiving`);
    assert.ok(refusal instanceof TypeError);
  }
});

test("literal source locators and occurrence identifiers survive native Unicode normalization", () => {
  const receipt = receiptFixture();
  for (const field of ["locator", "occurrence"]) {
    const firstSource = { [field]: "source-\u00e9" };
    const secondSource = { [field]: "source-e\u0301" };
    assert.equal(firstSource[field].normalize("NFC"), secondSource[field].normalize("NFC"));
    const first = projectFabricationReceiptCells({ receipt, source: firstSource });
    const second = projectFabricationReceiptCells({ receipt, source: secondSource });
    assert.notEqual(semanticId(first), semanticId(second), `${field} is a literal supplied identifier`);
    assert.equal(selected(first, P.assay)[0].for[0].source[field], firstSource[field]);
    assert.throws(() => admitFabricationReceiptCellProjection(first, { receipt, source: secondSource }),
      { code: "FABRICATION_CELL_BINDING_MISMATCH" });
    const joined = cellSet([...first.cells, ...second.cells]);
    assert.equal(selected({ cells: joined }, P.assay)[0].for.length, 2);
  }
  const firstReceipt = structuredClone(receipt);
  const secondReceipt = structuredClone(receipt);
  firstReceipt.receiptPath = "/reports/\u00e9.json";
  secondReceipt.receiptPath = "/reports/e\u0301.json";
  const first = projectFabricationReceiptCells({ receipt: firstReceipt });
  const second = projectFabricationReceiptCells({ receipt: secondReceipt });
  assert.notEqual(semanticId(first), semanticId(second));
  assert.throws(() => admitFabricationReceiptCellProjection(first, { receipt: secondReceipt }),
    { code: "FABRICATION_CELL_BINDING_MISMATCH" });
});

test("historical and authored receipts keep their actual evidence strength and legacy fact ordering", () => {
  const authored = structuredClone(receiptFixture());
  delete authored.derivation;
  const historical = { ...authored, derivation: { type: "JsnodeClosureDerivation", version: 1,
    attempts: [], note: "no original source-free order was retained" } };
  for (const receipt of [authored, historical]) {
    const folded = foldFabricationReceiptIntoWorldRows({ receipt, t: 0 });
    assert.equal(folded.rows.some(row => row.a === "work-order-specification-digest"), false);
    assert.equal(selected(folded.cellProjection, P.workOrder).length, 0);
    assert.deepEqual(folded.rows.filter(row => row.a !== FABRICATION_CELL_ATTRIBUTE).map(row => row.a),
      ["constituted", "born-from-work-order", "source-digest", "specification-digest", "fabrication-trace", "files-digest", "has-quality", ...Array(5).fill("assay-passed")]);
  }
  const v2 = receiptFixture({ derivationVersion: 2 });
  assert.ok(foldFabricationReceiptIntoWorldRows({ receipt: v2, t: 0 }).rows.some(row =>
    row.a === "work-order-specification-digest" && row.v === v2.derivation.workOrderSpecificationDigest));
});

test("ordinary EAVT folding retains v3 order identity and the exact native Cell set", () => {
  const receipt = receiptFixture();
  const folded = foldFabricationReceiptIntoWorldRows({ receipt, t: 10 });
  assert.equal(folded.rows[0].a, "constituted");
  assert.equal(folded.rows[0].v.name, receipt.jsnodeOperationPackageCreationReceipt.packageName);
  assert.equal(folded.rows[0].t, 10);
  assert.ok(folded.rows.some(row => row.a === "assay-passed" && row.v === "syntax"));
  assert.ok(folded.rows.some(row => row.a === "work-order-specification-digest" && row.v === receipt.derivation.workOrderSpecificationDigest));
  assert.deepEqual(folded.rows.map(row => row.t), folded.rows.map((_, index) => 10 + index));
  const decoded = JSON.parse(JSON.stringify(folded.rows));
  const native = readFabricationReceiptCellRows(decoded);
  assert.deepEqual(native, folded.cellProjection.cells);
  const retainedReceipt = native.find(at => at.predicate === P.receipt).object;
  assert.deepEqual(retainedReceipt, receipt);
  assert.deepEqual(projectFabricationReceiptCells({ receipt: retainedReceipt }), folded.cellProjection);
  const malformed = structuredClone(decoded);
  malformed.find(row => row.a === FABRICATION_CELL_ATTRIBUTE).e = "forged-cell-address";
  assert.throws(() => readFabricationReceiptCellRows(malformed), { code: "FABRICATION_CELL_ROW_MISMATCH" });
});

test("partial or mixed receipts, undeclared presentations and overflowing ordinals refuse", () => {
  const receipt = receiptFixture();
  const mixed = structuredClone(receipt);
  mixed.jsnodeOperationPackageCreationReceipt = receiptFixture({ changedFiles: true }).jsnodeOperationPackageCreationReceipt;
  assert.throws(() => foldFabricationReceiptIntoWorldRows({ receipt: mixed, t: 0 }), { code: "CREATION_REALIZATION_BINDING_MISMATCH" });
  assert.throws(() => projectFabricationReceiptCells({ receipt: { type: receipt.type, version: 1 } }));
  for (const source of [{}, { occurrence: "" }, { locator: "x", authenticated: true }, [], "x"])
    assert.throws(() => projectFabricationReceiptCells({ receipt, source }), { code: "INVALID_FABRICATION_SOURCE_PRESENTATION" });
  for (const t of [NaN, Infinity])
    assert.throws(() => foldFabricationReceiptIntoWorldRows({ receipt, t }), TypeError);
  for (const t of [0.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => foldFabricationReceiptIntoWorldRows({ receipt, t }), { code: "INVALID_FABRICATION_TRACE_ORDINAL" });
  assert.throws(() => foldFabricationReceiptIntoWorldRows({ receipt, t: Number.MAX_SAFE_INTEGER }), { code: "FABRICATION_TRACE_ORDINAL_OVERFLOW" });
});

test("public receipt wire refuses native or lossy values before the first real EAVT append", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "fabrication-wire-refusal-"));
  try {
    const values = [1n, new Uint8Array([1, 2, 255]), new Uint8Array(), undefined,
      NaN, Infinity, -Infinity, -0, { nested: [-0] }, [undefined]];
    for (const [index, value] of values.entries()) {
      const receipt = structuredClone(receiptFixture());
      receipt.unknownWireField = value;
      assert.throws(() => projectFabricationReceiptCells({ receipt }),
        { code: "INVALID_FABRICATION_RECEIPT_WIRE" });
      const trace = path.join(root, `${index}.jsonl`);
      let appended = 0;
      assert.throws(() => {
        const folded = foldFabricationReceiptIntoWorldRows({ receipt, t: 0 });
        for (const row of folded.rows) {
          executeEavt({ operation: "append", path: trace, row });
          appended++;
        }
      }, { code: "INVALID_FABRICATION_RECEIPT_WIRE" });
      assert.equal(appended, 0);
      await assert.rejects(readFile(trace), { code: "ENOENT" });
    }
    assert.throws(() => foldFabricationReceiptIntoWorldRows({ receipt: receiptFixture(), t: -0 }),
      { code: "INVALID_FABRICATION_TRACE_ORDINAL" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("JSON wire extensions round-trip exactly and native-only received carriers refuse", async () => {
  const receipt = structuredClone(receiptFixture());
  receipt.unknownWireField = { values: [null, false, true, 0, 1.25, Number.MAX_VALUE, "e\u0301"],
    record: JSON.parse('{"__proto__":{"retained":true},"nested":[]}') };
  const folded = foldFabricationReceiptIntoWorldRows({ receipt, t: 0 });
  const root = await mkdtemp(path.join(tmpdir(), "fabrication-wire-receiving-"));
  try {
    const trace = path.join(root, "trace.jsonl");
    for (const row of folded.rows) executeEavt({ operation: "append", path: trace, row });
    const received = readFabricationReceiptCellRows(executeEavt({ operation: "read", path: trace }));
    assert.deepEqual(received, folded.cellProjection.cells);
    assert.deepEqual(received.find(at => at.predicate === P.receipt).object.unknownWireField, receipt.unknownWireField);
    const proposal = structuredClone(folded.cellProjection);
    proposal.version = 1n;
    assert.throws(() => admitFabricationReceiptCellProjection(proposal, { receipt }),
      { code: "FABRICATION_CELL_BINDING_MISMATCH" });
    const rows = structuredClone(folded.rows);
    const reported = rows.find(row => row.a === FABRICATION_CELL_ATTRIBUTE && row.v.for.length);
    reported.v.for[0].version = 1n;
    assert.throws(() => readFabricationReceiptCellRows(rows), { code: "FABRICATION_CELL_ROW_MISMATCH" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the existing receipt emitter persists and reads back the source Cells through real EAVT", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "fabrication-cell-receiving-"));
  try {
    const folder = path.join(root, "data", "records", "fabrication-receipt-records");
    await mkdir(folder, { recursive: true });
    const receiptPath = path.join(folder, "2026-10-27-fixture-fabrication-receipt.json");
    const receipt = receiptFixture();
    await writeFile(receiptPath, JSON.stringify(receipt) + "\n");
    const tracePath = path.join(root, "fabrication.jsonl");
    const summary = await emitFabricationReceiptsToEavt({ root, tracePath });
    assert.equal(summary.filesRead, 1);
    assert.deepEqual(summary.refusedReceipts, []);
    const rows = executeEavt({ operation: "read", path: tracePath });
    assert.equal(summary.rowsAppended, rows.length);
    assert.ok((await readFile(tracePath, "utf8")).includes(FABRICATION_CELL_ATTRIBUTE));
    const expected = projectFabricationReceiptCells({ receipt, source: { locator: receiptPath } });
    assert.deepEqual(readFabricationReceiptCellRows(rows), expected.cells);
    const retained = readFabricationReceiptCellRows(rows).find(at => at.predicate === P.receipt).object;
    assert.deepEqual(retained, receipt);
    assert.deepEqual(admitFabricationReceiptCellProjection(expected, { receipt: retained, source: { locator: receiptPath } }), expected);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
