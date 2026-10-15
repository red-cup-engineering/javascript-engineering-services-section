#!/usr/bin/env node
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { canonical, parse } from "@red-cup-engineering/json-services-section";
import { normalizeJsnodePackageManifest } from "@red-cup-engineering/npm-package-manifest-normalization-service";
import { readJavascriptFileImports } from "@red-cup-engineering/javascript-file-import-services-section/read-javascript-file-imports";
import { SPECIFIER } from "@red-cup-engineering/javascript-node-services-section/audit-layer-imports";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { discoverHousePackages } from "@red-cup-engineering/javascript-node-services-section/discover-house-packages";

const TEST_FILE = /\.test\.(mjs|mts|js|ts|cjs)$/u;
const EXTERNAL_TEST_RUNNER = /^(?:npx\s+)?(?:vitest|jest|mocha|tap|ava|playwright)(?:\s|$)/u;
const VERIFICATION_SCRIPT_NAMES = new Set(["verify", "attest", "prove", "audit"]);
const CUSTODY_SCOPES = new Map([
  ["engineering-services-section", "@red-cup-engineering"],
  ["science-services-section", "@lenticule-science"],
  ["operations-services-section", "@coesite-operations"],
]);
const JAVASCRIPT_FILE = /\.(?:mjs|mts|js|ts|cjs|cts)$/u;
const LOCAL_DEPENDENCY = /^(?:file:|link:|workspace:)/u;
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const EXACT_HOUSE_DEPENDENCY_FIELDS = new Set(["dependencies", "devDependencies", "optionalDependencies"]);
const HOUSE_SCOPES = new Set(["@561-group", "@causeway-services", "@coesite-operations", "@emsenn", "@lenticule-science", "@red-cup-engineering"]);
const CANONICAL_REGISTRY = "https://registry.561.group/";
const LOCKFILE_NAMES = Object.freeze(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const TYPESCRIPT_SOURCE = /\.(?:ts|mts|cts)$/u;
const TYPESCRIPT_DECLARATION = /\.d\.(?:ts|mts|cts)$/u;
const HOUSE_DEPENDENCY_SCAN_DIRECTORIES = Object.freeze(["src", "scripts"]);
const EXPORT_STAR_STATEMENT = /export\s*\*\s*(?:as\s+[A-Za-z_$][\w$]*\s+)?from\s*["'][^"']+["']\s*;?/gu;
const EXPORT_NAMED_FROM_STATEMENT = /export\s*\{[^}]*\}\s*from\s*["'][^"']+["']\s*;?/gu;

function pathSegments(packageDirectory) {
  return packageDirectory.split(/[\\/]+/u).filter(Boolean);
}

function packageNameLeaf(packageName) {
  if (typeof packageName !== "string") return undefined;
  return packageName.slice(packageName.lastIndexOf("/") + 1);
}

function packageNameScope(packageName) {
  if (typeof packageName !== "string" || !packageName.startsWith("@")) return undefined;
  const separator = packageName.indexOf("/");
  return separator > 1 ? packageName.slice(0, separator) : undefined;
}

function isExactVersion(specifier) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(specifier);
}

function expectedPackageLeaf(packageDirectory) {
  const segments = pathSegments(packageDirectory);
  const directoryLeaf = segments.at(-1);
  const parentDirectory = segments.at(-2);
  if (parentDirectory === "sites" && typeof directoryLeaf === "string") {
    const siteMatch = /^(?<leaf>.+)\.561\.group$/u.exec(directoryLeaf);
    if (siteMatch !== null) return siteMatch.groups.leaf;
  }
  return directoryLeaf;
}

function isStandardTestScript(command) {
  const trimmed = command.trim();
  // Test scripts are one runner invocation, not shell-composed workflows.
  if (/[;&|`\n\r]/u.test(trimmed) || /\$\(/u.test(trimmed)) return false;
  if (EXTERNAL_TEST_RUNNER.test(trimmed)) return true;
  return /^node(?:\s+--import(?:=[^\s]+|\s+[^\s]+))*\s+--test(?:\s|$)/u.test(trimmed);
}

/** Returns the scope implied by the closest exact custody-section segment. */
export function expectedPackageScope(packageDirectory) {
  const segments = pathSegments(packageDirectory);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const expectedScope = CUSTODY_SCOPES.get(segments[index]);
    if (expectedScope !== undefined) return expectedScope;
  }
  return undefined;
}

/** True when a module's only statements (after comments and a shebang) are `export * from` or `export {...} from`: a barrel with nothing of its own. */
function isBarrelModule(text) {
  const withoutShebang = text.replace(/^#!.*(?:\r?\n|$)/u, "");
  const withoutBlockComments = withoutShebang.replace(/\/\*[\s\S]*?\*\//gu, "");
  const withoutLineComments = withoutBlockComments.replace(/(^|[^:"'])\/\/[^\n]*/gu, "$1");
  const withoutExports = withoutLineComments.replace(EXPORT_STAR_STATEMENT, "").replace(EXPORT_NAMED_FROM_STATEMENT, "");
  return withoutExports !== withoutLineComments && withoutExports.trim() === "";
}

/** "barrel": a module whose statements are all `export * from` or `export {...} from`, forwarding rather than defining. */
export function barrelDeviation(file, text) {
  return isBarrelModule(text) ? { code: "barrel", detail: file } : undefined;
}

/** Package-relative paths named in package.json `deliberateEntries: [{ path, reason }]`: a documented single-entry chokepoint or bundle, not re-export laziness. */
function deliberateEntryPaths(manifest) {
  const entries = Array.isArray(manifest?.deliberateEntries) ? manifest.deliberateEntries : [];
  return new Set(entries.filter((entry) => entry !== null && typeof entry === "object" && typeof entry.path === "string").map((entry) => entry.path));
}

/** "dist-present": a compiled dist/ directory checked in beside the package's own source. */
export function distPresentDeviation(packageDirectory) {
  return existsSync(join(packageDirectory, "dist")) ? { code: "dist-present", detail: "dist" } : undefined;
}

/** An unbound package-manager lock beside the manifest; a received source root may own its native lock. */
export function lockfilePresentDeviations(packageDirectory, artifact) {
  const source = artifact?.kind === "source-workspace" ? sourceWorkspaceReview(packageDirectory, artifact) : undefined;
  return LOCKFILE_NAMES.filter((name) => existsSync(join(packageDirectory, name)) && resolve(packageDirectory, name) !== source?.lockPath).map((name) => ({ code: "lockfile-present", detail: name }));
}

/** "typescript-source": a .ts/.mts/.cts file that is not a .d.* declaration. */
export function typescriptSourceDeviations(files) {
  return files.filter((file) => TYPESCRIPT_SOURCE.test(file) && !TYPESCRIPT_DECLARATION.test(file)).map((file) => ({ code: "typescript-source", detail: file }));
}

/** Every [exportKey, targetPath] leaf of a package.json `exports` field, condition objects unwrapped and subpath keys carried down. */
function* exportsLeaves(exportsField, key = ".") {
  if (exportsField === null || exportsField === undefined) return;
  if (typeof exportsField === "string") { yield [key, exportsField]; return; }
  if (Array.isArray(exportsField)) { for (const item of exportsField) yield* exportsLeaves(item, key); return; }
  if (typeof exportsField !== "object") return;
  const keys = Object.keys(exportsField);
  if (!keys.some((entry) => entry.startsWith("."))) { for (const condition of keys) yield* exportsLeaves(exportsField[condition], key); return; }
  for (const subKey of keys) yield* exportsLeaves(exportsField[subKey], subKey);
}

/** "export-target-missing": a package.json `exports` entry (exact keys and targets only; `*` patterns are unchecked) whose file does not exist on disk. */
export function exportTargetMissingDeviations(manifest, packageDirectory) {
  if (typeof manifest.exports !== "object" && typeof manifest.exports !== "string") return [];
  const deviations = [];
  const seen = new Set();
  for (const [key, target] of exportsLeaves(manifest.exports)) {
    if (typeof target !== "string" || target.includes("*") || key.includes("*")) continue;
    const dedupeKey = `${key}:${target}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    if (!existsSync(join(packageDirectory, target))) deviations.push({ code: "export-target-missing", detail: `${key}: ${target}` });
  }
  return deviations;
}

/** The house package names (scope/leaf, subpaths dropped) imported anywhere among `files`, optionally restricted to files under one of `under`'s top-level directories. */
function collectHouseImportNames(packageDirectory, files, { under } = {}) {
  const names = new Set();
  for (const file of files) {
    if (!JAVASCRIPT_FILE.test(file)) continue;
    if (under && !under.some((directory) => file === directory || file.startsWith(`${directory}/`))) continue;
    let text;
    try { text = readFileSync(join(packageDirectory, file), "utf8"); } catch { continue; }
    for (const match of text.matchAll(SPECIFIER)) {
      const specifier = match[1] ?? match[2] ?? match[3] ?? match[4];
      if (!HOUSE_SCOPES.has(packageNameScope(specifier))) continue;
      names.add(specifier.split("/").slice(0, 2).join("/"));
    }
  }
  return names;
}

/** "house-dependency-undeclared": a house-scoped package imported under src/scripts but absent from `dependencies`. */
export function houseDependencyUndeclaredDeviations(manifest, packageDirectory, files) {
  const declared = new Set(Object.keys(manifest.dependencies ?? {}));
  const imported = collectHouseImportNames(packageDirectory, files, { under: HOUSE_DEPENDENCY_SCAN_DIRECTORIES });
  const deviations = [];
  for (const name of imported) {
    if (name === manifest.name || declared.has(name)) continue;
    deviations.push({ code: "house-dependency-undeclared", detail: `${name} imported under src/scripts but absent from dependencies` });
  }
  return deviations;
}

/** "house-dependency-unused": a house-scoped `dependencies` entry never imported anywhere in the package. */
export function houseDependencyUnusedDeviations(manifest, packageDirectory, files) {
  const declared = Object.keys(manifest.dependencies ?? {}).filter((name) => HOUSE_SCOPES.has(packageNameScope(name)));
  if (declared.length === 0) return [];
  const importedAnywhere = collectHouseImportNames(packageDirectory, files);
  return declared
    .filter((name) => !importedAnywhere.has(name))
    .map((name) => ({ code: "house-dependency-unused", detail: `${name} declared in dependencies but never imported` }));
}

/**
 * Every "barrel" finding among a package's own JavaScript files (test files excluded), and every
 * "deliberate-entry" finding among files the manifest's `deliberateEntries` names. A declared path
 * is never reported "barrel", however barrel-shaped its text: it is a documented chokepoint or
 * browser-served bundle, not re-export laziness, so it is reported instead as informational
 * "deliberate-entry" — kept out of `deviations` entirely, so it never counts toward findings or the
 * "barrel" census.
 */
function barrelDeviations(packageDirectory, files, manifest) {
  const deviations = [];
  const informational = [];
  const deliberate = deliberateEntryPaths(manifest);
  for (const file of files) {
    if (!/\.(?:mjs|cjs|js)$/u.test(file) || TEST_FILE.test(file)) continue;
    if (deliberate.has(file)) { informational.push({ code: "deliberate-entry", detail: file }); continue; }
    let text;
    try { text = readFileSync(join(packageDirectory, file), "utf8"); } catch { continue; }
    const deviation = barrelDeviation(file, text);
    if (deviation) deviations.push(deviation);
  }
  return { deviations, informational };
}

/**
 * Reviews one jsnode package: normalizes its manifest and reports deviations from
 * standard form. Pure by default; explicit source-workspace context verifies its
 * actual package directory, full source inventory and native evidence carriers.
 *
 * @param {object} input
 * @param {object} input.manifest The parsed package.json value.
 * @param {string[]} [input.files] Relative file paths within the package.
 * @param {string} [input.packageDirectory] Package path used to assay custody and naming.
 * @returns {{ normalizedManifest: object, deviations: { code: string, detail: string }[] }}
 */
export function reviewJsnodePackage({ manifest, files = [], packageDirectory, artifact } = {}) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new TypeError("manifest must be a parsed package.json object");
  }
  if (!Array.isArray(files) || files.some((file) => typeof file !== "string")) {
    throw new TypeError("files must be an array of relative path strings");
  }
  if (packageDirectory !== undefined && typeof packageDirectory !== "string") {
    throw new TypeError("packageDirectory must be a string when provided");
  }
  const source = artifact?.kind === "source-workspace" ? sourceWorkspaceReview(packageDirectory, artifact, manifest) : undefined;
  const deviations = [...(source?.deviations ?? [])];
  if (artifact !== undefined && !["registry-package", "source-workspace"].includes(artifact?.kind)) deviations.push({ code: "artifact-context-inadmissible", detail: "artifact kind must be registry-package or source-workspace" });
  let normalizedManifest = manifest;
  try {
    normalizedManifest = normalizeJsnodePackageManifest({ manifest, identity: { name: manifest.name } });
    if (canonical(normalizedManifest) !== canonical(manifest)) {
      deviations.push({ code: "manifest-not-normalized", detail: "normalized manifest differs from the current manifest" });
    }
  } catch (error) {
    deviations.push({ code: "manifest-inadmissible", detail: error instanceof Error ? error.message : String(error) });
  }

  if (packageDirectory !== undefined) {
    const segments = pathSegments(packageDirectory);
    const directoryLeaf = segments.at(-1);
    const expectedLeaf = expectedPackageLeaf(packageDirectory);
    const manifestLeaf = packageNameLeaf(manifest.name);
    const expectedScope = expectedPackageScope(packageDirectory);
    const actualScope = packageNameScope(manifest.name);

    if (expectedScope !== undefined && actualScope !== expectedScope) {
      deviations.push({
        code: "custody-namespace-mismatch",
        detail: `${expectedScope} required by package custody; manifest name is ${String(manifest.name)}`,
      });
    }
    for (const malformedSegment of new Set(segments.filter((segment) => /-services$/u.test(segment)))) {
      deviations.push({
        code: "malformed-services-section-directory",
        detail: `${malformedSegment} must be named ${malformedSegment}-section`,
      });
    }
    if (manifestLeaf !== undefined && /-services$/u.test(manifestLeaf)) {
      deviations.push({
        code: "malformed-services-section-package-name",
        detail: `${manifestLeaf} must be named ${manifestLeaf}-section`,
      });
    }
    if (expectedLeaf !== undefined && manifestLeaf !== undefined && expectedLeaf !== manifestLeaf) {
      deviations.push({
        code: "manifest-name-directory-mismatch",
        detail: `manifest package leaf ${manifestLeaf} does not match directory identity ${expectedLeaf} (${directoryLeaf})`,
      });
    }
  }

  const scripts = manifest.scripts !== null && typeof manifest.scripts === "object" ? manifest.scripts : {};
  const testFiles = files.filter((file) => TEST_FILE.test(file));
  const testScript = scripts["test"];
  if (testFiles.length > 0 && typeof testScript !== "string") {
    deviations.push({ code: "missing-test-script", detail: `${testFiles.length} test file(s) but no test script` });
  } else if (testFiles.length > 0 && typeof testScript === "string" && !isStandardTestScript(testScript)) {
    deviations.push({ code: "nonstandard-test-script", detail: `test: ${testScript}` });
  }
  for (const [name, command] of Object.entries(scripts)) {
    if (typeof command !== "string") continue;
    if (VERIFICATION_SCRIPT_NAMES.has(name)) {
      deviations.push({ code: "verification-script-layer", detail: `${name}: ${command}` });
    } else if (name === "check" && /npm (run|test)/u.test(command)) {
      deviations.push({ code: "verification-script-layer", detail: `${name}: ${command}` });
    }
  }
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field];
    if (dependencies === null || typeof dependencies !== "object" || Array.isArray(dependencies)) continue;
    for (const [name, specifier] of Object.entries(dependencies)) {
      if (typeof specifier === "string" && LOCAL_DEPENDENCY.test(specifier) && !source?.admitted.has(field + "." + name)) {
        deviations.push({ code: "local-dependency-specifier", detail: `${field}.${name}: ${specifier}` });
      }
      if (EXACT_HOUSE_DEPENDENCY_FIELDS.has(field) && typeof specifier === "string" && HOUSE_SCOPES.has(packageNameScope(name)) && !isExactVersion(specifier) && !source?.admitted.has(field + "." + name)) {
        deviations.push({ code: "nonexact-house-dependency", detail: `${field}.${name}: ${specifier}` });
      }
    }
  }
  return { normalizedManifest, deviations, ...(source ? { evidenceBinding: source.evidenceBinding } : {}) };
}

// This is evidence binding, not a package resolver or an installer. The caller
// separately admits the recorded native command results. Default review is pure.
function sourceWorkspaceReview(packageDirectory, artifact, suppliedManifest) {
  const admitted = new Set();
  const evidenceBinding = { kind: "source-workspace", sourceVerified: false, nativeRecordBound: false, executionVerified: false, provenanceVerified: false };
  try {
    if (typeof packageDirectory !== "string") throw new TypeError("source review requires its actual selected package directory");
    const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
    const hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
    const oid = (value) => typeof value === "string" && /^[a-f0-9]{40}$/u.test(value);
    const path = (value, dot = false) => typeof value === "string" && (dot && value === "." || value && !isAbsolute(value) && !value.includes("\\") && !value.includes("\0") && value.split("/").every(part => part && part !== "." && part !== ".."));
    const root = artifact.workspace;
    if (typeof root !== "string" || !isAbsolute(root) || resolve(root) !== root || realpathSync(root) !== root || !lstatSync(root).isDirectory()) throw new TypeError("workspace must name its actual canonical directory");
    const absolute = (value) => {
      if (!path(value, true)) throw new TypeError("source paths must be canonical workspace-relative paths");
      return resolve(root, value);
    };
    const regular = (file) => {
      if (!lstatSync(file).isFile() || realpathSync(file) !== resolve(file)) throw new Error("source or evidence carrier is redirected or not a regular file: " + file);
      return readFileSync(file);
    };
    const carrier = (record, inside = false) => {
      if (!record || !hash(record.sha256) || typeof record.path !== "string") throw new TypeError("evidence carrier needs path and SHA-256");
      const file = inside ? absolute(record.path) : record.path;
      if (!isAbsolute(file) || resolve(file) !== file) throw new TypeError("evidence carrier must name its canonical file");
      const bytes = regular(file);
      if (digest(bytes) !== record.sha256) throw new Error("evidence carrier hash differs: " + file);
      return bytes;
    };
    const inventory = parse(carrier(artifact.inventory).toString("utf8"));
    if (!["development", "production"].includes(inventory.purpose) || !Array.isArray(inventory.sources) || !inventory.sources.length || !Array.isArray(inventory.packages) || !inventory.packages.length || !Array.isArray(inventory.files) || !inventory.files.length || !Array.isArray(inventory.generatedRoots)) throw new TypeError("source inventory needs purpose, sources, packages, files and explicit generated roots");
    const sources = new Map();
    for (const source of inventory.sources) {
      if (!source || !/^[\w.-]+\/[\w.-]+$/u.test(source.repository) || !oid(source.revision) || !path(source.workspacePath, true) || sources.has(source.repository)) throw new TypeError("source selection needs a unique repository, immutable commit and canonical workspace root");
      const directory = absolute(source.workspacePath);
      if (!lstatSync(directory).isDirectory() || realpathSync(directory) !== directory) throw new Error("selected source root is redirected or missing");
      for (const other of sources.values()) if (pathIsInside(other.directory, directory) || pathIsInside(directory, other.directory)) throw new Error("selected repository roots overlap");
      sources.set(source.repository, { ...source, directory });
    }
    const packages = new Map();
    const directories = new Map();
    for (const row of inventory.packages) {
      const source = sources.get(row?.repository);
      if (!source || row.revision !== source.revision || !path(row.path, true) || !path(row.workspacePath, true) || typeof row.name !== "string" || !isExactVersion(row.version) || packages.has(row.name) || directories.has(row.workspacePath)) throw new TypeError("selected package identity is absent, duplicate or inadmissible");
      if (resolve(source.directory, row.path) !== absolute(row.workspacePath)) throw new Error("package path differs from selected repository path");
      const manifest = parse(regular(join(absolute(row.workspacePath), "package.json")).toString("utf8"));
      if (manifest.name !== row.name || manifest.version !== row.version) throw new Error("selected package name/version differs from its genuine manifest");
      packages.set(row.name, { ...row, manifest }); directories.set(row.workspacePath, row.name);
    }
    const selectedPath = relative(root, resolve(packageDirectory)).split(sep).join("/") || ".";
    const selected = packages.get(directories.get(selectedPath));
    if (!selected || realpathSync(packageDirectory) !== resolve(packageDirectory)) throw new Error("review target is not the actual selected package directory");
    if (suppliedManifest !== undefined && canonical(suppliedManifest) !== canonical(selected.manifest)) throw new Error("review manifest differs from the selected source manifest");
    const generatedAllowed = new Set(["node_modules", ...inventory.packages.map(row => row.workspacePath === "." ? "node_modules" : row.workspacePath + "/node_modules"), ...inventory.sources.map(row => row.workspacePath === "." ? ".git" : row.workspacePath + "/.git")]);
    const generated = new Set();
    for (const item of inventory.generatedRoots) {
      if (!path(item) || !generatedAllowed.has(item) || generated.has(item)) throw new Error("generated exclusion is not an identified installation or Git metadata root");
      generated.add(item);
    }
    const files = new Map();
    for (const row of inventory.files) {
      const source = sources.get(row?.repository);
      if (!source || row.revision !== source.revision || !path(row.path) || !path(row.workspacePath) || !oid(row.gitBlob) || !hash(row.sha256) || !["100644", "100755"].includes(row.mode) || files.has(row.workspacePath)) throw new TypeError("source file inventory is incomplete, duplicate or inadmissible");
      const file = absolute(row.workspacePath);
      if (resolve(source.directory, row.path) !== file || [...generated].some(item => pathIsInside(absolute(item), file))) throw new Error("authored source overlaps a generated exclusion or differs from its repository path");
      const bytes = regular(file);
      const blob = createHash("sha1").update(Buffer.from("blob " + bytes.length + "\0")).update(bytes).digest("hex");
      const mode = lstatSync(file).mode & 0o111 ? "100755" : "100644";
      if (digest(bytes) !== row.sha256 || blob !== row.gitBlob || mode !== row.mode) throw new Error("selected authored source changed: " + row.workspacePath);
      files.set(row.workspacePath, row);
    }
    for (const row of packages.values()) {
      const name = row.workspacePath === "." ? "package.json" : row.workspacePath + "/package.json";
      if (!files.has(name)) throw new Error("selected manifest is absent from the source inventory: " + name);
    }
    if (artifact.configuration?.path !== "pnpm-workspace.yaml" || artifact.lockfile?.path !== "pnpm-lock.yaml") throw new TypeError("this source review supports the native PNPM workspace configuration and lock at the selected root");
    carrier(artifact.configuration, true); carrier(artifact.lockfile, true);
    const compositionFiles = new Set([artifact.configuration.path, artifact.lockfile.path]);
    const seen = new Set();
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name), name = relative(root, file).split(sep).join("/");
        if (generated.has(name)) continue;
        if (entry.isSymbolicLink()) throw new Error("selected source contains an unreceived symlink: " + name);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile()) {
          if (!files.has(name) && !compositionFiles.has(name)) throw new Error("selected source contains an unlisted authored file: " + name);
          seen.add(name);
        } else throw new Error("selected source contains a nonregular carrier: " + name);
      }
    };
    // Native resolution also observes the composition envelope, not just repo roots.
    // Reject added root manifests/configuration and unselected sibling source.
    walk(root);
    if ([...files.keys()].some(name => !seen.has(name))) throw new Error("selected source inventory is not closed over its materialized roots");
    for (const row of packages.values()) for (const field of DEPENDENCY_FIELDS) {
      if (field === "devDependencies" && inventory.purpose === "production") continue;
      for (const [name, specifier] of Object.entries(row.manifest[field] ?? {})) {
        const local = typeof specifier === "string" && LOCAL_DEPENDENCY.test(specifier);
        const provider = packages.get(name);
        const house = HOUSE_SCOPES.has(packageNameScope(name));
        if (!local && !house && !provider) continue; // external resolution is the native lock's responsibility
        if (!provider) throw new Error("selected closure omits a declared " + field + " supplier: " + name);
        if (specifier === "workspace:*") { /* the exact unique source provider is bound above */ }
        else if (typeof specifier === "string" && /^(?:file:|link:)/u.test(specifier)) {
          const target = resolve(absolute(row.workspacePath), specifier.slice(specifier.indexOf(":") + 1));
          if (!pathIsInside(root, target) || target !== absolute(provider.workspacePath) || realpathSync(target) !== target || !lstatSync(target).isDirectory()) throw new Error("local dependency is not the selected contained directory: " + name);
        } else if (!isExactVersion(specifier) || specifier !== provider.version) throw new Error("source dependency form/version is unsupported or unreceived: " + name + " " + specifier);
        if (row.name === selected.name) admitted.add(field + "." + name);
      }
    }
    evidenceBinding.sourceVerified = true; // Native-record association remains a distinct fact.
    const native = parse(carrier(artifact.nativeReceiving).toString("utf8"));
    const frozenPnpmInstall = (command) => {
      const args = command?.argv;
      if (command?.exitCode !== 0 || !Array.isArray(args) || args.some(value => typeof value !== "string" || !value) || args[0] !== "pnpm") return false;
      if (typeof command.cwd !== "string" || !isAbsolute(command.cwd) || resolve(command.cwd) !== command.cwd) return false;
      let at = 1;
      if (args[at] === "--dir") { if (args[at + 1] !== root) return false; at += 2; }
      else if (command.cwd !== root) return false;
      if (args[at++] !== "install") return false;
      let frozen = 0;
      for (; at < args.length; at++) {
        if (args[at] === "--frozen-lockfile") frozen++;
        else if (args[at] === "--store-dir" && args[at + 1] && !args[at + 1].startsWith("-")) at++;
        else return false; // No conflicting frozen flags, alternate commands or policy switches.
      }
      return frozen === 1;
    };
    if (!native.tools || !isExactVersion(native.tools.node) || !isExactVersion(native.tools.pnpm) || !native.provenance || ["kind", "recordedBy", "observedAt"].some(key => typeof native.provenance[key] !== "string" || !native.provenance[key])) throw new Error("native receiving record needs Node/PNPM versions and recorded provenance");
    if (native.sourceInventorySha256 !== artifact.inventory.sha256 || native.workspaceConfigurationSha256 !== artifact.configuration.sha256 || native.lockSha256 !== artifact.lockfile.sha256 || !Array.isArray(native.commands) || !native.commands.some(frozenPnpmInstall)) throw new Error("native receiving record does not bind this source/configuration/lock and frozen command result");
    return { admitted, lockPath: absolute(artifact.lockfile.path), deviations: [], evidenceBinding: { ...evidenceBinding, sourceVerified: true, nativeRecordBound: true, inventorySha256: artifact.inventory.sha256, lockSha256: artifact.lockfile.sha256, nativeReceivingSha256: artifact.nativeReceiving.sha256, provenance: native.provenance } };
  } catch (error) {
    return { admitted: new Set(), deviations: [{ code: "source-workspace-unreceived", detail: error instanceof Error ? error.message : String(error) }], evidenceBinding };
  }
}

function pathIsInside(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith("../") && !fromRoot.startsWith("..\\") && !isAbsolute(fromRoot));
}

function nestedPackageRoot(packageRoot, resolvedTarget) {
  let current = existsSync(resolvedTarget) && !extname(resolvedTarget) ? resolvedTarget : dirname(resolvedTarget);
  while (pathIsInside(packageRoot, current) && current !== packageRoot) {
    if (existsSync(join(current, "package.json"))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return undefined;
}

function hasBrowserRouteEvidence(packageRoot, sourceFile, files, specifier) {
  const sourceRelative = relative(packageRoot, sourceFile).split(sep).join("/");
  const assetName = basename(specifier);
  const quotedRoute = JSON.stringify(specifier);
  const assetRecord = new RegExp(`\\[\\s*["']${assetName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}["']\\s*,`, "u");
  return files.some((candidate) => {
    if (candidate === sourceRelative || !JAVASCRIPT_FILE.test(candidate)) return false;
    const text = readFileSync(join(packageRoot, candidate), "utf8");
    // A route is evidence only when another executable carrier maps the exact
    // route, or materializes its basename as a release asset. The importing
    // browser module itself cannot establish that evidence.
    return text.includes(quotedRoute) || assetRecord.test(text);
  });
}

/** Literal import-meta URLs passed as Node executable paths are package edges. */
function runtimeExecutableUrlSpecifiers(text) {
  const specifiers = [];
  const binding = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*fileURLToPath\s*\(\s*new\s+URL\s*\(\s*(["'])([^"']+)\2\s*,\s*import\.meta\.url\s*\)\s*\)/gu;
  for (const match of text.matchAll(binding)) {
    const invocation = new RegExp(`(?:execFileSync|spawnSync|spawn)\\s*\\(\\s*process\\.execPath\\s*,\\s*\\[[^\\]]*\\b${match[1]}\\b`, "u");
    if (invocation.test(text)) specifiers.push(match[3]);
  }
  return specifiers;
}

/** Reviews relative JavaScript import targets in source and tests for package-boundary escapes. */
export function reviewJavascriptPackageImportBoundary(packageDirectory, files = listPackageFiles(packageDirectory)) {
  const packageRoot = realpathSync(packageDirectory);
  const deviations = [];
  for (const file of files.filter((candidate) => JAVASCRIPT_FILE.test(candidate))) {
    const sourcePath = join(packageRoot, file);
    const text = readFileSync(sourcePath, "utf8");
    const reading = readJavascriptFileImports({ type: "TextFileRead", path: sourcePath, text });
    const specifiers = new Set([...reading.imports.map(({ specifier }) => specifier), ...runtimeExecutableUrlSpecifiers(text)]);
    for (const specifier of specifiers) {
      const isRelative = specifier.startsWith(".");
      const isFileUrl = specifier.startsWith("file:");
      if (!isRelative && !isFileUrl && !isAbsolute(specifier)) continue;
      if (isAbsolute(specifier) && !existsSync(specifier)
        && hasBrowserRouteEvidence(packageRoot, sourcePath, files, specifier)) continue;
      const resolvedTarget = isFileUrl ? fileURLToPath(specifier) : resolve(dirname(sourcePath), specifier);
      if (!pathIsInside(packageRoot, resolvedTarget)) {
        deviations.push({ code: "relative-import-outside-package", detail: `${file}:${specifier}` });
        continue;
      }
      if (existsSync(resolvedTarget) && !pathIsInside(packageRoot, realpathSync(resolvedTarget))) {
        deviations.push({ code: "relative-import-symlink-outside-package", detail: `${file}:${specifier}` });
        continue;
      }
      const nestedRoot = nestedPackageRoot(packageRoot, resolvedTarget);
      if (nestedRoot !== undefined) deviations.push({ code: "relative-import-into-nested-package", detail: `${file}:${specifier}` });
    }
  }
  return deviations;
}

function localDependencyDeviations(dependencies, prefix, code) {
  if (dependencies === null || typeof dependencies !== "object" || Array.isArray(dependencies)) return [];
  return Object.entries(dependencies)
    .filter(([, specifier]) => typeof specifier === "string" && LOCAL_DEPENDENCY.test(specifier))
    .map(([name, specifier]) => ({ code, detail: `${prefix}.${name}: ${specifier}` }));
}

function packageNameFromLockPath(lockPath) {
  const marker = "node_modules/";
  const segment = lockPath.slice(lockPath.lastIndexOf(marker) + marker.length);
  if (!segment.startsWith("@")) return segment.split("/")[0];
  return segment.split("/").slice(0, 2).join("/");
}

/** Reviews an npm lockfile's complete installed dependency closure when one exists. */
export function reviewPackageLockBoundary(packageDirectory) {
  const lockPath = join(packageDirectory, "package-lock.json");
  if (!existsSync(lockPath)) return [];
  const lock = parse(readFileSync(lockPath, "utf8"));
  const entries = lock?.packages;
  if (entries === null || typeof entries !== "object" || Array.isArray(entries)) {
    return [{ code: "lockfile-inadmissible", detail: "package-lock.json has no packages object" }];
  }
  const deviations = [];
  for (const [lockEntryPath, entry] of Object.entries(entries)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    for (const field of DEPENDENCY_FIELDS) {
      deviations.push(...localDependencyDeviations(entry[field], `packages.${lockEntryPath || "."}.${field}`, "lockfile-local-dependency-specifier"));
    }
    if (typeof entry.resolved !== "string") continue;
    if (/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//u.test(entry.resolved)) {
      deviations.push({ code: "lockfile-local-registry-url", detail: `${lockEntryPath}: ${entry.resolved}` });
    }
    const packageName = packageNameFromLockPath(lockEntryPath);
    const scope = packageName.startsWith("@") ? packageName.slice(0, packageName.indexOf("/")) : undefined;
    if (scope !== undefined && HOUSE_SCOPES.has(scope) && !entry.resolved.startsWith(CANONICAL_REGISTRY)) {
      deviations.push({ code: "lockfile-house-registry-url", detail: `${lockEntryPath}: ${entry.resolved}` });
    }
  }
  return deviations;
}

/** Lists a package's relative file paths, pruning nested packages and generated roots. */
export function listPackageFiles(packageDirectory) {
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", "legacy", "data", ".git"].includes(entry.name)) continue;
        try {
          readFileSync(join(path, "package.json"));
          continue; // nested package: a separate review target
        } catch {
          walk(path);
        }
      } else if (entry.isFile()) {
        files.push(relative(packageDirectory, path));
      }
    }
  };
  walk(packageDirectory);
  return files;
}

/** Reviews the package at a directory, reading its manifest and file list. `informational` carries findings, such as "deliberate-entry", that are reported but never counted as deviations. */
export function reviewJsnodePackageDirectory(packageDirectory, { artifact } = {}) {
  const manifest = parse(readFileSync(join(packageDirectory, "package.json"), "utf8"));
  const files = listPackageFiles(packageDirectory);
  const review = reviewJsnodePackage({ manifest, files, packageDirectory, artifact });
  const barrels = barrelDeviations(packageDirectory, files, manifest);
  const shapeDeviations = [
    distPresentDeviation(packageDirectory),
    ...lockfilePresentDeviations(packageDirectory, artifact),
    ...typescriptSourceDeviations(files),
    ...exportTargetMissingDeviations(manifest, packageDirectory),
    ...barrels.deviations,
    ...houseDependencyUndeclaredDeviations(manifest, packageDirectory, files),
    ...houseDependencyUnusedDeviations(manifest, packageDirectory, files),
  ].filter(Boolean);
  return {
    ...review,
    deviations: [...review.deviations, ...reviewJavascriptPackageImportBoundary(packageDirectory, files), ...reviewPackageLockBoundary(packageDirectory), ...shapeDeviations],
    informational: barrels.informational,
  };
}

/** Reviews every discovered package, rooted at `root`; a package whose directory has no package.json is skipped. */
export function reviewJsnodePackageTree({ root, map, artifact }) {
  const reports = [];
  const census = {};
  let findings = 0;
  for (const [name, directory] of Object.entries(map.packages)) {
    const packageDirectory = join(root, directory);
    if (!existsSync(join(packageDirectory, "package.json"))) continue;
    let review;
    try {
      review = reviewJsnodePackageDirectory(packageDirectory, { artifact });
    } catch (error) {
      review = { deviations: [{ code: "review-error", detail: error instanceof Error ? error.message : String(error) }], ...(artifact?.kind === "source-workspace" ? { evidenceBinding: { kind: "source-workspace", sourceVerified: false, nativeRecordBound: false, executionVerified: false, provenanceVerified: false } } : {}) };
    }
    for (const deviation of review.deviations) census[deviation.code] = (census[deviation.code] ?? 0) + 1;
    findings += review.deviations.length;
    reports.push({ package: name, packageDirectory: directory, deviations: review.deviations, informational: review.informational ?? [], ...(review.evidenceBinding ? { evidenceBinding: review.evidenceBinding } : {}) });
  }
  return { reports, findings, census, ...(artifact?.kind === "source-workspace" ? { evidenceBindings: reports.map(report => ({ package: report.package, ...report.evidenceBinding })) } : {}) };
}

// Every javascript-node audit in the sibling package (audit-hull-kernel.mjs, audit-phantom-
// imports.mjs, and the rest) takes a scoped run as `--package <dir> --root <root>`, `dir` repo-
// relative to `root`. This CLI now accepts that same shape (`root` defaults to process.cwd(), same
// as those audits) alongside `--all` and the pre-existing positional-directories form, which keeps
// working unchanged: a writer who reaches for the audits' own flags gets the audits' own answer.
if (import.meta.main) {
  const rawArgs = process.argv.slice(2);
  const artifactAt = rawArgs.indexOf("--artifact");
  if (artifactAt !== -1 && !rawArgs[artifactAt + 1]) throw new TypeError("--artifact requires an evidence-context JSON file");
  const artifact = artifactAt === -1 ? undefined : parse(readFileSync(rawArgs[artifactAt + 1], "utf8"));
  const args = artifactAt === -1 ? rawArgs : rawArgs.filter((_, index) => index !== artifactAt && index !== artifactAt + 1);

  if (args.includes("--all")) {
    const root = resolve(argument("--root", args) || process.cwd());
    const map = discoverHousePackages(root);
    const { reports, findings, census, evidenceBindings } = reviewJsnodePackageTree({ root, map, artifact });
    if (args.includes("--summary")) {
      process.stdout.write(`${canonical({ packages: reports.length, findings, census, ...(evidenceBindings ? { evidenceBindings } : {}) })}\n`);
    } else {
      for (const report of reports) process.stdout.write(`${canonical(report)}\n`);
    }
    if (findings > 0) process.exitCode = 2;
  } else {
    const packageFlag = argument("--package", args);
    const directories = packageFlag === undefined
      ? args
      : [resolve(argument("--root", args) || process.cwd(), packageFlag)];
    if (directories.length === 0) {
      process.stderr.write("usage: review-jsnode-package PACKAGE_DIR [PACKAGE_DIR ...] | --package <dir> [--root /home/emsenn/info] | --all [--root /home/emsenn/info] [--summary] [--artifact <context.json>]\n");
      process.exit(1);
    }
    let hasDeviations = false;
    for (const directory of directories) {
      const review = reviewJsnodePackageDirectory(directory, { artifact });
      process.stdout.write(`${canonical({ packageDirectory: directory, deviations: review.deviations, ...(review.evidenceBinding ? { evidenceBinding: review.evidenceBinding } : {}) })}\n`);
      hasDeviations ||= review.deviations.length > 0;
    }
    if (hasDeviations) process.exitCode = 2;
  }
}
