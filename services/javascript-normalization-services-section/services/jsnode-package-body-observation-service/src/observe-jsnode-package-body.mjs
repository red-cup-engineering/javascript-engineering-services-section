import { glob, readFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

const EXTENSIONS = new Set([".cjs", ".cts", ".js", ".json", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const EXCLUDED = Object.freeze(["**/node_modules/**", "**/.git/**", "**/content/assets/legacy/**", "**/src/content/assets/legacy/**", "**/data/runtime-images/**", "**/dev/content/triage/prior-app/**", "**/.archive/**", "**/.cache/**", "**/.venv/**", "**/venv/**", "**/build/**", "**/dist/**"]);

function slash(path) { return path.split(sep).join("/"); }

export async function observeJsnodePackageBody({ root, manifestPaths = ["package.json"] } = {}) {
  if (typeof root !== "string" || !root) throw new TypeError("root is required");
  const absoluteRoot = resolve(root);
  if (!Array.isArray(manifestPaths) || manifestPaths.length === 0) throw new TypeError("explicit package manifests required");
  const manifestCandidates = new Set(manifestPaths.map(path => {
    if (typeof path !== "string" || isAbsolute(path) || path.split(/[\\/]/u).includes("..") || !/(?:^|\/)package\.json$/u.test(path)) throw new TypeError("package manifests must be relative to the receiving root");
    return slash(relative(absoluteRoot, resolve(absoluteRoot, path)));
  }));
  const packages = [];
  for (const path of [...manifestCandidates].sort()) {
    const manifest = JSON.parse(await readFile(resolve(absoluteRoot, path), "utf8"));
    if (typeof manifest.name === "string" && manifest.name) packages.push({ path, manifest });
  }
  const extensions = [...EXTENSIONS].map((value) => value.slice(1)).sort().join(",");
  const sourceFiles = [];
  for (const { path: manifestPath } of packages) {
    const directory = dirname(manifestPath);
    for await (const path of glob(["*.{" + extensions + "}", "{src,scripts,bin}/**/*.{" + extensions + "}"], {
      cwd: resolve(absoluteRoot, directory),
      exclude: [...EXCLUDED, "**/test/**", "**/tests/**", "**/fixtures/**"],
    })) if (EXTENSIONS.has(extname(path)) && !path.endsWith("package-lock.json") && !path.endsWith("package.json")) sourceFiles.push(slash(join(directory, path)));
  }
  return Object.freeze({ type: "JsnodePackageBodyObservation", root: absoluteRoot, packages: Object.freeze(packages), sourceFiles: Object.freeze([...new Set(sourceFiles)].sort()) });
}
