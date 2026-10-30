import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const javascriptSourceExtensions = Object.freeze([".js", ".mjs", ".ts", ".mts"]);
const sourceExtensions = new Set(javascriptSourceExtensions);
const sourceLayers = Object.freeze(["src", "scripts", "apps"]);

/**
 * Read the source carriers owned by one JavaScript package. Build output,
 * dependencies, and every other package-local directory are intentionally
 * outside this boundary.
 */
export function readJavascriptPackageSources(packageDirectory) {
  const root = path.resolve(packageDirectory);
  const readings = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && sourceExtensions.has(path.extname(entry.name)) && !entry.name.endsWith(".d.ts")) {
        readings.push(Object.freeze({
          type: "TextFileRead",
          path: path.relative(root, absolute).replaceAll(path.sep, "/"),
          text: readFileSync(absolute, "utf8"),
        }));
      }
    }
  };
  for (const layer of sourceLayers) {
    try {
      visit(path.join(root, layer));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return Object.freeze(readings.sort((left, right) => left.path.localeCompare(right.path)));
}

/** Resolve a relative source specifier to a carrier path when it exists. */
export function resolveJavascriptPackageSource(fromPath, specifier, sourcePaths) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier));
  const candidates = [base, ...javascriptSourceExtensions.map((extension) => `${base}${extension}`), ...javascriptSourceExtensions.map((extension) => `${base}/index${extension}`)];
  return candidates.find((candidate) => sourcePaths.has(candidate)) ?? base;
}
