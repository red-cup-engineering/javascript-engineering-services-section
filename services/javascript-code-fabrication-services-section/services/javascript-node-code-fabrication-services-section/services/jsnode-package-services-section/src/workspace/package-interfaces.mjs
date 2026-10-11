/**
 * @packageDocumentation
 *
 * package-interfaces - STD-EXPORTS: every package interface a repository declares or uses holds.
 *
 * `packageInterfaceFindings` reads a repository's packages (manifest and tracked files), the house
 * imports its files make, and the manifests of providers resolved outside it, and reports:
 *
 * - `export-target-missing`: an `exports` target names no file the package carries (a `dist/` target
 *   of a package with a `build` script is a build output, reported as a diagnostic instead);
 * - `export-into-retired-tree`: an `exports` target points into a `legacy/` or `test/` tree;
 * - `unexported-interface`: a house import names a subpath its provider does not export (the
 *   assembly-break class prepare-sources raises for the same defect at machine composition).
 *
 * A house import whose provider is neither in the repository nor resolved is a diagnostic, never a
 * pass. `exportAdditions` proposes the one export each in-repository `unexported-interface` needs,
 * only where exactly one conventional file carries the subpath.
 */
import { HOUSE_SCOPE, codeRole, houseSpecifiersOfText } from "../package-imports.mjs";
import { exportKeyForSubpath, exportTargets, resolveExportSubpath } from "./exports/resolve.mjs";

/** Every finding class this checker can emit: break classes guix-machine-release-service's BREAK_CLASSES also names. */
export const PACKAGE_INTERFACE_CLASSES = Object.freeze(["export-target-missing", "export-into-retired-tree", "unexported-interface"]);
const [TARGET_MISSING, INTO_RETIRED, UNEXPORTED] = PACKAGE_INTERFACE_CLASSES;

const RETIRED = new Set(["legacy", "test"]);
const SUBPATH_FILES = (rest) => [`src/${rest}.mjs`, `src/${rest}/index.mjs`, `scripts/${rest}.mjs`, `${rest}.mjs`, `${rest}/index.mjs`, `lib/${rest}.mjs`];

/** The package name and subpath of a bare specifier: `@scope/name/sub` → `{ name: "@scope/name", subpath: "./sub" }`. */
export function specifierParts(specifier) {
  const parts = specifier.split("/");
  const width = specifier.startsWith("@") ? 2 : 1;
  const name = parts.slice(0, width).join("/");
  const rest = parts.slice(width).join("/");
  return Object.freeze({ name, subpath: rest === "" ? "." : `./${rest}` });
}

const normalTarget = (target) => target.replace(/^\.\//u, "");
const patternFiles = (target, files) => {
  const parts = normalTarget(target).split("*");
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const pattern = new RegExp(`^${parts.map(escape).join("\u0000").replace("\u0000", "(.+)").replaceAll("\u0000", "(?:\\1)")}$`, "u");
  return [...files].some(file => pattern.test(file));
};

/**
 * The house imports a package's own code makes, one row per file and specifier, read with the house import
 * reader (`package-imports`): subpaths kept, test code marked, nested packages' files left to them.
 * @param {string} importer the package's name
 * @param {string} dir the package's repository-relative directory
 * @param {ReadonlyArray<{ path: string, text: string }>} files package-relative paths and their text
 * @param {{ nestedRoots?: ReadonlyArray<string> }} [options]
 * @returns {Array<{ importer: string, file: string, specifier: string, role: "runtime" | "test" }>}
 */
export function houseImportsOfFiles(importer, dir, files, { nestedRoots = [] } = {}) {
  const nested = nestedRoots.filter((root) => root && root !== ".");
  const rows = [];
  for (const { path, text } of files) {
    if (nested.some((root) => path === root || path.startsWith(`${root}/`))) continue;
    const role = codeRole(path);
    if (!role) continue;
    const file = dir === "." || dir === "" ? path : `${dir}/${path}`;
    for (const specifier of houseSpecifiersOfText(text)) rows.push({ importer, file, specifier, role });
  }
  return rows;
}

/** Whether a package name is in a house scope. */
export const isHousePackage = (name) => HOUSE_SCOPE.test(`${name}/`);

/**
 * Findings for one repository.
 * @param {{
 *   packages: ReadonlyArray<{ name: string, dir: string, manifest: object, files: ReadonlySet<string> }>,
 *   imports: ReadonlyArray<{ importer: string, file: string, specifier: string }>,
 *   resolved?: ReadonlyMap<string, { manifest: object, source: string }>,
 *   isHouse?: (name: string) => boolean,
 * }} input packages with their package-relative tracked files; the house imports their files make;
 *   providers resolved outside the repository (from an install), keyed by name
 * @returns {{ findings: object[], diagnostics: object[] }}
 */
export function packageInterfaceFindings({ packages, imports, resolved = new Map(), isHouse = isHousePackage }) {
  const findings = [], diagnostics = [];
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  for (const pkg of packages) {
    for (const { subpath, conditions, target } of exportTargets(pkg.manifest.exports)) {
      if (conditions.includes("types") && !/\.m?js$/u.test(target)) continue;
      const path = normalTarget(target);
      if (path.split("/").some((segment) => RETIRED.has(segment))) {
        findings.push({ class: INTO_RETIRED, package: pkg.name, dir: pkg.dir, subpath, conditions, target });
      }
      const present = target.includes("*") ? patternFiles(target, pkg.files) : pkg.files.has(path);
      if (present) continue;
      // A build output is never tracked: under a package that builds, it is read as unchecked, not missing.
      if (path.startsWith("dist/") && typeof pkg.manifest.scripts?.build === "string") diagnostics.push({ reason: "built-target-unchecked", package: pkg.name, subpath, target });
      else findings.push({ class: TARGET_MISSING, package: pkg.name, dir: pkg.dir, subpath, conditions, target });
    }
  }
  for (const { importer, file, specifier, role } of imports) {
    if (specifier.startsWith(".") || specifier.startsWith("node:") || specifier.startsWith("/")) continue;
    const { name, subpath } = specifierParts(specifier);
    if (!isHouse(name) || name === importer) continue;
    const local = byName.get(name), outside = resolved.get(name);
    const provider = local ?? outside;
    if (provider === undefined) { diagnostics.push({ reason: "provider-unresolved", importer, file, specifier, provider: name }); continue; }
    const reading = resolveExportSubpath(provider.manifest.exports, subpath);
    if (reading.status === "exported") {
      // A wildcard having some tracked member does not prove this imported
      // member exists. Outside providers need their own installed-file assay.
      if (local && !local.files.has(normalTarget(reading.target))) {
        const row = { package: name, dir: local.dir, subpath, conditions: [], target: reading.target, importer, file };
        if (normalTarget(reading.target).startsWith("dist/") && typeof local.manifest.scripts?.build === "string") {
          diagnostics.push({ reason: "built-target-unchecked", ...row });
        } else if (!findings.some(f => f.class === TARGET_MISSING && f.package === name && f.subpath === subpath && f.target === reading.target)) {
          findings.push({ class: TARGET_MISSING, ...row });
        }
      }
      continue;
    }
    findings.push({
      class: UNEXPORTED, importer, file, specifier, provider: name, subpath, ...(role === undefined ? {} : { role }),
      ...(reading.status === "excluded" ? { excludedBy: reading.key } : {}),
      providerSource: local ? { repository: true, dir: local.dir } : { repository: false, source: outside.source },
    });
  }
  const order = (row) => [row.class, row.package ?? row.provider, row.subpath, row.importer ?? "", row.file ?? ""].join("\0");
  findings.sort((a, b) => order(a).localeCompare(order(b)));
  return { findings, diagnostics };
}

/**
 * The exports `--write` may add: one per in-repository provider subpath that house code imports and
 * the provider does not export, where exactly one conventional file carries it. Ambiguous or absent
 * targets are returned as refusals. Nothing is ever removed.
 * @param {ReadonlyArray<object>} findings from `packageInterfaceFindings`
 * @param {ReadonlyArray<{ name: string, dir: string, manifest: object, files: ReadonlySet<string> }>} packages
 * @returns {{ additions: Array<{ package: string, dir: string, subpath: string, target: string }>, refusals: object[] }}
 */
export function exportAdditions(findings, packages) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const additions = new Map(), refusals = [], refused = new Set();
  for (const finding of findings) {
    if (finding.class !== UNEXPORTED || !finding.providerSource.repository || finding.excludedBy) continue;
    const key = `${finding.provider}\0${finding.subpath}`;
    if (additions.has(key) || refused.has(key) || finding.subpath === ".") continue;
    const pkg = byName.get(finding.provider);
    // An import-unavailable condition is not an undeclared interface. Adding an
    // unconditional exact key would overwrite it or shadow its pattern for require.
    if (exportKeyForSubpath(pkg.manifest.exports, finding.subpath) !== undefined) {
      refused.add(key);
      refusals.push({ provider: finding.provider, subpath: finding.subpath, reason: "existing-export-declaration" });
      continue;
    }
    const candidates = SUBPATH_FILES(finding.subpath.slice(2)).filter((file) => pkg.files.has(file));
    if (candidates.length !== 1) { refused.add(key); refusals.push({ provider: finding.provider, subpath: finding.subpath, reason: candidates.length ? "ambiguous-target" : "no-target-file", candidates }); continue; }
    additions.set(key, { package: pkg.name, dir: pkg.dir, subpath: finding.subpath, target: `./${candidates[0]}` });
  }
  return { additions: [...additions.values()], refusals };
}
