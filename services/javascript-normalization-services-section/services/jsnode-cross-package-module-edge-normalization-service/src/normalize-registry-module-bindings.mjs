import { access, readdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

/** Port an explicitly assessed public-interface relocation through owned JS
 * bodies, including literal dynamic imports. Source paths select edits only;
 * the resulting runtime references name published package interfaces. */
export async function normalizeRegistryModuleBindings({ packageDirs, bindings, releaseVersions = {}, maxFilesPerPackage = 2000, onProgress = () => {} }) {
  if (!Array.isArray(packageDirs) || !Array.isArray(bindings)) throw new TypeError("explicit package bodies and interface bindings required");
  const changed = [], visited = [];
  for (const root of packageDirs) {
    const manifestPath = join(root, "package.json"), manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const introduced = new Set();
    const nested = (manifest.files ?? []).filter(value => value.startsWith("services/") && !value.includes("*"));
    const pending = [root];
    for (const locator of nested) {
      const path = join(root, locator);
      try { if ((await stat(path)).isDirectory()) pending.push(path); } catch {}
    }
    let count = 0;
    while (pending.length) {
      const dir = pending.pop();
      for (const file of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, file.name);
        if (file.isDirectory()) {
          if (file.name.startsWith(".") || ["node_modules", "data", "services"].includes(file.name)) continue;
          try { await access(join(path, "package.json")); continue; } catch {}
          pending.push(path);
        } else if (file.isFile() && /\.[cm]?[jt]s$/u.test(file.name)) {
          if (++count > maxFilesPerPackage) throw new Error(`package body exceeds declared bound: ${root}`);
          const text = await readFile(path, "utf8"); let next = text;
          for (const binding of bindings) {
            let from = binding.from;
            if (binding.sourcePath) { from = relative(dirname(path), binding.sourcePath).split(sep).join("/"); if (!from.startsWith(".")) from = `./${from}`; }
            let to = binding.to;
            if (binding.targetPath) { to = relative(dirname(path), binding.targetPath).split(sep).join("/"); if (!to.startsWith(".")) to = `./${to}`; }
            if (typeof from !== "string" || typeof to !== "string") throw new TypeError("binding requires exact source and target interfaces");
            for (const quote of ["'", '"', "`"] ) {
              const literal = `${quote}${from}${quote}`;
              if (next.includes(literal) && !to.startsWith(".")) introduced.add(to.startsWith("@") ? to.split("/").slice(0, 2).join("/") : to.split("/")[0]);
              next = next.replaceAll(literal, `${quote}${to}${quote}`);
            }
          }
          if (next !== text) { await writeFile(path, next); changed.push(path); }
        }
      }
    }
    let manifestChanged = false;
    for (const dependency of introduced) {
      if (dependency === manifest.name) continue;
      const version = releaseVersions[dependency];
      if (!version) throw new Error(`unadmitted registry interface: ${dependency}`);
      manifest.dependencies ??= {};
      if (manifest.dependencies[dependency] !== version) { manifest.dependencies[dependency] = version; manifestChanged = true; }
    }
    if (manifestChanged) { await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`); changed.push(manifestPath); }
    visited.push(root);
    await onProgress({ kind: "jsnode.registry-module-bindings", bindings: bindings.length, changed, visited });
  }
  return { kind: "jsnode.registry-module-bindings", bindings: bindings.length, changed, visited };
}
