import assert from "node:assert/strict";
import test from "node:test";
import { fabricatePackageBackedCapCell } from "../services/package-backed-capcell-fabrication-service/src/fabricate-package-backed-capcell.mjs";

// No workspace dependencies, credentials, network or second settlement engine.
// These are the actual package-composition trust-boundary regressions, not
// substitutes for the private workspace's SEN/NI source-integrity test suite.
const NI = "ni:///sha-256;" + "A".repeat(43);
const V2 = "org.red-cup-engineering.capcell.v2";
const V1 = "org.red-cup-engineering.capcell.v1";
const kinds = ["sas","hld","lld"];
const pins = Object.fromEntries(kinds.map(kind => [kind,{
  uri: "https://research.example/specifications/" + kind + ".md",
  revision: "0123456789abcdef0123456789abcdef01234567",
  sha256: "a".repeat(64),
}]));
const pkg = {name:"@red-cup-engineering/test-cell",version:"1.0.0"};
const spec = {profile:V2,package:pkg,materials:[],lineage:pins};
const packageManifest = {...pkg,dependencies:{}};
const manifest = {state:"realized",profile:V2,lineage:pins,
  lineageIntegrity:"digest-verified",specification:NI,missing:[]};
const assay = {type:"PackageBackedSettlementAssayReceipt",settled:true,defects:[]};
const authenticated = {
  verifyFabricationReceipt:({specification,manifest:read}) =>
    specification===spec && read.specification===NI &&
    read.lineageIntegrity==="digest-verified",
  verifyPackageSettlementReceipt:({packageManifest:observed,packageSettlement:read}) =>
    observed.name===pkg.name && observed.version===pkg.version &&
    read.type===assay.type && read.settled===true,
};
const run = async ({m=manifest,a=assay,agreement=packageManifest,source=spec,bindings={}}={}) =>
  fabricatePackageBackedCapCell({specification:source,packageManifest:agreement},
    {fabricateAction:"https://provider.example/fabricate",
     assayAction:"https://provider.example/assay",...bindings},
    async (url,request) => {
      assert.equal(request.method,"POST");
      assert.equal(request.headers["content-type"],"application/json");
      return Response.json(url.endsWith("/fabricate")
        ? {type:"CapCellManifestFabricationReceipt",manifest:m} : a);
    });

test("provider strings do not independently verify a v2 source or package",async()=>{
 const r=await run();
 assert.equal(r.settled,false);
 assert(r.lineageDefects.includes("lineage:fabrication-provider-unverified"));
 assert(r.lineageDefects.includes("lineage:settlement-provider-unverified"));
 assert.equal(r.fabrication.manifest.lineageIntegrity,"digest-verified");
 assert.equal(r.packageSettlement.settled,true);
});

test("two independently authorized receipt verifiers can qualify a closed exact v2 package",async()=>{
 const r=await run({bindings:authenticated});
 assert.equal(r.settled,true);
 assert.deepEqual(r.lineageDefects,[]);
 assert.equal(r.fabrication.manifest.specification,NI);
});

test("v2 refuses unread sources, changed SAS/HLD/LLD, missing evidence and wrong package identity",async()=>{
 const inputs=[
  {m:{...manifest,lineageIntegrity:"unverified"},code:"lineage:source-digests-unverified"},
  {m:{...manifest,lineage:{...pins,hld:{...pins.hld,sha256:"0".repeat(64)}}},code:"lineage:hld:source-pin-mismatch"},
  {m:{...manifest,missing:["provider:deployment"]},code:"lineage:fabrication-closure-unverified"},
  {m:{...manifest,specification:"untyped"},code:"lineage:fabrication-closure-unverified"},
  {agreement:{...packageManifest,version:"2.0.0"},code:"lineage:package-identity-unverified"},
  {a:{...assay,defects:["dependency:foreign"]},code:"lineage:package-assay-unverified"},
 ];
 for(const entry of inputs){
   const r=await run({...entry,bindings:authenticated});
   assert.equal(r.settled,false,entry.code);
   assert(r.lineageDefects.includes(entry.code),entry.code);
 }
});

test("a missing, throwing or nonliteral verifier cannot authorize v2",async()=>{
 for(const bindings of [
  {verifyFabricationReceipt:()=>true},
  {verifyPackageSettlementReceipt:()=>true},
  {...authenticated,verifyFabricationReceipt:()=>({ok:true})},
  {...authenticated,verifyPackageSettlementReceipt:()=>{throw Error("offline")}},
  {...authenticated,verifyPackageSettlementReceipt:async()=>false},
 ]){
   const r=await run({bindings});
   assert.equal(r.settled,false);
   assert(r.lineageDefects.some(x=>x.endsWith("-provider-unverified")));
 }
});

test("a server error at a provider boundary is not a completed fabrication",async()=>{
 await assert.rejects(
   fabricatePackageBackedCapCell({specification:spec,packageManifest},
     {fabricateAction:"https://provider.example/fabricate",
       assayAction:"https://provider.example/assay",...authenticated},
     async url=>new Response(JSON.stringify({reason:"provider-down"}),
       {status:url.endsWith("/fabricate")?503:200,
        headers:{"content-type":"application/json"}})),
   /refused: provider-down/u);
});

test("legacy v1 package composition retains its prior behavior",async()=>{
 const r=await run({
   source:{...spec,profile:V1,lineage:undefined},
   m:{state:"realized",profile:V1},
 });
 assert.equal(r.settled,true);
 assert.equal(r.lineageDefects,undefined);
});
