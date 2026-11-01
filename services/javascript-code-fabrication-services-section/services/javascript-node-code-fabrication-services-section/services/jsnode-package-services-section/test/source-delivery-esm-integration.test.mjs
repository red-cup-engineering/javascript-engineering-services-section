import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import test from "node:test";
import {projectJsnodeExampleTests} from "../src/project-jsnode-example-tests.mjs";
import {projectJsnodeModules} from "../src/project-jsnode-modules.mjs";
import {moduleOfDelivery} from "../src/derive-jsnode-package-from-closure.mjs";

function runNode(args,cwd) {
  // Node's parent test worker sets NODE_TEST_CONTEXT=child-v8. If inherited
  // by a nested node --test runner, Node skips the entire nested suite and
  // exits 0: a dangerously false behavioral success. Remove only that
  // worker-local marker; preserve the caller's remaining native environment.
  const env={...process.env};
  delete env.NODE_TEST_CONTEXT;
  // Node 24 defaults to the human-readable spec reporter, while earlier
  // native runners default to TAP. Select TAP explicitly for machine-read
  // assertions about executed/failed cases, never infer a passing result
  // merely from a child's zero exit code.
  const nativeArgs=args.includes("--test") ? ["--test-reporter=tap",...args] : args;
  return spawnSync(process.execPath,nativeArgs,{cwd,encoding:"utf8",timeout:15000,env});
}

test("real source delivery, module projection, CLI and generated assays agree on legal exported names",async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),"jsnode-complete-esm-contract-"));
  try {
    await mkdir(path.join(directory,"src"));
    await mkdir(path.join(directory,"test"));
    await mkdir(path.join(directory,"apps"));
    await mkdir(path.join(directory,"data","records","schema"),{recursive:true});
    for (const exportName of ["ordinaryValue","class","default","await","revenue$","$"]) {
      const operation = {
        name:"source-contract",module:"src/operation.mjs",exportName,
        description:"Double an admitted integer",
        inputSchema:{type:"integer"},outputSchema:{type:"integer"},
      };
      const body = [
        "function implementation(value) { return value * 2; }",
        "export { implementation as " + JSON.stringify(exportName) + " };",
      ].join("\n");
      const delivery = moduleOfDelivery(JSON.stringify({source:body,question:null}),operation);
      assert.equal(delivery.source,body,
        "valid ESM export must survive source admission: "+exportName+" "+delivery.refused);

      const projected=projectJsnodeModules({
        sources:[{path:operation.module,text:body}],
        operations:[operation],
        cli:{path:"apps/catalog.mjs",name:"source-contract",description:"An executable operation catalog"},
      });
      const catalog=projected.find(file=>file.path==="apps/catalog.mjs");
      assert.ok(catalog,"the original package maker must emit the requested catalog");
      assert.match(catalog.text,/import \{ "[^"]+" as operation0 \} from "\.\.\/src\/operation\.mjs"/u);
      const assay=projectJsnodeExampleTests(operation,
        [{name:"double-two",operation:operation.name,input:2,output:4}]);
      for(const item of [...projected,assay])
        await writeFile(path.join(directory,item.path),item.text,"utf8");
      const syntax=runNode(["--check",path.join(directory,"apps/catalog.mjs")],directory);
      assert.equal(syntax.status,0,exportName+": "+syntax.stderr);
      const run=runNode(["--test",path.join(directory,assay.path)],directory);
      assert.equal(run.status,0,exportName+": "+run.stdout+"\n"+run.stderr);
      assert.match(run.stdout,/# pass 1\b/u);
      const actual=runNode(["--input-type=module","-e",
        'import {catalog} from "./apps/catalog.mjs"; if(await catalog.operations["source-contract"].operation(2)!==4) process.exit(11);'],directory);
      assert.equal(actual.status,0,exportName+": catalog import fails: "+actual.stderr);
    }
  } finally {await rm(directory,{recursive:true,force:true});}
});

test("original syntax reader refuses export-shaped comments, strings and malformed source",()=>{
  const operation={name:"quoted-value",module:"src/operation.mjs",exportName:"money$"};
  for(const content of [
    '// export function money$(value) { return value; }\nexport const other = 1;',
    'export const other = "export function money$(value) {}";',
    'export function money$(value) { return value + ; }',
  ]) {
    const seen=moduleOfDelivery(JSON.stringify({source:content,question:null}),operation);
    assert.equal(seen.source,undefined,"unreal export must not become Code source");
    assert.ok(seen.refused);
  }
  const tooLong="export function money$() {}" + " ".repeat(1024*1024);
  const bounded=moduleOfDelivery(JSON.stringify({source:tooLong,question:null}),operation);
  assert.match(bounded.refused,/bounded one-module source budget/u);
});
