#!/usr/bin/env node
import { glob, readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const EXTENSIONS = new Set([".cjs", ".cts", ".js", ".json", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const EXCLUDED_SEGMENTS = new Set(["node_modules", ".git", "content", "data", "dev", "dist", "legacy", "test", "tests"]);

function slash(path) { return path.split(sep).join("/"); }

function under(root, path) {
  const displacement = relative(root, path);
  return displacement === "" || (displacement !== ".." && !displacement.startsWith(`..${sep}`));
}

function activeSourcePath(path) {
  return !slash(path).split("/").some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

export async function readJsnodePackageBody({ root, directories } = {}) {
  if (typeof root !== "string" || root.length === 0) throw new TypeError("root must be a nonempty string");
  if (!Array.isArray(directories)) throw new TypeError("directories must be an array");
  const absoluteRoot = resolve(root);
  const absoluteDirectories = [...new Set(directories.map((directory) => {
    if (typeof directory !== "string" || directory.length === 0) throw new TypeError("every package directory must be a nonempty string");
    const absolute = isAbsolute(directory) ? resolve(directory) : resolve(absoluteRoot, directory);
    if (!under(absoluteRoot, absolute)) throw new RangeError(`package directory is outside root: ${directory}`);
    return absolute;
  }))].sort();
  const packages = [];
  for (const directory of absoluteDirectories) {
    const path = resolve(directory, "package.json");
    const manifest = JSON.parse(await readFile(path, "utf8"));
    if (typeof manifest.name === "string" && manifest.name.length > 0) packages.push(Object.freeze({ path: slash(relative(absoluteRoot, path)), manifest }));
  }
  const sourceFiles = [];
  for await (const candidate of glob("**/*", { cwd: absoluteRoot, withFileTypes: false })) {
    const absolute = resolve(absoluteRoot, candidate);
    if (!activeSourcePath(candidate) || !EXTENSIONS.has(extname(candidate)) || candidate.endsWith("package.json") || candidate.endsWith("package-lock.json")) continue;
    if (absoluteDirectories.some((directory) => under(directory, absolute))) sourceFiles.push(slash(candidate));
  }
  return Object.freeze({
    type: "JsnodePackageBodyRead",
    root: absoluteRoot,
    packages: Object.freeze(packages),
    sourceFiles: Object.freeze([...new Set(sourceFiles)].sort()),
  });
}

if (import.meta.main) {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  const reading = await readJsnodePackageBody(JSON.parse(text));
  process.stdout.write(`${JSON.stringify(reading)}\n`);
}
