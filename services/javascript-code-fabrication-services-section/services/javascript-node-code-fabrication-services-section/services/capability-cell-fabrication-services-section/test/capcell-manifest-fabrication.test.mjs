import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  assertCapCellComplete,
  CAPCELL_PROFILE,
  CapCellSpecificationError,
  CapCellUnrealizedError,
  fabricateLocalCapCell,
  REQUIRED_BODY_FACETS,
  REQUIRED_PROVIDER_CAPABILITIES,
  writeLocalCapCellBundle,
} from "../services/capcell-manifest-fabrication-service/src/fabricate-local-capcell.mjs";
import { assayPackageBackedSettlement } from "../services/package-backed-settlement-assay-service/src/assay-package-backed-settlement.mjs";
import { fabricatePackageBackedCapCell } from "../services/package-backed-capcell-fabrication-service/src/fabricate-package-backed-capcell.mjs";

const NI = `ni:///sha-256;${"A".repeat(43)}`;
const ACCOUNT = "eip155:5615610:0x0000000000000000000000000000000000000001";
const SPECIFICATION = Object.freeze({
  profile: CAPCELL_PROFILE,
  identity: {actor: "urn:ame:example-capability-cell", account: ACCOUNT},
  package: {name: "@red-cup-engineering/example-capability-cell", version: "1.0.0"},
  capability: {
    operation: "perform-example",
    law: NI,
    kernel: "./lib/perform-example.mjs",
    inputSchema: "./content/schemas/input.json",
    outputSchema: "./content/schemas/output.json",
    refusalSchema: "./content/schemas/refusal.json",
  },
  materials: [{package: "@inert/example", semanticId: NI, authority: "none"}],
});
const PACKAGE_MANIFEST = Object.freeze({
  name: "@red-cup-engineering/example-capability-cell",
  version: "1.0.0",
  dependencies: {"@inert/example": "1.0.0"},
});

const executeFile = promisify(execFile);

function fullEvidence() {
  return {
    body: Object.fromEntries(REQUIRED_BODY_FACETS.map((name) => [name, {evidence: `test:${name}`} ])),
    providers: Object.fromEntries(REQUIRED_PROVIDER_CAPABILITIES.map((name, index) => [name, {
      cell: `urn:ame:${name}-cell`,
      account: `eip155:5615610:0x${(index + 2).toString(16).padStart(40, "0")}`,
      operation: name,
      law: NI,
      offer: `https://market.example/offers/${name}`,
      agentCard: `https://market.example/a2a/${name}/.well-known/agent-card.json`,
      contract: NI,
    }])),
  };
}

test("fabricates one deterministic candidate for exactly one capability", async () => {
  const first = fabricateLocalCapCell(SPECIFICATION, {}, {packageManifest: PACKAGE_MANIFEST});
  const second = fabricateLocalCapCell(structuredClone(SPECIFICATION), {}, {packageManifest: PACKAGE_MANIFEST});
  assert.equal(first.specificationIdentity.id, second.specificationIdentity.id);
  assert.equal(first.manifest.id, second.manifest.id);
  assert.equal(first.manifest.capability.operation, "perform-example");
  assert(first.manifest.missing.includes("provider:a2a-task-transport"));
  assert(!first.manifest.missing.some((missing) => missing.startsWith("body:")));

  const output = await mkdtemp(join(tmpdir(), "capcell-"));
  const written = await writeLocalCapCellBundle(SPECIFICATION, output, {}, {packageManifest: PACKAGE_MANIFEST});
  assert.deepEqual(JSON.parse(await readFile(join(output, "capcell.manifest.json"), "utf8")), written.manifest);
});

test("default fabrication admits a carrier with no package system", () => {
  const {package: ignoredPackage, materials: ignoredMaterials, ...packageNeutral} = SPECIFICATION;
  const bundle = fabricateLocalCapCell(packageNeutral, fullEvidence());
  assert.equal(bundle.specification.package, undefined);
  assert.equal(bundle.manifest.package, undefined);
  assert.deepEqual(bundle.specification.materials, []);
  assert.equal(assertCapCellComplete(bundle), bundle.manifest);
});

test("rejects a second owned operation instead of calling a composite a cell", () => {
  assert.throws(
    () => fabricateLocalCapCell({...SPECIFICATION, operations: ["perform-example", "publish-example"]}, {}, {packageManifest: PACKAGE_MANIFEST}),
    (error) => error instanceof CapCellSpecificationError && /unexpected fields/u.test(error.message),
  );
});

test("rejects effectful imported material", () => {
  assert.throws(
    () => fabricateLocalCapCell({...SPECIFICATION, materials: [{package: "@embedded/activitypub", semanticId: NI, authority: "network"}]}, {}, {packageManifest: PACKAGE_MANIFEST}),
    (error) => error instanceof CapCellSpecificationError && /provider CapCells/u.test(error.message),
  );
});

test("requires every infrastructure capability as a market-addressed provider cell", () => {
  const evidence = fullEvidence();
  delete evidence.providers["ocapn-admission"];
  const bundle = fabricateLocalCapCell(SPECIFICATION, evidence, {packageManifest: PACKAGE_MANIFEST});
  assert.throws(
    () => assertCapCellComplete(bundle),
    (error) => error instanceof CapCellUnrealizedError
      && error.missing.includes("provider:ocapn-admission"),
  );
});

test("rejects one provider cell masquerading as multiple capability cells", () => {
  const evidence = fullEvidence();
  evidence.providers["captp-session"] = {
    ...evidence.providers["captp-session"],
    cell: evidence.providers["a2a-task-transport"].cell,
  };
  const bundle = fabricateLocalCapCell(SPECIFICATION, evidence, {packageManifest: PACKAGE_MANIFEST});
  assert(bundle.manifest.missing.includes("provider:captp-session:shared-cell"));
});

test("accepts recursively closed cells on bound behavioral evidence", () => {
  const bundle = fabricateLocalCapCell(SPECIFICATION, fullEvidence(), {packageManifest: PACKAGE_MANIFEST});
  assert.deepEqual(bundle.manifest.missing, []);
  assert.equal(assertCapCellComplete(bundle), bundle.manifest);
});

test("admits evolving body facets without a fixed voxel-face checklist", () => {
  const evidence = fullEvidence();
  evidence.body["webtransport-v2"] = { endpoint: "https://cell.example/wt" };
  const bundle = fabricateLocalCapCell(SPECIFICATION, evidence, {packageManifest: PACKAGE_MANIFEST});
  assert.deepEqual(bundle.manifest.missing, []);
  assert.deepEqual(bundle.manifest.body["webtransport-v2"], evidence.body["webtransport-v2"]);
});

test("the CLI accepts evidence and emits typed recursive closure defects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "capcell-cli-"));
  const specificationPath = join(directory, "specification.json");
  const evidencePath = join(directory, "evidence.json");
  const packageManifestPath = join(directory, "package.json");
  const output = join(directory, "output");
  const evidence = fullEvidence();
  delete evidence.providers["market-offer-discovery"];
  await writeFile(specificationPath, `${JSON.stringify(SPECIFICATION)}\n`, "utf8");
  await writeFile(evidencePath, `${JSON.stringify(evidence)}\n`, "utf8");
  await writeFile(packageManifestPath, `${JSON.stringify(PACKAGE_MANIFEST)}\n`, "utf8");

  await assert.rejects(
    () => executeFile(process.execPath, [
      join(import.meta.dirname, "../scripts/capcell.mjs"),
      "fabricate",
      specificationPath,
      "--package-manifest",
      packageManifestPath,
      "--evidence",
      evidencePath,
      "--output",
      output,
    ]),
    (error) => {
      assert.equal(error.code, 2);
      const response = JSON.parse(error.stdout);
      assert(response.missing.includes("provider:market-offer-discovery"));
      return true;
    },
  );
});

test("package-backed settlement remains an independently purchasable assay", () => {
  const packageManifest = {
    ...PACKAGE_MANIFEST,
    dependencies: {
      ...PACKAGE_MANIFEST.dependencies,
      "@embedded/activitypub-provider": "1.0.0",
    },
  };
  const receipt = assayPackageBackedSettlement({specification: SPECIFICATION, packageManifest});
  assert.equal(receipt.settled, false);
  assert(receipt.defects.includes("dependency:@embedded/activitypub-provider:unbound-effect"));
  const base = fabricateLocalCapCell(SPECIFICATION, fullEvidence());
  assert.deepEqual(base.manifest.missing, []);
  assert.deepEqual(
    assayPackageBackedSettlement({specification: SPECIFICATION}).defects,
    ["package-manifest:unobserved"],
  );
});

test("package-backed fabrication composes two provider nodes without owning either transform", async () => {
  const calls = [];
  const fetchImpl = async (action, init) => {
    calls.push(action);
    const input = JSON.parse(init.body);
    if (action === "https://fabricator.example/invoke") {
      return Response.json({type: "CapCellManifestFabricationReceipt", specification: input.specification, manifest: {state: "realized"}});
    }
    return Response.json(assayPackageBackedSettlement(input));
  };
  const receipt = await fabricatePackageBackedCapCell(
    {specification: SPECIFICATION, evidence: fullEvidence(), packageManifest: PACKAGE_MANIFEST},
    {fabricateAction: "https://fabricator.example/invoke", assayAction: "https://assay.example/invoke"},
    fetchImpl,
  );
  assert.deepEqual(calls.sort(), ["https://assay.example/invoke", "https://fabricator.example/invoke"]);
  assert.equal(receipt.settled, true);
  assert.equal(receipt.packageSettlement.operation, "assay-package-backed-settlement");
});
