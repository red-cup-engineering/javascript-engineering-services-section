import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkJavascriptImportLattice, javascriptImportLattice } from "../src/javascript-import-lattice.mjs";

const reading = (path, text) => ({ type: "TextFileRead", path, text });

describe("JavaScript import lattice", () => {
  it("admits the declared upward composition relation", () => {
    const result = checkJavascriptImportLattice([
      reading("src/core.mjs", "import './value.mjs';"),
      reading("scripts/one.mjs", "import '../src/core.mjs'; import './two.mjs';"),
      reading("apps/cli/main.mjs", "import '../../src/core.mjs'; import '../../scripts/one.mjs'; import './view.mjs';"),
    ]);
    assert.deepEqual(result.deviations, []);
    assert.deepEqual(javascriptImportLattice, {
      src: ["src"],
      scripts: ["src", "scripts"],
      apps: ["src", "scripts", "apps"],
    });
  });

  it("refuses imports from a lower composition layer into a higher one", () => {
    const result = checkJavascriptImportLattice([
      reading("src/core.mjs", "export { run } from '../scripts/run.mjs';"),
      reading("scripts/run.mjs", "const app = import('../apps/cli.mjs');"),
    ]);
    assert.deepEqual(result.deviations.map(({ fromLayer, toLayer }) => ({ fromLayer, toLayer })), [
      { fromLayer: "scripts", toLayer: "apps" },
      { fromLayer: "src", toLayer: "scripts" },
    ]);
  });

  it("leaves package imports to the package dependency graph", () => {
    const result = checkJavascriptImportLattice([
      reading("src/core.mjs", "import value from '@scope/provider';"),
    ]);
    assert.deepEqual(result.deviations, []);
  });
});
