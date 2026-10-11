import assert from "node:assert/strict";
import test from "node:test";
import { PACKAGE_INTERFACE_CLASSES, exportAdditions, houseImportsOfFiles, isHousePackage, packageInterfaceFindings, specifierParts } from "../src/workspace/package-interfaces.mjs";

const isHouse = (name) => name.startsWith("@house/");
const pkg = (name, dir, exports, files) => ({ name, dir, manifest: { name, exports }, files: new Set(files) });

// This morning's composition break, at PR time: the host imports a subpath its provider never exported.
const engine = pkg("@house/engine", "apps/engine", { "./dispatch/operations": "./src/dispatch/operations.mjs" },
  ["package.json", "src/dispatch/operations.mjs", "src/dispatch/work-inference-coordinate.mjs"]);
const host = pkg("@house/host", "apps/host", { ".": "./src/index.mjs" }, ["package.json", "src/index.mjs", "src/agency-work.mjs"]);

test("specifiers split into package and subpath", () => {
  assert.deepEqual(specifierParts("@house/engine/dispatch/x"), { name: "@house/engine", subpath: "./dispatch/x" });
  assert.deepEqual(specifierParts("@house/engine"), { name: "@house/engine", subpath: "." });
  assert.deepEqual(specifierParts("yaml"), { name: "yaml", subpath: "." });
});

test("an import of a subpath the provider does not export is unexported-interface", () => {
  const { findings, diagnostics } = packageInterfaceFindings({
    packages: [engine, host], isHouse,
    imports: [
      { importer: "@house/host", file: "apps/host/src/agency-work.mjs", specifier: "@house/engine/dispatch/work-inference-coordinate" },
      { importer: "@house/host", file: "apps/host/src/agency-work.mjs", specifier: "@house/engine/dispatch/operations" },
      { importer: "@house/host", file: "apps/host/src/index.mjs", specifier: "yaml" },
      { importer: "@house/host", file: "apps/host/src/index.mjs", specifier: "./agency-work.mjs" },
    ],
  });
  assert.deepEqual(diagnostics, []);
  assert.equal(findings.length, 1);
  assert.deepEqual({ ...findings[0], providerSource: undefined }, {
    class: "unexported-interface", importer: "@house/host", file: "apps/host/src/agency-work.mjs",
    specifier: "@house/engine/dispatch/work-inference-coordinate", provider: "@house/engine",
    subpath: "./dispatch/work-inference-coordinate", providerSource: undefined,
  });
});

test("providers resolved outside the repository are read at their resolved manifest; unresolved ones are diagnostics", () => {
  const resolved = new Map([["@house/codec", { source: "node_modules/@house/codec@0.1.3", manifest: { exports: { ".": "./index.mjs", "./jsonl": "./jsonl.mjs" } } }]]);
  const { findings, diagnostics } = packageInterfaceFindings({
    packages: [host], isHouse, resolved,
    imports: [
      { importer: "@house/host", file: "f.mjs", specifier: "@house/codec/jsonl" },
      { importer: "@house/host", file: "f.mjs", specifier: "@house/codec/writing" },
      { importer: "@house/host", file: "f.mjs", specifier: "@house/elsewhere" },
    ],
  });
  assert.deepEqual(findings.map((row) => [row.class, row.specifier, row.providerSource.source]), [["unexported-interface", "@house/codec/writing", "node_modules/@house/codec@0.1.3"]]);
  assert.deepEqual(diagnostics, [{ reason: "provider-unresolved", importer: "@house/host", file: "f.mjs", specifier: "@house/elsewhere", provider: "@house/elsewhere" }]);
});

test("exports naming missing files or retired trees are findings; types-only targets and patterns are read as such", () => {
  const odd = pkg("@house/odd", "services/odd", {
    ".": { types: "./types/index.d.ts", import: "./src/index.mjs" },
    "./gone": "./src/gone.mjs",
    "./old": "./lib/legacy/old.mjs",
    "./fixtures": "./test/fixtures/index.mjs",
    "./parts/*": "./src/parts/*.mjs",
    "./empty/*": "./src/empty/*.mjs",
  }, ["package.json", "src/index.mjs", "lib/legacy/old.mjs", "test/fixtures/index.mjs", "src/parts/a.mjs"]);
  const { findings } = packageInterfaceFindings({ packages: [odd], imports: [], isHouse });
  assert.deepEqual(findings.map((row) => [row.class, row.subpath]), [
    ["export-into-retired-tree", "./fixtures"],
    ["export-into-retired-tree", "./old"],
    ["export-target-missing", "./empty/*"],
    ["export-target-missing", "./gone"],
  ]);
});

test("--write adds an export only for one existing conventional file, never for an exclusion", () => {
  const twice = pkg("@house/twice", "s/twice", {}, ["package.json", "src/x.mjs", "scripts/x.mjs"]);
  const closed = pkg("@house/closed", "s/closed", { "./private/*": null }, ["package.json", "src/private/p.mjs"]);
  const imports = [
    { importer: "@house/host", file: "a.mjs", specifier: "@house/engine/dispatch/work-inference-coordinate" },
    { importer: "@house/host", file: "b.mjs", specifier: "@house/engine/dispatch/work-inference-coordinate" },
    { importer: "@house/host", file: "a.mjs", specifier: "@house/engine/absent" },
    { importer: "@house/host", file: "b.mjs", specifier: "@house/engine/absent" },
    { importer: "@house/host", file: "a.mjs", specifier: "@house/twice/x" },
    { importer: "@house/host", file: "a.mjs", specifier: "@house/closed/private/p" },
  ];
  const packages = [engine, host, twice, closed];
  const { findings } = packageInterfaceFindings({ packages, imports, isHouse });
  const { additions, refusals } = exportAdditions(findings, packages);
  assert.deepEqual(additions, [{ package: "@house/engine", dir: "apps/engine", subpath: "./dispatch/work-inference-coordinate", target: "./src/dispatch/work-inference-coordinate.mjs" }]);
  assert.deepEqual(refusals.map((row) => [row.provider, row.subpath, row.reason]), [
    ["@house/engine", "./absent", "no-target-file"],
    ["@house/twice", "./x", "ambiguous-target"],
  ]);
});

test("a dist target of a package that builds is an unchecked build output, not a missing file", () => {
  const built = { name: "@house/built", dir: "s/built", manifest: { name: "@house/built", scripts: { build: "tsc -p tsconfig.build.json" }, exports: { ".": "./dist/index.mjs" } }, files: new Set(["package.json", "src/index.mts"]) };
  const unbuilt = { name: "@house/unbuilt", dir: "s/unbuilt", manifest: { name: "@house/unbuilt", exports: { ".": "./dist/index.mjs" } }, files: new Set(["package.json"]) };
  const { findings, diagnostics } = packageInterfaceFindings({ packages: [built, unbuilt], imports: [], isHouse });
  assert.deepEqual(findings.map((row) => [row.class, row.package]), [["export-target-missing", "@house/unbuilt"]]);
  assert.deepEqual(diagnostics, [{ reason: "built-target-unchecked", package: "@house/built", subpath: ".", target: "./dist/index.mjs" }]);
});

test("every finding class comes from the one exported class list", () => {
  const odd = pkg("@house/odd", "s/odd", { "./gone": "./src/gone.mjs", "./old": "./lib/legacy/old.mjs" }, ["package.json", "lib/legacy/old.mjs"]);
  const { findings } = packageInterfaceFindings({ packages: [odd, host], isHouse, imports: [{ importer: "@house/host", file: "a.mjs", specifier: "@house/odd/absent" }] });
  assert.deepEqual([...new Set(findings.map((row) => row.class))].sort(), [...PACKAGE_INTERFACE_CLASSES].sort());
});

test("house imports come from the shared reader with subpaths, test code marked and nested packages left out", () => {
  const rows = houseImportsOfFiles("@red-cup-engineering/host", "apps/host", [
    { path: "src/agency-work.mjs", text: 'import { workInferenceCoordinate } from "@red-cup-engineering/computer-inference-engine/dispatch/work-inference-coordinate";\nimport yaml from "yaml";' },
    { path: "src/route.mjs", text: 'const handler = "@red-cup-engineering/organizing/agency:readAgency";' },
    { path: "test/host.test.mjs", text: 'import "@red-cup-engineering/computer-web-server/platform-http/operation-serving";' },
    { path: "lib/legacy/old.mjs", text: 'import "@red-cup-engineering/relating/writing";' },
    { path: "vendor-pkg/src/x.mjs", text: 'import "@red-cup-engineering/nested-only";' },
  ], { nestedRoots: ["vendor-pkg"] });
  assert.deepEqual(rows.map(({ file, specifier, role }) => [file, specifier, role]), [
    ["apps/host/src/agency-work.mjs", "@red-cup-engineering/computer-inference-engine/dispatch/work-inference-coordinate", "runtime"],
    ["apps/host/src/route.mjs", "@red-cup-engineering/organizing/agency", "runtime"],
    ["apps/host/test/host.test.mjs", "@red-cup-engineering/computer-web-server/platform-http/operation-serving", "test"],
  ]);
  assert.equal(isHousePackage("@red-cup-engineering/organizing"), true);
  assert.equal(isHousePackage("yaml"), false);
});

test("repeated wildcard targets require the same capture and imported members must exist", () => {
  const provider = pkg("@house/pattern", "provider", { "./*": "./src/*/copy-*.mjs" }, ["src/a/copy-a.mjs"]);
  const check = name => packageInterfaceFindings({ packages: [provider], isHouse,
    imports: [{ importer: "@house/consumer", file: "src/index.mjs", specifier: `@house/pattern/${name}` }] });
  assert.deepEqual(check("a").findings, []);
  assert.deepEqual(check("b").findings.map(({ class: kind, subpath, target }) => [kind, subpath, target]), [
    ["export-target-missing", "./b", "./src/b/copy-b.mjs"]
  ]);
  provider.files = new Set(["src/a/copy-b.mjs"]);
  assert.equal(check("a").findings.some(row => row.subpath === "./*" && row.class === "export-target-missing"), true);
});

test("valid invalid-target fallbacks do not create spurious missing-file findings", () => {
  const provider = pkg("@house/fallback", "provider", { ".": ["invalid", "./ok.mjs"] }, ["ok.mjs"]);
  assert.deepEqual(packageInterfaceFindings({ packages: [provider], isHouse,
    imports: [{ importer: "@house/consumer", file: "src/index.mjs", specifier: "@house/fallback" }] }).findings, []);
});


test("repeated wildcard followed by digits cannot become a larger backreference", () => {
  const provider = pkg("@house/pattern", "provider", { "./*": "./src/*/copy-*2.mjs" }, ["src/a/copy-a2.mjs"]);
  assert.deepEqual(packageInterfaceFindings({ packages: [provider], isHouse,
    imports: [{ importer: "@house/consumer", file: "src/index.mjs", specifier: "@house/pattern/a" }] }).findings, []);
});
