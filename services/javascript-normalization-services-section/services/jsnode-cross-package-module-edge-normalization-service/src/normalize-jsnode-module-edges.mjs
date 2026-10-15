import { access } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

const SPECIFIER = /(?<!["'])((?:\bfrom\s*|\bimport\s*(?:\(\s*)?|\brequire\s*\()\s*)(["'])(\.{1,2}\/[^"']+)\2/gu;
function slash(path) { return path.split(sep).join("/"); }
async function moduleTarget(path) {
  for (const candidate of [path, path + ".js", path + ".mjs", path + ".cjs", path + ".json", join(path, "index.js"), join(path, "index.mjs"), join(path, "index.cjs")]) {
    try { await access(candidate); return candidate; } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
  return null;
}

export async function normalizeJsnodeModuleEdges({ root, path, source, carriers } = {}) {
  if (typeof root !== "string" || typeof path !== "string" || typeof source !== "string" || !Array.isArray(carriers)) throw new TypeError("root, path, source, and carriers are required");
  const rows = carriers.map((carrier) => ({ ...carrier, directory: resolve(root, carrier.directory) })).sort((a, b) => b.directory.length - a.directory.length);
  const byDirectory = new Map(rows.map((row) => [row.directory, row]));
  const carrierOf = (target) => {
    let directory = dirname(target);
    for (;;) {
      const row = byDirectory.get(directory);
      if (row) return row;
      const parent = dirname(directory);
      if (parent === directory) return null;
      directory = parent;
    }
  };
  const absolute = resolve(root, path), consumer = carrierOf(absolute);
  if (!consumer) return Object.freeze({ source, edges: [], consumerPath: null, consumerDependencies: {}, providerExports: [] });
  let cursor = 0, output = "";
  const edges = [], dependencies = {}, exports = [];
  for (const match of source.matchAll(SPECIFIER)) {
    const target = await moduleTarget(resolve(dirname(absolute), match[3]));
    const provider = target ? carrierOf(target) : null;
    if (!provider || provider.directory === consumer.directory) continue;
    const subpath = "./" + slash(relative(provider.directory, target));
    const release = provider.registryRelease;
    const exportTarget = (value) => typeof value === "string" ? value : value?.import ?? value?.default;
    const publicEntries = typeof release?.exports === "string" ? [[".", release.exports]] : Object.entries(release?.exports ?? {});
    const publicFace = publicEntries.find(([, value]) => exportTarget(value) === subpath)?.[0];
    if (release?.name !== provider.name || !release.dist?.integrity || !release.dist?.tarball || !publicFace) throw new Error(`cross-package import requires a published export for ${provider.name}${subpath.slice(1)}`);
    const specifier = publicFace === "." ? provider.name : provider.name + publicFace.slice(1);
    output += source.slice(cursor, match.index) + match[1] + match[2] + specifier + match[2];
    cursor = match.index + match[0].length;
    dependencies[provider.name] = release.version;
    edges.push(consumer.name + "->" + provider.name + ":" + subpath);
  }
  if (cursor) output += source.slice(cursor);
  return Object.freeze({ source: cursor ? output : source, edges: Object.freeze([...new Set(edges)].sort()), consumerPath: consumer.path, consumerDependencies: Object.freeze(dependencies), providerExports: Object.freeze(exports) });
}
