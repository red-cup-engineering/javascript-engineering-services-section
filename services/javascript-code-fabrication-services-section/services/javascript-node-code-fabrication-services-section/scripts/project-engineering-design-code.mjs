/**
 * Project the original Specification owner's re-received LLD-to-Code readout
 * into executable, source-pinned Code adapters and independently authored tests.
 *
 * This is a candidate CODE PRODUCT. It performs no source writes or execution,
 * issues no Work/Proof/Sign authority, and cannot treat prose as an algorithm.
 * The original Design reader owns source-cut and HLD/LLD correspondence.
 * The original operating host owns isolated execution and final acceptance.
 */
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { renderJsonSchemaModule } from "./transform-json-schema-to-typescript.mjs";

const SHA = /^sha256:[a-f0-9]{64}$/u;
const OP_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u;
const EXPORT_NAME = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
const ALLOWED_ERRORS = new Set(["TypeError", "Error", "RangeError", "SyntaxError"]);
const reservedPath = "src/engineering-code-contracts.mjs";
const reservedTests = "test/engineering-code-contracts.test.mjs";
const object = x => x !== null && typeof x === "object" && !Array.isArray(x);
const fail = (code, message) => { const error = new TypeError(message); error.code = code; throw error; };
const sha = text => "sha256:" + createHash("sha256").update(text, "utf8").digest("hex");
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));
const plainJson = value => {
  let text;
  try { text = JSON.stringify(value); } catch { return false; }
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) return false;
  try { return JSON.stringify(JSON.parse(text)) === text; } catch { return false; }
};
const nodeSchema = value => value === true ? {} : value === false ? { not: {} } : value;
function targetPath(value) {
  return typeof value === "string" && value.startsWith("src/") && value.endsWith(".mjs") &&
    !value.includes("\\") && !value.includes("\0") && value.isWellFormed() &&
    value.normalize("NFC") === value && value.split("/").every(segment =>
      segment !== "" && segment !== "." && segment !== "..");
}
function importLocation(from, to) {
  const relative = posix.relative(posix.dirname(from), to);
  const path = relative.startsWith(".") ? relative : "./" + relative;
  return path.split("/").map(part => part === "." || part === ".." ?
    part : encodeURIComponent(part)).join("/");
}
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;

/**
 * @param {{codeWorkReadout: object, cases: object[]}} options A source reader's
 * exact original Code-work readout and *separately authored* behavioral cases.
 * Each case names an original requirement cell carried by its Code target.
 * @returns {object} Frozen candidate source/test files grouped by HLD owner.
 * @throws {TypeError} Before producing files on mismatched source, missing
 * normative coverage, unsupported carrier or fabricated Proof/Work standing.
 */
export function projectEngineeringDesignCode({ codeWorkReadout, cases } = {}) {
  const readout = codeWorkReadout;
  if (!object(readout) || readout.type !== "EngineeringDesignCodeWorkReadout" ||
      readout.version !== 1 || !SHA.test(readout.designCarrierSha256) ||
      readout.codeSnapshotScope !== "supplied-target-views-only" ||
      readout.status !== "source-present-unassayed" ||
      !Array.isArray(readout.discrepancies) || readout.discrepancies.length !== 0 ||
      readout.originalDesignAdmitted !== false || readout.independentProof !== "unreceived" ||
      readout.executableWork !== false || readout.codeApplied !== false ||
      readout.beneficiaryReceived !== false ||
      !Array.isArray(readout.sourceCut) || readout.sourceCut.length !== 4 ||
      readout.sourceCut.some(source => !object(source) || !SHA.test(source.digest))) {
    fail("CODE_SOURCE_NOT_RECEIVED", "a source-present original LLD Code readout is required, without fabricated Proof");
  }
  if (!Array.isArray(readout.targets) || readout.targets.length === 0 ||
      readout.targets.length > 64 || !plainJson(readout) ||
      !Array.isArray(cases) || cases.length === 0 || cases.length > 256 ||
      !plainJson(cases)) {
    fail("CODE_WORK_UNBOUNDED", "bounded source targets and independent JSON assay cases are required");
  }
  const byId = new Map(), owners = new Map();
  for (const target of readout.targets) {
    if (!object(target) || !OP_ID.test(target.operationId) ||
        !OP_ID.test(target.componentId) ||
        typeof target.originalComponentOwner !== "string" ||
        !target.originalComponentOwner.trim() || !targetPath(target.module) ||
        !EXPORT_NAME.test(target.exportName) ||
        target.sourceStatus !== "source-present-unassayed" ||
        !SHA.test(target.observedSha256) ||
        target.observedSha256 !== target.expectedSha256 ||
        !object(target.interface) ||
        ![true, false].includes(target.interface.inputSchema) && !object(target.interface.inputSchema) ||
        ![true, false].includes(target.interface.outputSchema) && !object(target.interface.outputSchema) ||
        !Array.isArray(target.originalTrace) || target.originalTrace.length === 0 ||
        !object(target.testObligations) || target.testObligations.status !== "unreceived" ||
        byId.has(target.operationId) || target.module === reservedPath) {
      fail("CODE_TARGET_UNQUALIFIED", "every Code operation requires an exact source-bound target and unreceived normative obligations");
    }
    const traced = new Set();
    for (const trace of target.originalTrace) {
      if (!object(trace) || typeof trace.requirementCellId !== "string" ||
          !trace.requirementCellId || traced.has(trace.requirementCellId) ||
          !Array.isArray(trace.specificationClauseIds) || trace.specificationClauseIds.length === 0 ||
          !Array.isArray(trace.architectureModelIds) || trace.architectureModelIds.length === 0) {
        fail("CODE_TRACE_UNQUALIFIED", "every Code target must retain distinct original Requirement/Specification/Architecture trace");
      }
      traced.add(trace.requirementCellId);
    }
    byId.set(target.operationId, target);
    const group = owners.get(target.originalComponentOwner) ?? [];
    group.push(target);
    owners.set(target.originalComponentOwner, group);
  }
  const names = new Set(), covered = new Map([...byId.keys()].map(id => [id, new Set()]));
  for (const item of cases) {
    if (!exact(item, ["operationId", "requirementCellId", "name", "input", "expectedOutput", "throws"]) ||
        !OP_ID.test(item.operationId) || !OP_ID.test(item.requirementCellId) ||
        typeof item.name !== "string" || !item.name.trim() ||
        item.name.length > 160 || /[\u0000-\u001f\u007f]/u.test(item.name) ||
        !byId.has(item.operationId) ||
        !byId.get(item.operationId).originalTrace.some(t => t.requirementCellId === item.requirementCellId) ||
        !(item.throws === null || ALLOWED_ERRORS.has(item.throws)) ||
        item.throws !== null && item.expectedOutput !== null) {
      fail("ASSAY_NOT_SOURCE_TRACED", "an assay must name an original Code operation, Requirement cell and exact output or error");
    }
    const key = JSON.stringify([item.operationId, item.name]);
    if (names.has(key)) fail("DUPLICATE_ASSAY", "independent Code assays must have distinct operation/name pairs");
    names.add(key); covered.get(item.operationId).add(item.requirementCellId);
  }
  for (const target of byId.values()) for (const trace of target.originalTrace) {
    if (!covered.get(target.operationId).has(trace.requirementCellId))
      fail("ASSAY_COVERAGE_INCOMPLETE", "Code must not manufacture acceptance for an unassayed original Requirement cell");
  }

  const projected = [];
  for (const [owner, group] of [...owners].sort(([a], [b]) => order(a, b))) {
    const targets = [...group].sort((a, b) => order(a.operationId, b.operationId));
    const entries = [], wrappers = [];
    const metadata = { kind: "engineering.code-source-contract-candidate.v1",
      originalComponentOwner: owner,
      designCarrierSha256: readout.designCarrierSha256,
      sourceCut: readout.sourceCut,
      semanticProof: "unreceived", originalWorkAuthority: "unreceived",
      independentCustomerAcceptance: "unreceived" };
    targets.forEach((target, index) => {
      for (const side of ["input", "output"]) {
        const schema = nodeSchema(target.interface[side + "Schema"]);
        const $id = "https://schemas.561.group/engineering/unadmitted/" +
          readout.designCarrierSha256.slice(7) + "/" +
          encodeURIComponent(target.operationId) + "/" + side;
        entries.push({ exportName: "__" + side + "Schema" + index,
          typeName: (side === "input" ? "Input" : "Output") + index,
          runtimeName: "__" + side + "Type" + index,
          schema: { $id, title: target.operationId + " " + side,
            description: "Source-observed LLD candidate; semantic Proof unreceived",
            ...schema } });
      }
      const location = importLocation(reservedPath, target.module);
      const label = target.operationId;
      const symbol = "checkedOperation" + index;
      wrappers.push([
        "export async function " + symbol + "(input) {",
        "  if (!admit(__inputType" + index + ", input).ok) throw new TypeError(" +
          JSON.stringify("Design input disagreement: " + label) + ");",
        "  const location = new URL(" + JSON.stringify(location) + ", import.meta.url);",
        "  const bytes = await readFile(location);",
        "  const actual = \"sha256:\" + createHash(\"sha256\").update(bytes).digest(\"hex\");",
        "  if (actual !== " + JSON.stringify(target.observedSha256) + ") throw new Error(" +
          JSON.stringify("Design source revision disagreement: " + label) + ");",
        "  const module = await import(location.href + \"?source=\" + actual.slice(7));",
        "  const implementation = module[" + JSON.stringify(target.exportName) + "];",
        "  if (typeof implementation !== \"function\") throw new TypeError(" +
          JSON.stringify("Design export disagreement: " + label) + ");",
        "  const output = await implementation(input);",
        "  if (!admit(__outputType" + index + ", output).ok) throw new TypeError(" +
          JSON.stringify("Design output disagreement: " + label) + ");",
        "  return output;",
        "}",
      ].join("\n"));
    });
    let runtime;
    try {
      runtime = [
        "import { admit } from \"@red-cup-engineering/signcell/type-system\";",
        "import { readFile } from \"node:fs/promises\";",
        "import { createHash } from \"node:crypto\";",
        renderJsonSchemaModule(entries, { format: "javascript",
          runtimeBinding: { name: "defineSchemaType",
            from: "@red-cup-engineering/signcell/type-system/schema-type" } }),
        "export const engineeringCodeSource = Object.freeze(" + JSON.stringify(metadata) + ");",
        ...wrappers,
        "",
      ].join("\n");
    } catch (error) {
      fail("SCHEMA_CODEGEN_REFUSED", "original runtime schema generator refused the LLD: " + error.message);
    }
    const tests = [
      "import test from \"node:test\";",
      "import assert from \"node:assert/strict\";",
      "import * as contracts from \"../" + reservedPath + "\";",
    ];
    const indexById = new Map(targets.map((t, i) => [t.operationId, i]));
    for (const c of [...cases].filter(c => indexById.has(c.operationId))
      .sort((a, b) => order(a.operationId + a.name, b.operationId + b.name))) {
      const fn = "contracts.checkedOperation" + indexById.get(c.operationId);
      const title = c.operationId + ": " + c.requirementCellId + ": " + c.name;
      tests.push("test(" + JSON.stringify(title) + ", async () => {");
      if (c.throws === null) {
        tests.push("  assert.deepStrictEqual(await " + fn + "(" + JSON.stringify(c.input) + "), " +
          JSON.stringify(c.expectedOutput) + ");");
      } else {
        tests.push("  await assert.rejects(() => " + fn + "(" + JSON.stringify(c.input) +
          "), { name: " + JSON.stringify(c.throws) + " });");
      }
      tests.push("});");
    }
    const files = [
      { path: reservedPath, text: runtime },
      { path: reservedTests, text: tests.join("\n") + "\n" },
    ].map(item => Object.freeze({ ...item, digest: sha(item.text) }));
    projected.push(Object.freeze({
      originalComponentOwner: owner,
      operations: Object.freeze(targets.map((t,i) => Object.freeze({
        operationId: t.operationId, module: t.module, exportName: t.exportName,
        checkedExport: "checkedOperation" + i, sourceSha256: t.observedSha256,
        originalTrace: t.originalTrace,
      }))),
      files: Object.freeze(files),
    }));
  }
  return Object.freeze({
    type: "EngineeringDesignCodeCandidate", version: 1,
    originalDesignSha256: readout.designCarrierSha256,
    status: "source-observed-code-projected", semanticProof: "unreceived",
    executableWork: false, codeApplied: false, beneficiaryReceived: false,
    independentAssayAuthority: "unverified-submitted-cases",
    packages: Object.freeze(projected),
  });
}
