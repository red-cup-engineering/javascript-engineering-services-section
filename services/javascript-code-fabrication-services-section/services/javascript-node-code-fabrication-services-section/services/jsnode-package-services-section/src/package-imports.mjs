/**
 * The house packages a package's own code uses, read from its source text: the one import reader the
 * manifest generator (`sync-package-manifest`) and the design-rule deck (PDK-4, guix-machine-release-service
 * design-rules.mjs) share, so "declared" and "used" are measured the same way everywhere.
 *
 * A house specifier is used when a module names it in
 * - an import or export `from`, a dynamic `import()`, `require()`, `process.getBuiltinModule()` or a bare
 *   `import "…"`;
 * - any resolve call, `import.meta.resolve`, `require.resolve` or a local `resolveModule("@…")`;
 * - a route string `"@scope/pkg[/sub]:export"`, a package export named for later loading.
 * Code under test, tests, __tests__, fixtures or examples, and `*.test.*` / `*.spec.*` files, is test code;
 * legacy, vendor and node_modules trees and nested packages are not the package's code at all.
 *
 * This module depends on nothing but the language, so a reader of committed blobs can import it from a
 * checkout without composing a workspace.
 */

/** The house scopes: a dependency in one of them is house wiring, governed by PDK rule 4. */
export const HOUSE_SCOPE = /^@(?:561-group|causeway-services|coesite-operations|emsenn|emsweb|harmonious-union|koios-news|lenticule-science|red-cup-engineering|red-cup-science|rsc-quiescent|turntide-islands|union-officer-academy)\//u;
/** A file whose text is JavaScript or TypeScript code. */
export const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const TEST_PATH = /(?:^|\/)(?:test|tests|__tests__|fixtures|examples)\//u;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const NOT_CODE_PATH = /(?:^|\/)(?:legacy|vendor|vendored|node_modules)\//u;
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bgetBuiltinModule\s*\(\s*|\bimport\s+)['"]([^'"\s]+)['"]/gu;
const RESOLVED = /\b[\w$]*[Rr]esolve[\w$]*\s*\(\s*['"](@[^'"\s]+)['"]/gu;
const ROUTE = /['"](@[a-z0-9][\w.-]*\/[a-z0-9][\w.-]*(?:\/[^'"\s:]*)?):[A-Za-z_$][\w$]*['"]/gu;

/** The package a specifier names: `@scope/name` of `@scope/name/sub/path`. */
export function packageNameOf(specifier) {
  const [scope, name] = String(specifier).split("/");
  return scope?.startsWith("@") && name ? `${scope}/${name}` : String(specifier).split("/")[0];
}

/** The house specifiers one module's text uses, sorted and without repeats. */
export function houseSpecifiersOfText(text) {
  const found = new Set();
  for (const pattern of [SPECIFIER, RESOLVED, ROUTE]) for (const match of String(text).matchAll(pattern)) found.add(match[1]);
  return [...found].filter((specifier) => HOUSE_SCOPE.test(specifier)).sort();
}

/** Whether a package-relative path is the package's own code, and if so whether it is test code. */
export function codeRole(path) {
  if (!CODE_FILE.test(path) || NOT_CODE_PATH.test(path) || /\.d\.[cm]?ts$/u.test(path)) return null;
  return TEST_PATH.test(path) || TEST_FILE.test(path) ? "test" : "runtime";
}

/**
 * The house packages used by a package's code, from its files as `{ path, text }` with package-relative paths.
 * `nestedRoots` are package-relative directories of nested packages, whose files belong to them, not to this one.
 * Returns `{ runtime, test }`: maps from each house package name to the sorted files that use it. A package
 * used by runtime code is in `runtime` only, however many tests also use it.
 */
export function importsOfFiles(files, { nestedRoots = [] } = {}) {
  const runtime = new Map(), test = new Map();
  const nested = nestedRoots.filter((root) => root && root !== ".");
  for (const { path, text } of files) {
    if (nested.some((root) => path === root || path.startsWith(`${root}/`))) continue;
    const role = codeRole(path);
    if (!role) continue;
    for (const specifier of houseSpecifiersOfText(text)) {
      const into = role === "runtime" ? runtime : test, name = packageNameOf(specifier);
      if (!into.has(name)) into.set(name, new Set());
      into.get(name).add(path);
    }
  }
  for (const name of runtime.keys()) test.delete(name);
  const sorted = (map) => new Map([...map].sort(([a], [b]) => a.localeCompare(b)).map(([name, paths]) => [name, [...paths].sort()]));
  return Object.freeze({ runtime: sorted(runtime), test: sorted(test) });
}
