import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {mkdtemp, readFile, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import test from "node:test";
import {semanticId} from "@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address";
import {tm} from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation";
import {jsonToTerm} from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/json-codec";
import {inferTy, isClosed} from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/typing";
import {identifyNormalizedSemanticContent} from "@red-cup-engineering/computer-code-engineering-services-section/semiotic-expression-notation/runtime";
import {EMPTY_WITNESS_ROOT} from "@red-cup-engineering/computer-content-address-engineering-services-section/semantic-content-identity";
import {
  CAPCELL_PROFILE, CAPCELL_PROFILE_V2, CapCellLineageReadError, CapCellSpecificationError,
  CapCellUnrealizedError, REQUIRED_PROVIDER_CAPABILITIES, fabricateLocalCapCell,
  fabricateVerifiedCapCell, assertCapCellComplete, writeLocalCapCellBundle,
  normalizeCapCellSpecification,
} from "../services/capcell-manifest-fabrication-service/src/fabricate-local-capcell.mjs";

const NI = "ni:///sha-256;" + "A".repeat(43);
const account = "eip155:5615610:0x0000000000000000000000000000000000000001";
const v1 = {
  profile: CAPCELL_PROFILE, identity: {actor: "urn:ame:lineage-fixture", account},
  capability: {operation: "assay-lineage", law: NI, kernel: "./kernel.mjs",
    inputSchema: "./input.json", outputSchema: "./output.json", refusalSchema: "./refusal.json"},
};
const kinds = ["sas", "hld", "lld"];
const contents = Object.fromEntries(kinds.map(kind => [kind, Buffer.from("This is " + kind + " revision 1.\n")]));
const v2 = {...v1, profile: CAPCELL_PROFILE_V2,
  lineage: Object.fromEntries(kinds.map(kind => [kind, {
    uri: "https://example.org/specifications/" + kind + ".md",
    revision: "0f6230e32c2ddc64a3829ce5bf87d38ad17112ec",
    sha256: createHash("sha256").update(contents[kind]).digest("hex"),
  }]))};
const readPinned = ({kind,uri,revision}) => {
  assert.equal(uri, v2.lineage[kind].uri);
  assert.equal(revision, v2.lineage[kind].revision);
  return contents[kind];
};
function evidence() {
  return {providers: Object.fromEntries(REQUIRED_PROVIDER_CAPABILITIES.map((name, n) => [name, {
    cell: "urn:ame:" + name, account: "eip155:5615610:0x" + (n+2).toString(16).padStart(40,"0"),
    operation: name, law: NI, offer: "https://market.example/" + name,
    agentCard: "https://agent.example/" + name, contract: NI,
  }]))};
}

test("the one owned JSON Schema distinguishes legacy v1 from required SAS/HLD/LLD v2", async () => {
  const schema = JSON.parse(await readFile(join(import.meta.dirname,
    "../content/schemas/capcell-spec.schema.json"), "utf8"));
  assert.deepEqual(schema.properties.profile.enum, [CAPCELL_PROFILE, CAPCELL_PROFILE_V2]);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["profile", "identity", "capability"]);
  assert.deepEqual(schema.properties.lineage.required, kinds);
  assert.equal(schema.properties.lineage.additionalProperties, false);
  assert.deepEqual(schema.allOf[0].if.properties.profile, {const: CAPCELL_PROFILE_V2});
  assert.deepEqual(schema.allOf[0].then.required, ["lineage"]);
  assert.deepEqual(schema.allOf[0].else.not.required, ["lineage"]);
  assert.deepEqual(schema.$defs.sourcePin.required, ["uri","revision","sha256"]);
  const allowedUrl = "https://example.org/@science/LS-SAS?reader=client@561.group";
  const userinfoUrl = "https://unauthorized@example.org/source.md";
  assert.match(allowedUrl,new RegExp(schema.$defs.sourcePin.properties.uri.pattern));
  assert.doesNotMatch(userinfoUrl,new RegExp(schema.$defs.sourcePin.properties.uri.pattern));
  assert.equal(normalizeCapCellSpecification({...v2,lineage:{
    ...v2.lineage,sas:{...v2.lineage.sas,uri:allowedUrl}
  }}).lineage.sas.uri,allowedUrl,
  "JSON Schema and actual canonical HTTPS normalization must agree on lawful @ path/query");
  assert.throws(()=>normalizeCapCellSpecification({...v2,lineage:{
    ...v2.lineage,sas:{...v2.lineage.sas,uri:userinfoUrl}
  }}),CapCellSpecificationError);
  assert.equal(schema.$defs.sourcePin.additionalProperties, false);
  for (const kind of kinds) {
    assert.equal(schema.properties.lineage.properties[kind].$ref, "#/$defs/sourcePin");
  }
  for (const candidate of [v1,v2]) {
    assert.equal(normalizeCapCellSpecification(candidate).profile,candidate.profile);
  }
  assert.throws(() => normalizeCapCellSpecification({...v1,lineage:v2.lineage}),
    CapCellSpecificationError);
  assert.throws(() => normalizeCapCellSpecification({...v2,lineage:undefined}),
    CapCellSpecificationError);
});

test("v1 unchanged: full provider evidence realizes without lineage", () => {
  const b = fabricateLocalCapCell(v1, evidence());
  assert.deepEqual(b.manifest.missing, []);
  assert.equal(b.manifest.lineage, undefined);
  assert.equal(assertCapCellComplete(b), b.manifest);
});

test("v2 missing/bad/duplicate source pins refuse before fabrication", () => {
  const invalid = [
    {...v2, lineage: {sas: v2.lineage.sas}},
    {...v2, lineage: {...v2.lineage, extra: {}}},
    {...v2, lineage: {...v2.lineage, lld: v2.lineage.sas}},
    {...v2, lineage: {...v2.lineage, sas: {...v2.lineage.sas, uri:"http://example.org/a"}}},
    {...v2, lineage: {...v2.lineage, sas: {...v2.lineage.sas, revision:"main"}}},
    {...v2, lineage: {...v2.lineage, sas: {...v2.lineage.sas, sha256:"F".repeat(64)}}},
    {...v1, lineage: v2.lineage},
  ];
  for (const candidate of invalid) {
    assert.throws(() => fabricateLocalCapCell(candidate), CapCellSpecificationError);
  }
});

test("v2 cannot be complete on assertion-only evidence; verified bytes change manifest not source identity", async () => {
  const before = fabricateLocalCapCell(v2, evidence());
  assert.equal(before.manifest.state, "unrealized");
  assert.deepEqual(before.manifest.missing, kinds.map(kind => "lineage:" + kind + ":unverified"));
  assert.throws(() => assertCapCellComplete(before), CapCellUnrealizedError);
  const after = await fabricateVerifiedCapCell(v2, evidence(), readPinned);
  assert.equal(after.manifest.lineageIntegrity, "digest-verified");
  assert.deepEqual(after.manifest.missing, []);
  assert.equal(assertCapCellComplete(after), after.manifest);
  assert.equal(after.specificationIdentity.id, before.specificationIdentity.id);
  assert.notEqual(after.manifestIdentity.id, before.manifestIdentity.id);
  assert.equal(after.manifest.deployed, undefined);
  const modified = {...v2, lineage:{...v2.lineage,sas:{...v2.lineage.sas,sha256:"0".repeat(64)}}};
  assert.notEqual(fabricateLocalCapCell(modified).specificationIdentity.id,before.specificationIdentity.id);
});

test("v2 source tamper, unavailable provider, missing source bytes and market binding refuse", async () => {
  await assert.rejects(
    () => fabricateVerifiedCapCell(v2,evidence(),({kind})=>kind==="hld"?Buffer.from("tampered"):contents[kind]),
    e=>e instanceof CapCellLineageReadError && e.reason==="sha256-mismatch" && e.kind==="hld");
  await assert.rejects(
    () => fabricateVerifiedCapCell(v2,evidence(),()=>{throw Error("offline");}),
    e=>e instanceof CapCellLineageReadError && e.reason==="source-provider-unavailable");
  await assert.rejects(
    () => fabricateVerifiedCapCell(v2,evidence(),()=> "not bytes"),
    e=>e instanceof CapCellLineageReadError && e.reason==="source-bytes-unavailable");
  const missingProvider=evidence();delete missingProvider.providers.deployment;
  const cell=await fabricateVerifiedCapCell(v2,missingProvider,readPinned);
  assert(cell.manifest.missing.includes("provider:deployment"));
  assert.throws(()=>assertCapCellComplete(cell), CapCellUnrealizedError);
});

test("completion re-derives actual SEN identities and refuses mismatched, independently valid bodies", () => {
  const first = fabricateLocalCapCell(v1, evidence());
  const second = fabricateLocalCapCell({
    ...v1, capability: {...v1.capability, operation: "changed-operation"},
  }, evidence());
  assert.equal(assertCapCellComplete(first),first.manifest);
  assert.equal(assertCapCellComplete(second),second.manifest);

  for (const altered of [
    {...first, specification: second.specification},
    {...first, specificationIdentity: second.specificationIdentity},
    {...first, manifest: second.manifest, manifestIdentity: second.manifestIdentity},
    {...first, manifest: {...first.manifest, actor:"urn:ame:forged"}},
    {...first, manifest: {...first.manifest, missing:["invented"]}},
  ]) {
    assert.throws(()=>assertCapCellComplete(altered), CapCellSpecificationError,
      "addressed carriers do not authorize cross-wiring different semantic contents");
  }
});

test("source-qualified v2 completion cannot be forged or replayed as self-attested JSON", async () => {
  const qualified=await fabricateVerifiedCapCell(v2,evidence(),readPinned);
  assert.equal(assertCapCellComplete(qualified),qualified.manifest);
  // The same addressed content is not an authorization to invent a source
  // read receipt. This boundary is only qualified in the verified-read process.
  for(const altered of [
    {...qualified},
    {...qualified,manifest:{...qualified.manifest}},
    {...qualified,specification:{...qualified.specification}},
  ]) {
    assert.throws(()=>assertCapCellComplete(altered), CapCellSpecificationError);
  }
  const asserted=fabricateLocalCapCell(v2,evidence());
  assert.throws(()=>assertCapCellComplete(asserted),CapCellSpecificationError,
    "an unread source cannot satisfy a completion claim");
});

test("v2 writer persists only an integrity-qualified candidate; CLI refuses unread source", async () => {
  const dir=await mkdtemp(join(tmpdir(),"capcell-lineage-"));
  const verified=await writeLocalCapCellBundle(v2,join(dir,"checked"),evidence(),{readLineage:readPinned});
  const stored=JSON.parse(await readFile(join(dir,"checked","capcell.manifest.json"),"utf8"));
  assert.equal(stored.id,verified.manifest.id);
  assert.equal(stored.lineageIntegrity,"digest-verified");
  assert.equal(stored.received,undefined);
  const specPath=join(dir,"spec.json"),evidencePath=join(dir,"evidence.json");
  await writeFile(specPath,JSON.stringify(v2),"utf8");
  await writeFile(evidencePath,JSON.stringify(evidence()),"utf8");
  await assert.rejects(
    ()=>promisify(execFile)(process.execPath,[
      join(import.meta.dirname,"../scripts/capcell.mjs"),
      "fabricate",specPath,"--evidence",evidencePath,"--output",join(dir,"unverified")
    ]),
    e=>e.code===2 && kinds.every(kind=>JSON.parse(e.stdout).missing.includes("lineage:"+kind+":unverified")));
});

test("L-Space 1D SCA to 3D SEN reading reuses admitted content and typed term providers", () => {
  // 1D is an opaque address reading, not an independently invented index dimension.
  const encodedSubject = semanticId({word: "\u00e9lan"});
  const equivalent = semanticId({word: "e\u0301lan"});
  assert.equal(encodedSubject, equivalent, "NFC-equivalent carriers share the canonical SCA");
  assert.match(encodedSubject, /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u);

  // SEN accepts the address as an opaque mark; the three positions are typed
  // subject/predicate/object, not three fabricated physical axes.
  const subject = tm.mark(encodedSubject);
  const predicate = jsonToTerm("has-reading");
  const object = jsonToTerm("evidence-bearing-token");
  const spoken = tm.pair(subject, tm.pair(predicate, object));
  for (const term of [subject, predicate, object, spoken]) {
    assert.equal(isClosed(term), true);
    assert.notEqual(inferTy([], term), null);
  }
  const identified = identifyNormalizedSemanticContent({
    objectKind: "l-space.predication",
    semanticType: inferTy([], spoken),
    term: spoken,
    witnessRoot: EMPTY_WITNESS_ROOT,
  });
  assert.match(identified.id, /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(identified.id, encodedSubject, "the triple is not any component's SCA");
});

test("L-Space temporal coordinate cannot be confused with source triple identity", () => {
  const subject = jsonToTerm("subject");
  const relation = jsonToTerm("reports");
  const object = jsonToTerm("finding");
  const triple = tm.pair(subject, tm.pair(relation, object));
  const withTime1 = tm.pair(triple, jsonToTerm("2026-10-13T01:00:00Z"));
  const withTime2 = tm.pair(triple, jsonToTerm("2026-10-13T02:00:00Z"));
  const addr = (term) => identifyNormalizedSemanticContent({
    objectKind: "l-space.projection-fixture",
    semanticType: inferTy([], term),
    term,
    witnessRoot: EMPTY_WITNESS_ROOT,
  }).id;
  assert.equal(isClosed(triple), true);
  assert.equal(isClosed(withTime1), true);
  assert.equal(isClosed(withTime2), true);
  assert.deepEqual(withTime1[1], triple); // The source expression is preserved structurally.
  assert.notEqual(addr(withTime1), addr(withTime2));
  assert.notEqual(addr(withTime1), addr(triple));
  // A typed fourth term is NOT SEAVT journal admission: an authorized time
  // witness and actual SEAVT provider must still independently receive it.
});
