import test from "node:test";
import assert from "node:assert/strict";
import { decodePnpmLockfileImporters } from "../src/workspace/pnpm-lockfile.mjs";

const source = [
  "lockfileVersion: '9.0'","importers:","  .:","    dependencies:",
  "      'actual':","        specifier: 1.0.0","        version: 1.0.0",
  "  nested:","    devDependencies:",
  "      'actual':","        specifier: 2.0.0","        version: 2.0.0","",
].join("\n");

test("source-owned decoder preserves distinct importer addresses and exact resolved versions",()=>{
  const found=decodePnpmLockfileImporters(source);
  assert.equal(found.lockfileVersion,"9.0");
  assert.deepEqual(found.importers.map(item=>item.path),[".","nested"]);
  assert.deepEqual(found.importers.map(item=>item.dependencies[0].version),["1.0.0","2.0.0"]);
  assert.equal(found.importers[1].dependencies[0].field,"devDependencies");
});

test("duplicate importer declarations cannot overwrite one source with another",()=>{
  const bad=source.replace("  nested:", "  .:");
  assert.throws(()=>decodePnpmLockfileImporters(bad),/duplicate or unnamed importer/);
  assert.throws(()=>decodePnpmLockfileImporters(source+"importers:\n"),/duplicate importers root keys/);
});

test("duplicate, unnamed or incomplete dependency entries cannot claim a version",()=>{
  const repeated=source.replace("  nested:",[
    "      'actual':","        specifier: 1.0.0","        version: 2.0.0","  nested:",
  ].join("\n"));
  assert.throws(()=>decodePnpmLockfileImporters(repeated),/duplicated or unnamed dependency/);
  assert.throws(()=>decodePnpmLockfileImporters(
    source.replace("        version: 1.0.0", "        version:")),/lacks specifier or selected version/);
  assert.throws(()=>decodePnpmLockfileImporters(
    source.replace("        specifier: 1.0.0","        specifier:")),/lacks specifier or selected version/);
});
