import { lstatSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// Ported from the legacy organizing-with-jsnode conformance/{scaffold,layer}.mts
// pair. The legacy scaffold assumed a TypeScript build (tsc, dist/, a shared
// tsconfig.base.json) that does not exist in this tree; this port produces the
// dependency-free plain-ESM shape used across javascript-services-section/services
// instead (see jsnode-package-identity-normalization-service and
// jsnode-package-owner-projection-service for the exemplars). The four-layer
// table (lib/apps/services/sites) is carried over faithfully.

const LAYERS = Object.freeze(["lib", "apps", "services", "sites"]);
// Hyphens are separators, never dangling or consecutive: camel() must
// always yield a JavaScript identifier and paths must be confined.
const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const OWNER = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

function oneLine(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\n") || value.includes("\r")) {
    throw new TypeError(`${label} must be one non-empty line`);
  }
  return value;
}

function camel(name) {
  return name.replace(/-([a-z0-9])/gu, (_, c) => c.toUpperCase());
}

function pascal(name) {
  const c = camel(name);
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function defaultEntryName(name) {
  return name.replace(/-(service|app)$/u, "");
}

function scriptsFor(layer, entryName) {
  const checkTargets = [`src/${entryName}.mjs`];
  if (layer === "apps") checkTargets.push(`bin/${entryName}.mjs`);
  const check = checkTargets.map((target) => `node --check ${target}`).join(" && ");
  // No compiled artifact exists in this family, so "build" is a syntax-check
  // alias and "clean" only clears transient test output - both are kept as
  // named scripts because the standard script surface (clean/check/build/
  // test/verify) is part of the house contract even when a step is a no-op.
  return {
    clean: "rm -rf .tmp",
    check,
    build: check,
    test: "node --test test/*.test.mjs",
    verify: "npm run check && npm test",
  };
}

function manifestFor({ layer, name, owner, entryName, description }) {
  const manifest = {
    name: `@${owner}/${name}`,
    version: "0.1.0",
    private: true,
    type: "module",
    description,
    exports: `./src/${entryName}.mjs`,
    scripts: scriptsFor(layer, entryName),
    engines: { node: ">=22" },
  };
  if (layer === "apps") manifest.bin = { [name]: `./bin/${entryName}.mjs` };
  return manifest;
}

function srcFor(entryName) {
  const fn = camel(entryName);
  const typeName = pascal(entryName);
  return `export function ${fn}() {
  return Object.freeze({ type: "${typeName}" });
}
`;
}

function testFor(entryName) {
  const fn = camel(entryName);
  return `import assert from "node:assert/strict";
import test from "node:test";

import { ${fn} } from "../src/${entryName}.mjs";

test("${entryName} returns a frozen typed record", () => {
  const record = ${fn}();
  assert.equal(Object.isFrozen(record), true);
  assert.match(record.type, /^[A-Z][A-Za-z0-9]*$/u);
});
`;
}

function binFor(entryName) {
  const fn = camel(entryName);
  return `#!/usr/bin/env node
import { ${fn} } from "../src/${entryName}.mjs";

console.log(JSON.stringify(${fn}()));
`;
}

/**
 * Construct a compliant package.json and standard scripts for a new JSNode
 * package from its name and layer, and return the constructed files without
 * touching the filesystem. Pass apply:true to also write the package skeleton
 * to disk (append-only: refuses to write over an existing package directory).
 */
export async function scaffoldJsnodePackage({
  name,
  owner,
  directory,
  layer = "services",
  entryName,
  description,
  apply = false,
} = {}) {
  oneLine(name, "name");
  if (!NAME.test(name)) throw new TypeError("name must be lower-kebab-case");
  const normalizedOwner = oneLine(owner, "owner").replace(/^@/u, "");
  if (!OWNER.test(normalizedOwner)) throw new TypeError("owner must be a valid unscoped npm owner");
  if (typeof directory !== "string" || !directory) throw new TypeError("directory is required");
  if (!LAYERS.includes(layer)) throw new TypeError(`layer must be one of ${LAYERS.join(", ")}`);
  const resolvedEntryName = entryName === undefined ? defaultEntryName(name) : oneLine(entryName, "entryName");
  if (!NAME.test(resolvedEntryName))
    throw new TypeError("entryName must be lower-kebab-case without empty or trailing segments");
  const resolvedDescription = oneLine(description, "description");

  const packageDir = resolve(directory, layer, name);
  const manifest = manifestFor({ layer, name, owner: normalizedOwner, entryName: resolvedEntryName, description: resolvedDescription });

  const files = [
    ["package.json", `${JSON.stringify(manifest, null, 2)}\n`],
    [`src/${resolvedEntryName}.mjs`, srcFor(resolvedEntryName)],
    [`test/${resolvedEntryName}.test.mjs`, testFor(resolvedEntryName)],
  ];
  if (layer === "apps") files.push([`bin/${resolvedEntryName}.mjs`, binFor(resolvedEntryName)]);

  if (apply) {
    // Construct an entire package in a private sibling and publish only after
    // its files exist. Do not leave a half-generated package on exceptions.
    const sourceRoot = resolve(directory);
    if (await realpath(sourceRoot) !== sourceRoot)
      throw new Error("scaffold root must not be a symlink");
    const layerDir = join(sourceRoot, layer);
    try {
      const currentLayer = lstatSync(layerDir);
      if (!currentLayer.isDirectory() || currentLayer.isSymbolicLink())
        throw new Error("scaffold layer is not a canonical directory");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      await mkdir(layerDir);
    }
    const destination = join(layerDir, name);
    // lstat, not existsSync: a dangling symlink is still an existing target.
    const assertAbsent = () => {
      try { lstatSync(destination); }
      catch (error) {
        if (error?.code === "ENOENT") return;
        throw error;
      }
      throw new Error(`${destination} already exists; scaffolding is append-only`);
    };
    assertAbsent();
    const stage = await mkdtemp(join(layerDir, `.${name}-scaffold-`));
    try {
      await mkdir(join(stage, "src"));
      await mkdir(join(stage, "test"));
      if (layer === "apps") await mkdir(join(stage, "bin"));
      for (const [rel, content] of files)
        await writeFile(join(stage, rel), content, { flag: "wx" });
      assertAbsent();
      await rename(stage, destination);
    } catch (error) {
      await rm(stage, { recursive: true, force: true });
      throw error;
    }
  }

  return Object.freeze({
    type: "JsnodePackageScaffoldConstruction",
    packageDir,
    manifest: Object.freeze(manifest),
    files: Object.freeze(files.map(([path, content]) => Object.freeze({ path, content }))),
    applied: apply,
  });
}
