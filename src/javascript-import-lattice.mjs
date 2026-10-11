import path from "node:path";

import { readJavascriptFileImports } from "@red-cup-engineering/javascript-file-import-services-section/read-javascript-file-imports";

export const javascriptImportLattice = Object.freeze({
  src: Object.freeze(["src"]),
  scripts: Object.freeze(["src", "scripts"]),
  apps: Object.freeze(["src", "scripts", "apps"]),
});

function layerOf(filePath) {
  const [first] = filePath.replaceAll("\\", "/").replace(/^\.\//u, "").split("/");
  return Object.hasOwn(javascriptImportLattice, first) ? first : null;
}

/**
 * Check relative JavaScript imports against the src/scripts/apps composition lattice.
 *
 * This is a pure transformation of already-read TextFileRead carriers. Package
 * imports are intentionally outside its scope: the package graph owns those.
 */
export function checkJavascriptImportLattice(readings) {
  if (!Array.isArray(readings)) throw new TypeError("readings must be an array of TextFileRead carriers");
  const deviations = [];
  for (const reading of [...readings].sort((left, right) => left.path.localeCompare(right.path))) {
    const fromLayer = layerOf(reading.path);
    if (fromLayer === null) continue;
    const imports = readJavascriptFileImports(reading).imports;
    for (const imported of imports) {
      if (!imported.specifier.startsWith(".")) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(reading.path.replaceAll("\\", "/")), imported.specifier));
      const toLayer = layerOf(target);
      if (toLayer === null || javascriptImportLattice[fromLayer].includes(toLayer)) continue;
      deviations.push(Object.freeze({
        type: "JavascriptImportLatticeDeviation",
        version: 1,
        path: reading.path,
        specifier: imported.specifier,
        fromLayer,
        toLayer,
        allowedTargetLayers: javascriptImportLattice[fromLayer],
        start: imported.start,
        end: imported.end,
      }));
    }
  }
  return Object.freeze({
    type: "JavascriptImportLatticeCheck",
    version: 1,
    lattice: javascriptImportLattice,
    deviations: Object.freeze(deviations),
  });
}
