import { checkJavascriptImportLattice } from "./javascript-import-lattice.mjs";
export { readJavascriptPackageSources } from "./javascript-package-sources.mjs";
import { readJavascriptPackageSources } from "./javascript-package-sources.mjs";

export function check561GroupJavascriptImportLattice(packageDirectory) {
  return checkJavascriptImportLattice(readJavascriptPackageSources(packageDirectory));
}
