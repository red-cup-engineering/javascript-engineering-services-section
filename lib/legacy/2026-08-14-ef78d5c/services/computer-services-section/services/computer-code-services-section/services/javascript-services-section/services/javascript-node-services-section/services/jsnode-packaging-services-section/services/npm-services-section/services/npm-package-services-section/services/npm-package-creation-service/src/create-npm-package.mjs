// Creates a new npm package: a directory holding the package.json described
// by explicit arguments. Refuses to write over an existing package
// directory.

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

function oneLine(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} is required`);
  return value;
}

export async function createNpmPackage({
  name,
  description,
  directory = ".",
  version = "0.0.1",
  type = "module",
  license,
  author,
} = {}) {
  oneLine(name, "name");
  oneLine(description, "description");

  const manifest = { name, version, type, description };
  if (license) manifest.license = license;
  if (author) manifest.author = author;

  const packageDir = resolve(directory, basename(name));
  if (existsSync(packageDir)) throw new Error(`${packageDir} already exists`);

  await mkdir(packageDir, { recursive: true });
  await writeFile(join(packageDir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });

  return Object.freeze({
    type: "JsnodePackageCreation",
    packageDir,
    manifest: Object.freeze(manifest),
  });
}
