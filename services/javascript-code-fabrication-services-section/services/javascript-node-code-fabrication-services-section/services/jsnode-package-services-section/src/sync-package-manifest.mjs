/**
 * A package manifest whose house wiring is exactly what its code uses (PDK rule 4, "wiring is code"; rule 5,
 * "fabrication is subtractive"). House `dependencies` become the house packages its runtime code uses, those
 * its manifest scripts name, and those it declares it loads by name (`loadsByName`, the explicit record of a
 * provider that configuration loads by name); house `devDependencies` become the ones only its tests use.
 * Non-house dependencies, versions already declared and `peerDependencies` are kept as they are.
 *
 * Usage is read by `importsOfFiles` (./package-imports.mjs), the reader the design-rule deck shares.
 */
import { HOUSE_SCOPE } from "./package-imports.mjs";

const RUNTIME_SECTIONS = ["dependencies", "optionalDependencies"];

/** The house packages a manifest's scripts and bins name by package name. */
export function scriptNamedPackages(manifest) {
  const text = JSON.stringify({ ...(manifest.scripts ?? {}), ...(typeof manifest.bin === "object" ? manifest.bin : {}) });
  return [...new Set([...text.matchAll(/@[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*/gu)].map(([name]) => name))].filter((name) => HOUSE_SCOPE.test(name)).sort();
}

/** The house packages a manifest declares it loads by name, validated. */
export function loadsByNameOf(manifest) {
  const declared = manifest.loadsByName ?? [];
  if (!Array.isArray(declared) || declared.some((name) => typeof name !== "string" || !HOUSE_SCOPE.test(name))) {
    throw new TypeError(`${manifest.name ?? "package"}: loadsByName must be a list of house package names`);
  }
  return [...new Set(declared)].sort();
}

/**
 * The manifest with its house wiring synchronized to `imports` ({ runtime, test } from `importsOfFiles`).
 * A house package used but not declared is added only with `add` (fabrication is subtractive: a declaration is
 * removed or moved by default, never invented); otherwise it is reported in `undeclared`. `rangeOf(name)` supplies
 * the range to add it with; when it returns nothing the package is reported unresolved, never guessed.
 * Returns `{ manifest, changes, undeclared, unresolved }`; `changes` is empty when the manifest is already in sync.
 */
export function syncPackageManifest(manifest, imports, { rangeOf = () => null, add: adding = true } = {}) {
  const self = manifest.name;
  const wantRuntime = new Set([...imports.runtime.keys(), ...scriptNamedPackages(manifest), ...loadsByNameOf(manifest)].filter((name) => name !== self));
  const wantTest = new Set([...imports.test.keys()].filter((name) => name !== self && !wantRuntime.has(name)));
  const peers = manifest.peerDependencies ?? {};
  const rangeDeclared = (name) => [...RUNTIME_SECTIONS, "devDependencies", "peerDependencies"].map((s) => manifest[s]?.[name]).find((r) => r !== undefined);
  const next = structuredClone(manifest);
  const changes = [], undeclared = [], unresolved = [];
  const section = (key) => (next[key] ??= {});

  for (const key of [...RUNTIME_SECTIONS, "devDependencies"]) {
    for (const name of Object.keys(manifest[key] ?? {})) {
      if (!HOUSE_SCOPE.test(name) || name === self) continue;
      const range = manifest[key][name];
      const belongs = key === "devDependencies" ? wantTest.has(name) : wantRuntime.has(name);
      if (belongs) continue;
      delete next[key][name];
      if (key !== "devDependencies" && wantTest.has(name)) {
        if (section("devDependencies")[name] === undefined) next.devDependencies[name] = range;
        changes.push({ dependency: name, action: "moved-to-devDependencies", from: key, range });
      } else if (key === "devDependencies" && wantRuntime.has(name)) {
        if (!RUNTIME_SECTIONS.some((s) => next[s]?.[name] !== undefined) && peers[name] === undefined) section("dependencies")[name] = range;
        changes.push({ dependency: name, action: "moved-to-dependencies", from: key, range });
      } else {
        changes.push({ dependency: name, action: "removed", from: key, range });
      }
    }
  }
  const add = (key, name) => {
    const range = rangeDeclared(name) ?? rangeOf(name);
    if (range === undefined || range === null) { unresolved.push({ dependency: name, wanted: key }); return; }
    if (!adding) { undeclared.push({ dependency: name, wanted: key, range }); return; }
    section(key)[name] = range;
    changes.push({ dependency: name, action: "added", to: key, range });
  };
  for (const name of [...wantRuntime].sort()) if (!RUNTIME_SECTIONS.some((s) => next[s]?.[name] !== undefined) && peers[name] === undefined) add("dependencies", name);
  for (const name of [...wantTest].sort()) if (next.devDependencies?.[name] === undefined && peers[name] === undefined) add("devDependencies", name);
  for (const key of [...RUNTIME_SECTIONS, "devDependencies"]) if (next[key] && Object.keys(next[key]).length === 0 && manifest[key] === undefined) delete next[key];
  for (const key of [...RUNTIME_SECTIONS, "devDependencies"]) if (next[key] && Object.keys(next[key]).length === 0 && Object.keys(manifest[key] ?? {}).some((name) => HOUSE_SCOPE.test(name))) delete next[key];
  return Object.freeze({ manifest: next, changes: Object.freeze(changes), undeclared: Object.freeze(undeclared), unresolved: Object.freeze(unresolved) });
}

/** A manifest serialized the way `original` was written: its indent, its `\uXXXX` escapes and its trailing whitespace. */
export function formatManifestLike(original, manifest) {
  const indent = /\n([ \t]+)"/u.exec(original)?.[1] ?? "  ";
  let written = JSON.stringify(manifest, null, indent);
  if (/\\u[0-9a-fA-F]{4}/u.test(original)) written = written.replace(/[\u0080-￿]/gu, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return written + /\s*$/u.exec(original)[0];
}
