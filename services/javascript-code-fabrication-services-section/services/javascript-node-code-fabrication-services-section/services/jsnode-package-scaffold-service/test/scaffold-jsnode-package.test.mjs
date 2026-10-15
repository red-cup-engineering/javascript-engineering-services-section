import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { symlinkSync, mkdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { scaffoldJsnodePackage } from "../src/scaffold-jsnode-package.mjs";

test("constructs a services-layer package.json field-by-field without writing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jsnode-scaffold-"));
  try {
    const result = await scaffoldJsnodePackage({
      name: "example-widget-service",
      owner: "red-cup-engineering",
      directory,
      layer: "services",
      description: "Does one thing. Use it for that thing.",
    });
    assert.equal(result.type, "JsnodePackageScaffoldConstruction");
    assert.equal(result.applied, false);
    assert.equal(result.packageDir, join(directory, "services", "example-widget-service"));
    assert.deepEqual(result.manifest, {
      name: "@red-cup-engineering/example-widget-service",
      version: "0.1.0",
      private: true,
      type: "module",
      description: "Does one thing. Use it for that thing.",
      exports: "./src/example-widget.mjs",
      scripts: {
        clean: "rm -rf .tmp",
        check: "node --check src/example-widget.mjs",
        build: "node --check src/example-widget.mjs",
        test: "node --test test/*.test.mjs",
        verify: "npm run check && npm test",
      },
      engines: { node: ">=22" },
    });
    assert.equal(result.files.length, 3);
    assert.deepEqual(result.files.map((file) => file.path), [
      "package.json",
      "src/example-widget.mjs",
      "test/example-widget.test.mjs",
    ]);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.manifest), true);
    assert.equal(existsSync(result.packageDir), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("adds a bin field and bin script check for the apps layer", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jsnode-scaffold-"));
  try {
    const result = await scaffoldJsnodePackage({
      name: "example-widget-app",
      owner: "red-cup-engineering",
      directory,
      layer: "apps",
      description: "Composes services. Use it to compose them.",
    });
    assert.equal(result.manifest.bin["example-widget-app"], "./bin/example-widget.mjs");
    assert.equal(result.manifest.scripts.check, "node --check src/example-widget.mjs && node --check bin/example-widget.mjs");
    assert.deepEqual(result.files.map((file) => file.path), [
      "package.json",
      "src/example-widget.mjs",
      "test/example-widget.test.mjs",
      "bin/example-widget.mjs",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("apply:true writes the package skeleton to disk", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jsnode-scaffold-"));
  try {
    const result = await scaffoldJsnodePackage({
      name: "example-widget-service",
      owner: "red-cup-engineering",
      directory,
      layer: "services",
      description: "Does one thing. Use it for that thing.",
      apply: true,
    });
    assert.equal(result.applied, true);
    const manifestText = await readFile(join(result.packageDir, "package.json"), "utf8");
    assert.deepEqual(JSON.parse(manifestText), result.manifest);
    const srcText = await readFile(join(result.packageDir, "src/example-widget.mjs"), "utf8");
    assert.match(srcText, /export function exampleWidget\(\)/u);
    const testText = await readFile(join(result.packageDir, "test/example-widget.test.mjs"), "utf8");
    assert.match(testText, /from "..\/src\/example-widget.mjs"/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses to overwrite an existing package directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jsnode-scaffold-"));
  try {
    const options = {
      name: "example-widget-service",
      owner: "red-cup-engineering",
      directory,
      layer: "services",
      description: "Does one thing. Use it for that thing.",
      apply: true,
    };
    await scaffoldJsnodePackage(options);
    await assert.rejects(() => scaffoldJsnodePackage(options), /already exists/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses absent or invalid scaffold material", async () => {
  await assert.rejects(() => scaffoldJsnodePackage(), /name/u);
  await assert.rejects(() => scaffoldJsnodePackage({ name: "Bad Name", owner: "x", directory: "/tmp", description: "d." }), /lower-kebab-case/u);
  await assert.rejects(() => scaffoldJsnodePackage({ name: "widget-service", owner: "Bad Owner", directory: "/tmp", description: "d." }), /owner/u);
  await assert.rejects(() => scaffoldJsnodePackage({ name: "widget-service", owner: "x", directory: "/tmp", layer: "nowhere", description: "d." }), /layer/u);
});

test("fabricated package executes its generated source and tests, for services and apps", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jsnode-scaffold-exec-"));
  try {
    for (const layer of ["services","apps"]) {
      const name = layer === "apps" ? "generated-example-app" : "generated-example-service";
      const artifact = await scaffoldJsnodePackage({
        name, owner:"red-cup-engineering", layer, directory,
        description:"Executable fabrication smoke test.", apply:true,
      });
      for (const file of artifact.files.filter(file => file.path.endsWith(".mjs"))) {
        const checked = spawnSync(process.execPath, ["--check",file.path],{
          cwd:artifact.packageDir,encoding:"utf8",
        });
        assert.equal(checked.status,0,checked.stderr);
      }
      const behavioral = spawnSync(process.execPath, ["--test",`test/${name.replace(/-(app|service)$/u,"")}.test.mjs`],{
        cwd:artifact.packageDir,encoding:"utf8",
      });
      assert.equal(behavioral.status,0,behavioral.stderr+"\n"+behavioral.stdout);
      if (layer === "apps") {
        const invoked = spawnSync(process.execPath,[`bin/${name.replace(/-app$/u,"")}.mjs`],{
          cwd:artifact.packageDir,encoding:"utf8",
        });
        assert.equal(invoked.status,0,invoked.stderr);
        assert.equal(JSON.parse(invoked.stdout).type,"GeneratedExample");
      }
    }
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
});

test("entryName cannot escape directories, generate invalid syntax or inject identifiers", async () => {
  const directory = await mkdtemp(join(tmpdir(),"jsnode-invalid-entry-"));
  const basis = {name:"widget-service",owner:"red-cup-engineering",
    description:"Generate a valid package.",directory,apply:true};
  try {
    for (const entryName of ["../outside","../../escape","name;process.exit(1)","bad--entry",
      "bad-","-bad","bad/name","bad.name","bad space","bad\\\\path"]) {
      await assert.rejects(()=>scaffoldJsnodePackage({...basis,entryName}),/entryName/);
    }
    for (const name of ["bad--package","trailing-","bad-1--name"]) {
      await assert.rejects(()=>scaffoldJsnodePackage({...basis,name}),/lower-kebab-case/);
    }
    assert.equal(existsSync(join(directory,"services","widget-service")),false);
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
});

test("apply does not follow dangling package paths or symlinked fabrication layers", async () => {
  const directory = await mkdtemp(join(tmpdir(),"jsnode-symlink-"));
  const outside = await mkdtemp(join(tmpdir(),"jsnode-external-"));
  const basis={name:"widget-service",owner:"red-cup-engineering",
    description:"Confined fixture.",directory,apply:true};
  try {
    mkdirSync(join(directory,"services"));
    symlinkSync(join(outside,"missing"),join(directory,"services","widget-service"));
    await assert.rejects(()=>scaffoldJsnodePackage(basis),/already exists/);
    await rm(join(directory,"services","widget-service"));
    await rm(join(directory,"services"),{recursive:true,force:true});
    symlinkSync(outside,join(directory,"services"));
    await assert.rejects(()=>scaffoldJsnodePackage(basis),/canonical directory/);
    assert.equal(existsSync(join(outside,"widget-service")),false);
  } finally {
    await rm(directory,{recursive:true,force:true});
    await rm(outside,{recursive:true,force:true});
  }
});

test("failed scaffolding creates no half-complete published package", async () => {
  const directory = await mkdtemp(join(tmpdir(),"jsnode-valid-scaffold-"));
  const basis={name:"valid-service",owner:"red-cup-engineering",directory,
    description:"First published version.",apply:true};
  try {
    const first = await scaffoldJsnodePackage(basis);
    await assert.rejects(()=>scaffoldJsnodePackage(basis),/already exists/);
    const retained=await readFile(join(first.packageDir,"package.json"),"utf8");
    assert.equal(JSON.parse(retained).description,"First published version.");
    assert.equal(existsSync(join(directory,"services","valid-service","src","valid.mjs")),true);
  } finally {
    await rm(directory,{recursive:true,force:true});
  }
});
