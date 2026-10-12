#!/usr/bin/env node
/**
 * check-package-interfaces: STD-EXPORTS for one repository (src/workspace/package-interfaces.mjs over the house
 * import reader, src/package-imports.mjs, and the exports-map resolver, src/workspace/exports/resolve.mjs).
 *
 *   node scripts/check-package-interfaces.mjs --check [REPOSITORY]   report findings by class; exit 1 if any
 *   node scripts/check-package-interfaces.mjs --write [REPOSITORY]   also add the exports house code imports and
 *                                                                    exactly one conventional file carries
 *
 * Packages and the files each owns come from the shared package tree (src/package-tree.mjs). A house
 * provider outside the repository is read where Node would resolve it, a node_modules directory from the
 * importing package up to the repository root, at its installed version; one found nowhere is a diagnostic.
 * Classes are the composition gate's break classes (guix-machine-release-service assembly-breaks BREAK_CLASSES).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { nestedRootsOf, ownedFiles, packageRoots } from "../src/package-tree.mjs";
import { formatManifestLike } from "../src/sync-package-manifest.mjs";
import { PACKAGE_INTERFACE_CLASSES, exportAdditions, houseImportsOfFiles, packageInterfaceFindings } from "../src/workspace/package-interfaces.mjs";

const mode = process.argv.includes("--write") ? "write" : "check";
const repository = resolve(process.argv.slice(2).find((argument) => !argument.startsWith("--")) ?? ".");
const tracked = execFileSync("git", ["-C", repository, "ls-files", "-z"], { encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean);
const roots = packageRoots(tracked);

const packages = [], imports = [];
for (const root of roots) {
  const manifest = JSON.parse(readFileSync(join(repository, root, "package.json"), "utf8"));
  if (typeof manifest.name !== "string") continue;
  const nestedRoots = nestedRootsOf(root, roots), own = ownedFiles(root, roots, tracked);
  packages.push({ name: manifest.name, dir: root, manifest, files: new Set(own.map(({ path }) => path)) });
  const code = own.filter(({ path }) => /\.(?:[cm]?[jt]s|[jt]sx)$/u.test(path))
    .map(({ path, file }) => ({ path, text: readFileSync(join(repository, file), "utf8") }));
  imports.push(...houseImportsOfFiles(manifest.name, root, code, { nestedRoots }));
}

// Providers outside the repository, at the version an install resolves for the first importer that reaches them.
const inRepository = new Set(packages.map((pkg) => pkg.name));
const resolved = new Map();
const dirOf = new Map(packages.map((pkg) => [pkg.name, pkg.dir]));
for (const { importer, specifier } of imports) {
  const name = specifier.split("/").slice(0, 2).join("/");
  if (inRepository.has(name) || resolved.has(name)) continue;
  for (let dir = join(repository, dirOf.get(importer)); ; dir = resolve(dir, "..")) {
    const manifestPath = join(dir, "node_modules", name, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      resolved.set(name, { manifest, source: `${relative(repository, manifestPath)}@${manifest.version ?? "unversioned"}` });
      break;
    }
    if (dir === repository || dir === resolve(dir, "..")) break;
  }
}

const { findings, diagnostics } = packageInterfaceFindings({ packages, imports, resolved });
const { additions, refusals } = exportAdditions(findings, packages);
const written = [];
if (mode === "write") {
  for (const [dir, rows] of Map.groupBy(additions, (row) => row.dir)) {
    const file = join(repository, dir, "package.json");
    const text = readFileSync(file, "utf8"), manifest = JSON.parse(text);
    const exportsMap = typeof manifest.exports === "object" && manifest.exports !== null && !Array.isArray(manifest.exports)
      && Object.keys(manifest.exports).every((key) => key.startsWith(".")) ? manifest.exports
      : manifest.exports === undefined ? {} : null;
    if (exportsMap === null) { refusals.push(...rows.map((row) => ({ provider: row.package, subpath: row.subpath, reason: "exports-not-a-subpath-map" }))); continue; }
    for (const row of rows) exportsMap[row.subpath] = row.target;
    writeFileSync(file, formatManifestLike(text, { ...manifest, exports: exportsMap }));
    written.push(...rows);
  }
}
const byClass = Object.fromEntries(PACKAGE_INTERFACE_CLASSES.map((name) => [name, findings.filter((row) => row.class === name)]));
process.stdout.write(JSON.stringify({
  kind: "check-package-interfaces", mode, repository, packages: packages.length, imports: imports.length,
  findings: byClass, diagnostics, ...(mode === "write" ? { added: written, refused: refusals } : { proposed: additions, refused: refusals }),
}, null, 2) + "\n");
const added = mode === "write" ? new Set(written.map((row) => `${row.package}\0${row.subpath}`)) : new Set();
const open = findings.filter((row) => !(row.class === "unexported-interface" && added.has(`${row.provider}\0${row.subpath}`)));
if (open.length) process.exitCode = 1;
