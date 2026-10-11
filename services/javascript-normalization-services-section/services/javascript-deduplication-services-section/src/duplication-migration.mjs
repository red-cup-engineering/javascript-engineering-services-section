/**
 * duplication-migration — turn one workspaceDuplication candidate into a
 * deterministic migration plan, and (on request) apply it as AST edits.
 *
 * The plan names a canonical owner (explicit `--owner`, or the candidate's
 * `owner`), locates that owner's exported implementation of
 * the duplicated behavior by resolving its manifest `exports`/`main` back to
 * source (the house `rootDir: src` / `outDir: dist`, `.mts` -> `.mjs`
 * convention), and describes every non-owner implementation as a site to
 * replace with an import. Applying rewrites each site's file (deleting the
 * declaration, including its leading JSDoc and any `export` keyword, and
 * inserting an import — plus a re-export when the site was itself exported)
 * and adds the owner as an exact-pinned runtime dependency where missing.
 *
 * This module does its own minimal AST navigation (locating the top-level
 * statement that carries a given executable behavior) rather than importing
 * it from `@red-cup-engineering/javascript-computer`: that package hands back
 * plain, cacheable `ExecutableBehavior` values (name/line/bytes/fingerprints)
 * by design, never live AST node handles, so relocating the declaration for
 * an edit is this consumer's own concern — the same shape as how
 * `documentation-edit.mts` there independently locates declarations rather
 * than reusing the executable-behavior extractor's internals.
 *
 * Two further modes live here. Within-package mode (triggered automatically
 * for a single-package candidate, or forced onto one package of a
 * multi-package candidate via `--within-package`/`owner`) picks a canonical
 * implementation by an explicit scanned file/binding pair when supplied,
 * otherwise by exports-map membership, then in-package reference count,
 * then size, and rewrites every other same-package site as either a relative
 * import (a different file) or a same-file alias declaration. Batch mode
 * (`planDuplicationMigrationBatch`/`applyDuplicationMigrationBatch`) plans
 * every candidate from one `workspaceDuplication` scan and, on apply, commits
 * or reverts edits one package at a time behind that package's own tests.
 */
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { readJsnodeAst } from "@red-cup-engineering/javascript-node-services-section/syntax";
import { applyExactSourceEdits } from "@red-cup-engineering/computer-code-engineering-services-section/exact-source-edits";
import { lineColumnOf, walkJavaScript } from "@red-cup-engineering/javascript-node-services-section/javascript-parser";

/** The declaration a top-level statement carries (an export statement's own declaration). */
function declarationOf(statement) {
  return (statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration") && statement.declaration ? statement.declaration : statement;
}

function isExportStatement(statement) {
  return statement.type === "ExportNamedDeclaration" || statement.type === "ExportDefaultDeclaration";
}

const moduleName = (node) => (node.type === "Identifier" ? node.name : node.value);
import { extractExecutableBehaviors, discoverJavaScriptSourceFiles, callableSubstitutionForm } from "@red-cup-engineering/javascript-computer";
import { eachWorkspacePackageDir } from "@red-cup-engineering/javascript-computer";
import { workspaceDuplication } from "./duplication.mjs";

/** Which candidate to migrate: exactly one of a fingerprint or a 1-based rank
 *  among cross-package, consumer-backed candidates. */

  

  

/** Where the owner exposes the canonical implementation: a source file
 *  (relative to the owner's package directory), the name it is exported
 *  under, and the `exports` map key it is reachable through. `resolvedVia`
 *  is present when `file` was not the export target itself but a source
 *  file inferred from it — the export target named a build output (under
 *  the package's `outDir`) that is not built in this checkout, so `file` is
 *  the corresponding file under `rootDir`, found by trying source
 *  extensions (and `index.*` for a directory target). */

/** How to make an owner's own unexported implementation reachable through its
 *  manifest `"."` entry: give the declaration's own file an `export`
 *  keyword, when that file already is the entry; otherwise append a named
 *  re-export to the entry file. */

/** One planned edit that promotes an owner's already-existing implementation
 *  to a manifest-reachable export, so downstream sites can import it once the
 *  owner republishes.
 * @property file The file (relative to the owner's package dir) actually
 *  edited to create the new manifest-reachable export — the entry file for
 *  `add-named-reexport`; the declaration's own file (which IS the entry
 *  file) for `add-export-keyword`.
 * @property name The exact existing binding/export name — never a rename.
 * @property declarationFile Present only for `add-named-reexport`: the file
 *  (relative to the owner dir) where the implementation is actually
 *  declared, when different from `file`.
 * @property relativeSpecifier Present only for `add-named-reexport`: the
 *  specifier used in `export { name } from "<relativeSpecifier>";`.
 * @property needsDeclarationExport Present only for `add-named-reexport`:
 *  true when the declaration itself does not yet carry an `export`
 *  keyword/statement and must gain one as part of applying this promotion.
 * @property subpath The manifest exports subpath this makes the name
 *  reachable through — always `"."` for this feature.
 */

/** One duplicate implementation to remove, replaced either by an import
 *  (from the canonical's owning package, cross-package; or a relative
 *  specifier to the canonical's file, within-package and cross-file) or —
 *  only when the site lives in the very same file as the canonical — a
 *  same-file alias binding. `deleteOnly` (alias sites only) marks the
 *  degenerate case where the duplicate's local name is already the
 *  canonical's own name and nothing else in the package references it, so
 *  no alias line is needed at all. */

  

// ---------- selecting the candidate ----------

function selectCandidate(
  root,
  selector,
  duplicationOptions,
) {
  if ((selector.fingerprint === undefined) === (selector.rank === undefined)) {
    throw new Error("duplication-migration needs exactly one of a fingerprint or a rank");
  }
  // Migration planning reads every implementation site (see below) to place
  // sites and detect owner exports; force full detail regardless of what the
  // caller's own duplicationOptions requested for report-shaping purposes.
  const report = workspaceDuplication(root, { ...duplicationOptions, detail: true });
  // --fingerprint names a specific, already-known candidate directly, from the
  // full report — including one confined to a single package (e.g. after an
  // owner override), which the cross-package/consumer-backed filter below
  // would otherwise hide. --rank browses that filtered, ranked subset instead.
  if (selector.fingerprint !== undefined) {
    const found = report.candidates.find((c) => c.semanticFingerprint === selector.fingerprint);
    if (found === undefined) {
      throw new Error(`no duplication candidate with fingerprint ${selector.fingerprint}`);
    }
    return found;
  }
  const eligible = report.candidates.filter((c) => c.packages.length > 1 && c.consumers.length > 0);
  const rank = selector.rank;
  if (!Number.isSafeInteger(rank) || rank < 1) throw new Error(`--rank must be a positive integer; got: ${String(rank)}`);
  const found = eligible[rank - 1];
  if (found === undefined) {
    throw new Error(`only ${eligible.length} cross-package consumer-backed duplication candidate(s); no rank ${rank}`);
  }
  return found;
}

// ---------- resolving the owner's exported implementation ----------

const SOURCE_EXTENSIONS = [".mts", ".ts", ".mjs", ".js"];
const KNOWN_JS_EXTENSIONS = new Set([".mjs", ".cjs", ".js", ".mts", ".cts", ".ts", ".tsx"]);

/** A candidate source file to try reading for an `exports`/`main` target,
 *  and whether reaching it required inferring a build's source from its
 *  output (as opposed to the target already naming a source file). */

function normalizeConfigPath(value) {
  const trimmed = value.replace(/^\.\//u, "").replace(/\/+$/u, "");
  return trimmed === "" ? "." : trimmed;
}

/** The `rootDir`/`outDir` a package's build actually used, read from its own
 *  `tsconfig.build.json` (or `tsconfig.json`) — never assumed, since house
 *  packages vary (`rootDir: "src"` mirrors only `src/` into `dist/`;
 *  `rootDir: "."` mirrors the whole package, so e.g. `dist/src/index.mjs`
 *  maps back to `src/index.mjs`, not `src/src/index.mjs`). Falls back to the
 *  common house default when no tsconfig is readable. */
function readBuildLayout(ownerDir) {
  for (const name of ["tsconfig.build.json", "tsconfig.json"]) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path.join(ownerDir, name), "utf8"));
    } catch {
      continue;
    }
    const options = parsed["compilerOptions"];
    if (options === null || typeof options !== "object") continue;
    const rootDirValue = (options)["rootDir"];
    const outDirValue = (options)["outDir"];
    if (typeof rootDirValue !== "string" && typeof outDirValue !== "string") continue;
    return {
      rootDir: normalizeConfigPath(typeof rootDirValue === "string" ? rootDirValue : "src"),
      outDir: normalizeConfigPath(typeof outDirValue === "string" ? outDirValue : "dist"),
    };
  }
  return { rootDir: "src", outDir: "dist" };
}

/** Every source file a build-output path could have come from: the same
 *  relative path with each source extension tried in turn, or (when the path
 *  carries no recognized extension, i.e. it names a directory) each
 *  extension's `index` file beneath it. */
function extensionCandidates(joined) {
  const ext = path.extname(joined);
  if (KNOWN_JS_EXTENSIONS.has(ext)) {
    const base = joined.slice(0, -ext.length);
    return SOURCE_EXTENSIONS.map((sourceExt) => `${base}${sourceExt}`);
  }
  return SOURCE_EXTENSIONS.map((sourceExt) => path.join(joined, `index${sourceExt}`));
}

/** Every source file an `exports`/`main` target could resolve to: the target
 *  itself when it already names a TypeScript source file, or (a plain-JS
 *  package with no build step, common across the house's `.mjs`-only
 *  services) when a `.mjs`/`.js`/`.cjs` target already exists on disk at
 *  that exact path; otherwise, when it names a build output beneath the
 *  owner's own `outDir`, every source extension of the same path relocated
 *  under `rootDir` (the exact inverse of how the build emitted it) — tried
 *  in order, since the build may not have run in this checkout. A
 *  declaration-only `.d.ts`/`.d.mts`/`.d.cts` target, or one outside the
 *  recognized `outDir` that also does not exist as authored source,
 *  resolves to nothing. */
function sourceCandidatesForExportTarget(ownerDir, target) {
  const cleaned = target.startsWith("./") ? target.slice(2) : target;
  if (/\.d\.(m|c)?ts$/u.test(cleaned)) return [];
  if (/\.(m|c)?ts$|\.tsx$/u.test(cleaned)) return [{ file: cleaned }];
  const candidates = [];
  if (/\.(m|c)?js$/u.test(cleaned) && existsSync(path.join(ownerDir, cleaned))) {
    candidates.push({ file: cleaned });
  }
  const { rootDir, outDir } = readBuildLayout(ownerDir);
  const prefix = `${outDir}/`;
  if (cleaned.startsWith(prefix)) {
    const rest = cleaned.slice(prefix.length);
    const joined = rootDir === "." ? rest : path.join(rootDir, rest);
    candidates.push(...extensionCandidates(joined).map((file) => ({ file, resolvedVia: "source-of-dist" })));
  }
  return candidates;
}

/** Flatten an `exports` conditions object (or a plain string target) to one
 *  representative target, preferring the `import`/`default`/`require`
 *  conditions before any other (e.g. `types`). */
function primaryExportTarget(value) {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object") return undefined;
  const record = value;
  for (const key of ["import", "default", "require"]) {
    if (key in record) {
      const resolved = primaryExportTarget(record[key]);
      if (resolved !== undefined) return resolved;
    }
  }
  for (const nested of Object.values(record)) {
    const resolved = primaryExportTarget(nested);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

/** Every `exports` subpath (plus `main` under `.` when absent from
 *  `exports`), each flattened to one export target string, in manifest order. */
function ownerExportCandidates(manifest) {
  const out = [];
  const seenSubpaths = new Set();
  const exportsField = manifest["exports"];
  if (exportsField !== null && typeof exportsField === "object") {
    for (const [key, value] of Object.entries(exportsField)) {
      if (key === "./package.json") continue;
      const target = primaryExportTarget(value);
      if (target !== undefined) {
        out.push({ subpath: key, target });
        seenSubpaths.add(key);
      }
    }
  }
  const main = manifest["main"];
  if (typeof main === "string" && !seenSubpaths.has(".")) out.push({ subpath: ".", target: main });
  return out;
}

/** The last leading `/** … *​/` block immediately before a node, if any. */
function leadingJsDocRange(program, statement) {
  const before = program.comments.filter((comment) => comment.end <= statement.start);
  const last = before[before.length - 1];
  if (!last || last.type !== "Block" || !last.value.startsWith("*")) return undefined;
  const previousEnd = program.body.filter((other) => other.end <= statement.start).reduce((max, other) => Math.max(max, other.end), 0);
  if (last.start < previousEnd) return undefined;
  return { pos: last.start, end: last.end };
}

/** A located top-level declaration: the statement to delete whole, and the
 *  exact span (JSDoc-inclusive) an edit must remove. */

/** Find the top-level statement carrying an executable behavior reported at
 *  `line`/`name`: a function declaration, or a single-declarator top-level
 *  `const`/`let`/`var` initialized to an arrow/function expression. Class
 *  members and other nested forms are out of scope for this migration (a
 *  behavior reported at such a site cannot be relocated here). */
function locateTopLevelDeclaration(
  sourceFile,
  sourceText,
  line,
  name,
) {
  for (const stmt of sourceFile.body) {
    const declaration = declarationOf(stmt);
    if (declaration.type === "FunctionDeclaration" && declaration.id?.name === name) {
      if (lineColumnOf(sourceText, declaration.start).line === line || lineColumnOf(sourceText, stmt.start).line === line) {
        return spanOf(stmt, sourceFile, sourceText);
      }
    } else if (declaration.type === "VariableDeclaration") {
      for (const decl of declaration.declarations) {
        if (decl.id.type !== "Identifier" || decl.id.name !== name) continue;
        const init = decl.init;
        if (!init || !(init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) continue;
        if (lineColumnOf(sourceText, init.start).line === line) {
          return spanOf(stmt, sourceFile, sourceText);
        }
      }
    }
  }
  return undefined;
}

function spanOf(statement, sourceFile) {
  const jsDoc = leadingJsDocRange(sourceFile, statement);
  return { statement, start: jsDoc ? jsDoc.pos : statement.start, end: statement.end };
}

/** The public name a top-level statement's declared `name` is exported
 *  under: the name itself when the statement carries an `export` modifier,
 *  the aliased name from a same-file `export { name as alias }`, or
 *  `undefined` when the declaration is not exported. */
function exportedPublicName(statement, name, sourceFile) {
  if (isExportStatement(statement)) return statement.type === "ExportDefaultDeclaration" ? "default" : name;
  for (const other of sourceFile.body) {
    if (other.type !== "ExportNamedDeclaration" || other.source || other.declaration) continue;
    for (const element of other.specifiers) {
      if (moduleName(element.local) === name) return moduleName(element.exported);
    }
  }
  return undefined;
}

/** Every identifier a top-level import or declaration binds in a file,
 *  excluding the given statements (the declaration(s) a site or its
 *  canonical would otherwise appear to collide with) — the surface a new
 *  import or alias's chosen name must not collide with. */
function topLevelBoundNames(sourceFile, exclude) {
  const excluded = new Set(exclude);
  const names = new Set();
  for (const stmt of sourceFile.body) {
    if (excluded.has(stmt)) continue;
    const declaration = declarationOf(stmt);
    if (stmt.type === "ImportDeclaration") {
      for (const specifier of stmt.specifiers) names.add(specifier.local.name);
    } else if ((declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") && declaration.id) {
      names.add(declaration.id.name);
    } else if (declaration.type === "VariableDeclaration") {
      for (const decl of declaration.declarations) if (decl.id.type === "Identifier") names.add(decl.id.name);
    }
  }
  return names;
}

function resolveOwnerExport(owner, fingerprint) {
  const candidates = ownerExportCandidates(owner.manifest);
  if (candidates.length === 0) {
    return { kind: "unreadable", detail: `${owner.name} has no exports/main entry resolvable to a source file` };
  }
  let anyReadable = false;
  for (const { subpath, target } of candidates) {
    for (const sourceCandidate of sourceCandidatesForExportTarget(owner.dir, target)) {
      const absolute = path.join(owner.dir, sourceCandidate.file);
      let source;
      try {
        source = readFileSync(absolute, "utf8");
      } catch {
        continue;
      }
      anyReadable = true;
      const behaviors = extractExecutableBehaviors(source, absolute);
      const matching = behaviors.filter((behavior) => behavior.semanticFingerprint === fingerprint);
      if (matching.length === 0) continue;
      const sourceFile = readJsnodeAst(source, absolute);
      for (const behavior of matching) {
        const located = locateTopLevelDeclaration(sourceFile, source, behavior.line, behavior.name);
        if (located === undefined) continue;
        const publicName = exportedPublicName(located.statement, behavior.name, sourceFile);
        if (publicName === undefined) continue;
        return {
          kind: "found",
          reference: {
            file: sourceCandidate.file,
            name: publicName,
            subpath,
            ...(sourceCandidate.resolvedVia !== undefined ? { resolvedVia: sourceCandidate.resolvedVia } : {}),
          },
        };
      }
    }
  }
  if (!anyReadable) {
    return { kind: "unreadable", detail: `${owner.name}'s exports/main resolve to no readable source file` };
  }
  return { kind: "not-exporting", detail: `${owner.name} has no exported implementation matching fingerprint ${fingerprint}` };
}

// ---------- within-package canonicalization ----------

/** Whether `impl`'s declaration is the one reached through one of `pkg`'s own
 *  `exports`/`main` targets — rule 1 of within-package canonical selection.
 *  Distinct from mere file-level `export`: a helper can be `export`ed for
 *  other files in the same package to import without being a manifest entry
 *  point. */
function ownerExportInfo(pkg, impl) {
  for (const { subpath, target } of ownerExportCandidates(pkg.manifest)) {
    for (const sourceCandidate of sourceCandidatesForExportTarget(pkg.dir, target)) {
      if (path.normalize(sourceCandidate.file) !== path.normalize(impl.file)) continue;
      const absolute = path.join(pkg.dir, impl.file);
      let source;
      try { source = readFileSync(absolute, "utf8"); } catch { continue; }
      const sourceFile = readJsnodeAst(source, absolute);
      const located = locateTopLevelDeclaration(sourceFile, source, impl.line, impl.name);
      if (located === undefined) continue;
      if (exportedPublicName(located.statement, impl.name, sourceFile) !== undefined) return { exported: true, subpath };
    }
  }
  return { exported: false };
}

/** Whether an identifier occurrence is a binding position (the name of the
 *  declaration/parameter/property it names) rather than a use — the
 *  reference count only wants uses. */
function isDeclarationBindingIdentifier(node, parent) {
  if (!parent) return false;
  if ((parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" || parent.type === "ClassDeclaration" || parent.type === "ClassExpression") && parent.id === node) return true;
  if (parent.type === "VariableDeclarator" && parent.id === node) return true;
  if ((parent.type === "FunctionDeclaration" || parent.type === "FunctionExpression" || parent.type === "ArrowFunctionExpression") && parent.params.includes(node)) return true;
  if (parent.type === "MemberExpression" && parent.property === node && !parent.computed) return true;
  if ((parent.type === "Property" || parent.type === "MethodDefinition" || parent.type === "PropertyDefinition") && parent.key === node && !parent.computed) return true;
  return false;
}

const NON_SOURCE_MIGRATION_PATTERN = /(^|\/)(?:test|tests|fixtures?)(\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$/iu;

/** Count identifier uses of `name` across `pkg`'s authored (non-test) source
 *  — rule 2 of within-package canonical selection, and the same signal used
 *  to decide whether an alias-mode duplicate is safe to delete outright. */
function countIdentifierReferences(pkg, name) {
  let count = 0;
  for (const file of discoverJavaScriptSourceFiles(pkg.dir)) {
    const relative = path.relative(pkg.dir, file);
    if (!NON_SOURCE_MIGRATION_PATTERN.test(relative)) {
      let source;
      try { source = readFileSync(file, "utf8"); } catch { continue; }
      const sourceFile = readJsnodeAst(source, file);
      walkJavaScript(sourceFile, (node, parent) => {
        if (node.type === "Identifier" && node.name === name && !isDeclarationBindingIdentifier(node, parent)) count++;
      });
    }
  }
  return count;
}

/** Pick the canonical implementation among a package's own duplicates:
 *  exports-map membership first, then in-package reference count, then size
 *  — refusing `canonical-unresolvable` only when all three tie for the top
 *  spot. */
function resolveCanonicalWithinPackage(
  pkg,
  implementations,
  requestedCanonical,
) {
  if (requestedCanonical !== undefined) {
    const canonical = requestedCanonical && implementations.find((implementation) =>
      implementation.file === requestedCanonical.file && implementation.name === requestedCanonical.name);
    if (canonical) return { canonical };
    return { refusal: { reason: "canonical-not-in-candidate",
      detail: `${pkg.name} has no selected-family implementation matching the requested file and binding` } };
  }
  const first = implementations[0];
  if (first === undefined) throw new Error("resolveCanonicalWithinPackage requires at least one implementation");
  if (implementations.length === 1) return { canonical: first };
  const scores = implementations.map((impl) => ({
    impl,
    exported: ownerExportInfo(pkg, impl).exported ? 1 : 0,
    references: countIdentifierReferences(pkg, impl.name),
    bytes: impl.bytes,
  }));
  scores.sort((a, b) => b.exported - a.exported
    || b.references - a.references
    || b.bytes - a.bytes
    || a.impl.file.localeCompare(b.impl.file)
    || a.impl.line - b.impl.line);
  const top = scores[0];
  const next = scores[1];
  if (next !== undefined && top.exported === next.exported && top.references === next.references && top.bytes === next.bytes) {
    return {
      refusal: {
        reason: "canonical-unresolvable",
        detail: `${pkg.name} has multiple implementations of this family tied on exported/reference-count/size `
          + `(exported=${top.exported}, references=${top.references}, bytes=${top.bytes}); cannot pick a canonical`,
      },
    };
  }
  return { canonical: top.impl };
}

/** The relative-import file extension this package's own inter-file imports
 *  use (e.g. `.mjs` for `.mts` source compiled NodeNext-style), sniffed from
 *  an existing relative import; falls back to the house source→output
 *  mapping when the package has none. */
function sniffRelativeImportExtension(pkg) {
  for (const file of discoverJavaScriptSourceFiles(pkg.dir)) {
    let source;
    try { source = readFileSync(file, "utf8"); } catch { continue; }
    const sourceFile = readJsnodeAst(source, file);
    for (const stmt of sourceFile.body) {
      if (stmt.type !== "ImportDeclaration") continue;
      const specifier = stmt.source.value;
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) continue;
      const ext = path.extname(specifier);
      if (ext !== "") return ext;
    }
  }
  const bySourceExtension = { ".mjs": ".mjs", ".js": ".js", ".cjs": ".cjs" };
  for (const file of discoverJavaScriptSourceFiles(pkg.dir)) {
    const mapped = bySourceExtension[path.extname(file)];
    if (mapped !== undefined) return mapped;
  }
  return ".mjs";
}

/** A relative import specifier from one package-internal file to another,
 *  with the given file extension and a leading `./`/`../`. */
function relativeImportSpecifier(fromAbsoluteFile, toAbsoluteFile, extension) {
  const fromDir = path.dirname(fromAbsoluteFile);
  const toBase = toAbsoluteFile.slice(0, toAbsoluteFile.length - path.extname(toAbsoluteFile).length);
  const relative = path.relative(fromDir, toBase).split(path.sep).join("/");
  return `${relative.startsWith(".") ? relative : `./${relative}`}${extension}`;
}

/** Find a top-level declaration by its bound name alone (no line needed):
 *  valid at module scope, a name binds at most one top-level declaration, so
 *  this is safe to use as a post-edit anchor once line numbers have shifted. */
function locateTopLevelDeclarationByName(sourceFile, name) {
  for (const stmt of sourceFile.body) {
    const declaration = declarationOf(stmt);
    if (declaration.type === "FunctionDeclaration" && declaration.id?.name === name) return stmt;
    if (declaration.type === "VariableDeclaration") {
      for (const decl of declaration.declarations) {
        if (decl.id.type === "Identifier" && decl.id.name === name) return stmt;
      }
    }
  }
  return undefined;
}

/** Plan one non-canonical within-package implementation: an alias when it
 *  shares the canonical's file, otherwise a relative import. A local-name
 *  collision or a failed strict substitutability check (see
 *  `callableSubstitutionForm`) refuses this one site rather than aliasing
 *  behavior that may not actually match the canonical's. */
function resolveWithinPackageSite(
  pkg,
  impl,
  canonical,
  canonicalSource,
  canonicalAbsolute,
  relativeImportExtension,
) {
  const absolute = path.join(pkg.dir, impl.file);
  const source = readFileSync(absolute, "utf8");
  const sourceFile = readJsnodeAst(source, absolute);
  const located = locateTopLevelDeclaration(sourceFile, source, impl.line, impl.name);
  if (located === undefined) {
    throw new Error(`cannot locate top-level declaration "${impl.name}" at ${absolute}:${impl.line}`);
  }
  const wasExported = exportedPublicName(located.statement, impl.name, sourceFile) !== undefined;
  const sameFile = impl.file === canonical.file;
  // A same-file canonical must be re-located in THIS parse: a statement found
  // by an earlier, separate parse of the same text is a different object and
  // would never match by reference in the exclusion set below.
  const exclude = [located.statement];
  if (sameFile) {
    const canonicalHere = locateTopLevelDeclaration(sourceFile, source, canonical.line, canonical.name);
    if (canonicalHere !== undefined) exclude.push(canonicalHere.statement);
  }
  if (topLevelBoundNames(sourceFile, exclude).has(canonical.name)) {
    return {
      refusal: { reason: "local-name-collision", detail: `${pkg.name}:${impl.file} already binds "${canonical.name}" from elsewhere` },
    };
  }

  // The duplication scan's own discovery fingerprint deliberately erases
  // local names AND literal values to stay recall-oriented; that lets two
  // implementations that only LOOK identical after erasure (a different
  // captured contract/constant, or a differing literal a caller depends on,
  // like a `kind: "article"` vs `kind: "page"` discriminant) reach here.
  // callableSubstitutionForm is the strict, symbol-resolved check that
  // retains exactly what discovery erased; refuse rather than alias unless
  // it actually agrees the two bodies compute the same thing.
  const siteForm = callableSubstitutionForm(source, absolute, impl.name);
  const canonicalForm = callableSubstitutionForm(canonicalSource, canonicalAbsolute, canonical.name);
  if (siteForm === null || canonicalForm === null || siteForm !== canonicalForm) {
    return {
      refusal: {
        reason: "not-verified-substitutable",
        detail: `${pkg.name}:${impl.file}:${impl.name} did not verify as substitutable for the canonical `
          + `${canonical.file}:${canonical.name} (differing constants, captured bindings, literal values, or `
          + "unsupported syntax); refused rather than risk aliasing distinct behavior",
      },
    };
  }

  if (sameFile) {
    const referencedElsewhere = countIdentifierReferences(pkg, impl.name) > 0;
    const deleteOnly = impl.name === canonical.name && !referencedElsewhere;
    return {
      site: {
        package: pkg.name, packageDir: pkg.dir, file: impl.file, line: impl.line, name: impl.name,
        action: "replace-declaration-with-alias",
        importedName: canonical.name, localName: impl.name, wasExported, deleteOnly,
      },
    };
  }
  const importSpecifier = relativeImportSpecifier(absolute, canonicalAbsolute, relativeImportExtension);
  return {
    site: {
      package: pkg.name, packageDir: pkg.dir, file: impl.file, line: impl.line, name: impl.name,
      action: "replace-declaration-with-import",
      importSpecifier, importedName: canonical.name, localName: impl.name, wasExported,
    },
  };
}

/** Build a within-package migration plan: canonicalize onto one of `pkg`'s
 *  own duplicate implementations and replace every other one. Called both
 *  for a candidate naturally confined to one package and for a
 *  multi-package candidate restricted to `pkg` via `--within-package`. */
function buildWithinPackagePlan(
  pkg,
  candidateSummary,
  implementations,
  requestedCanonical,
) {
  if (implementations.length < 2 && requestedCanonical === undefined) return freezePlan(candidateSummary, pkg.name, null, [], [], []);

  const resolution = resolveCanonicalWithinPackage(pkg, implementations, requestedCanonical);
  if ("refusal" in resolution) return freezePlan(candidateSummary, pkg.name, null, [], [], [resolution.refusal]);
  if (implementations.length < 2) return freezePlan(candidateSummary, pkg.name, null, [], [], []);
  const canonical = resolution.canonical;

  const canonicalAbsolute = path.join(pkg.dir, canonical.file);
  let canonicalSource;
  try {
    canonicalSource = readFileSync(canonicalAbsolute, "utf8");
  } catch {
    return freezePlan(candidateSummary, pkg.name, null, [], [], [
      { reason: "owner-file-unreadable", detail: `cannot read canonical file ${canonicalAbsolute}` },
    ]);
  }
  const canonicalSourceFile = readJsnodeAst(canonicalSource, canonicalAbsolute);
  const canonicalLocated = locateTopLevelDeclaration(canonicalSourceFile, canonicalSource, canonical.line, canonical.name);
  if (canonicalLocated === undefined) {
    return freezePlan(candidateSummary, pkg.name, null, [], [], [
      { reason: "owner-file-unreadable", detail: `cannot locate canonical declaration "${canonical.name}" at ${canonicalAbsolute}:${canonical.line}` },
    ]);
  }
  const canonicalFileLevelExportedName = exportedPublicName(canonicalLocated.statement, canonical.name, canonicalSourceFile);
  const manifestSubpath = ownerExportInfo(pkg, canonical).subpath;

  const others = implementations.filter((impl) => impl !== canonical);
  const hasCrossFileSite = others.some((impl) => impl.file !== canonical.file);
  if (hasCrossFileSite && canonicalFileLevelExportedName === undefined) {
    return freezePlan(candidateSummary, pkg.name, null, [], [], [{
      reason: "owner-not-exporting-fingerprint",
      detail: `${pkg.name}'s canonical implementation "${canonical.name}" in ${canonical.file} is not exported `
        + `from its own module, so other files in the package cannot import it`,
    }]);
  }

  const relativeImportExtension = sniffRelativeImportExtension(pkg);
  const sites = [];
  const refusals = [];
  for (const impl of others) {
    const result = resolveWithinPackageSite(pkg, impl, canonical, canonicalSource, canonicalAbsolute, relativeImportExtension);
    if ("refusal" in result) {
      refusals.push(result.refusal);
      continue;
    }
    sites.push(result.site);
  }

  const ownerExport = manifestSubpath !== undefined
    ? { file: canonical.file, name: canonicalFileLevelExportedName ?? canonical.name, subpath: manifestSubpath }
    : null;

  return freezePlan(candidateSummary, pkg.name, ownerExport, sites, [], refusals);
}

// ---------- promoting an owner's own implementation to a manifest export ----------

/** The canonical house registry, consulted by the republish check unless a
 *  caller overrides it (e.g. to point at a fixture in tests). */
const DEFAULT_REGISTRY = "https://registry.561.group";

/** The top-level exported binding names of one module's source text: a
 *  function/class/variable declaration carrying `export`, `export default`
 *  (reported as `"default"`), and each element of a same-file
 *  `export { a, b as c }` or re-exporting `export { a } from "..."`.
 *  `hasStarExport` is true when an unresolved `export * from "..."` (or
 *  `export * as ns from "..."`) was seen — its names cannot be enumerated
 *  without resolving that module. */
function moduleExportedNames(sourceFile) {
  const names = new Set();
  let hasStarExport = false;
  for (const stmt of sourceFile.body) {
    if (stmt.type === "ExportDefaultDeclaration") { names.add("default"); continue; }
    if (stmt.type === "ExportAllDeclaration") { hasStarExport = true; continue; }
    if (stmt.type !== "ExportNamedDeclaration") continue;
    const declaration = stmt.declaration;
    if (declaration && (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") && declaration.id) names.add(declaration.id.name);
    else if (declaration?.type === "VariableDeclaration") {
      for (const decl of declaration.declarations) if (decl.id.type === "Identifier") names.add(decl.id.name);
    }
    for (const element of stmt.specifiers) names.add(moduleName(element.exported));
  }
  return { names, hasStarExport };
}

/** Decide the edit that would make one of `owner`'s own already-existing
 *  implementations manifest-reachable through its `"."` `exports`/`main`
 *  entry: adding an `export` keyword when the declaration already lives in
 *  that entry file, or a named re-export appended to it otherwise.
 * @param owner The owner package, already known to hold an implementation of
 *  the duplicated fingerprint that `resolveOwnerExport` could not reach.
 * @param ownImplementations The owner's own matching implementations.
 * @returns The planned promotion, or a refusal explaining why none is
 *  possible.
 */
function planOwnerExportPromotion(
  owner,
  ownImplementations,
) {
  const first = ownImplementations[0];
  if (first === undefined) throw new Error("planOwnerExportPromotion requires at least one implementation");
  let canonical = first;
  if (ownImplementations.length > 1) {
    const resolution = resolveCanonicalWithinPackage(owner, ownImplementations);
    if ("refusal" in resolution) return { kind: "refused", refusal: resolution.refusal };
    canonical = resolution.canonical;
  }

  const declarationAbsolute = path.join(owner.dir, canonical.file);
  let declarationSource;
  try {
    declarationSource = readFileSync(declarationAbsolute, "utf8");
  } catch {
    return { kind: "refused", refusal: { reason: "owner-file-unreadable", detail: `cannot read ${declarationAbsolute} to plan an export promotion` } };
  }
  const declarationSourceFile = readJsnodeAst(declarationSource, declarationAbsolute);
  const located = locateTopLevelDeclaration(declarationSourceFile, declarationSource, canonical.line, canonical.name);
  if (located === undefined) {
    // Unlike an apply-time relocation (a genuine invariant violation once a
    // plan already committed to this declaration), planning first meets
    // whatever shape workspaceDuplication reported — a nested/class-member
    // form this migration's simple locator does not reach — and must refuse
    // gracefully rather than crash the whole batch over one candidate.
    return {
      kind: "refused",
      refusal: {
        reason: "owner-file-unreadable",
        detail: `cannot locate top-level declaration "${canonical.name}" at ${declarationAbsolute}:${canonical.line} to plan an export promotion`,
      },
    };
  }
  const publicName = exportedPublicName(located.statement, canonical.name, declarationSourceFile);

  const entryDescriptor = ownerExportCandidates(owner.manifest).find((candidate) => candidate.subpath === ".");
  if (entryDescriptor === undefined) {
    return { kind: "refused", refusal: { reason: "owner-export-needs-subpath", detail: `${owner.name} has no '.' exports/main entry to promote an export through` } };
  }
  // Prefer an authored source file over an already-built dist/ copy that
  // happens to exist at the literal target path: an edit belongs on the
  // file a rebuild will not overwrite. `resolveOwnerExport` gets away with
  // trying candidates in raw order because it also requires a content
  // match; promoting an export has no such filter, so it must rank the
  // candidates itself instead of taking the first merely-readable one.
  const readableEntryCandidates = [];
  for (const sourceCandidate of sourceCandidatesForExportTarget(owner.dir, entryDescriptor.target)) {
    try {
      const source = readFileSync(path.join(owner.dir, sourceCandidate.file), "utf8");
      readableEntryCandidates.push({
        file: sourceCandidate.file,
        source,
        ...(sourceCandidate.resolvedVia !== undefined ? { resolvedVia: sourceCandidate.resolvedVia } : {}),
      });
    } catch {
      continue;
    }
  }
  const preferredEntry = readableEntryCandidates.find((candidate) => candidate.resolvedVia === "source-of-dist") ?? readableEntryCandidates[0];
  const entryFile = preferredEntry?.file;
  const entrySource = preferredEntry?.source;
  if (entryFile === undefined || entrySource === undefined) {
    return {
      kind: "refused",
      refusal: { reason: "owner-export-needs-subpath", detail: `${owner.name}'s '.' exports/main entry (${entryDescriptor.target}) resolves to no readable source file` },
    };
  }

  const sameFile = path.normalize(entryFile) === path.normalize(canonical.file);
  if (sameFile) {
    // Defensive: resolveOwnerExport should already have found this case, so
    // an already-exported declaration reaching here is a no-op, never a throw.
    const name = publicName ?? canonical.name;
    const reference = { file: entryFile, name, subpath: "." };
    return { kind: "promoted", promotion: { file: entryFile, name, action: "add-export-keyword", subpath: "." }, ownerExport: reference };
  }

  const relativeImportExtension = sniffRelativeImportExtension(owner);
  const relativeSpecifier = relativeImportSpecifier(path.join(owner.dir, entryFile), declarationAbsolute, relativeImportExtension);
  const name = publicName ?? canonical.name;
  const needsDeclarationExport = publicName === undefined;

  const entrySourceFile = readJsnodeAst(entrySource, path.join(owner.dir, entryFile));
  const { names: entryExportedNames } = moduleExportedNames(entrySourceFile);
  if (entryExportedNames.has(name)) {
    return { kind: "refused", refusal: { reason: "owner-export-name-collision", detail: `${entryFile} already exports "${name}"` } };
  }

  const promotion = {
    file: entryFile,
    name,
    action: "add-named-reexport",
    declarationFile: canonical.file,
    relativeSpecifier,
    needsDeclarationExport,
    subpath: ".",
  };
  const reference = { file: entryFile, name, subpath: "." };
  return { kind: "promoted", promotion, ownerExport: reference };
}

/** Extract one entry's content as UTF-8 text from a POSIX tar byte stream by
 *  exact name match, iterating 512-byte header blocks. Does not handle
 *  PAX/GNU long-name extensions — not needed for house `.mjs` entry paths,
 *  which are always short. */
function extractTarEntryText(tar, entryName) {
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString("ascii").replace(/\0.*$/su, "");
    const sizeField = header.subarray(124, 136).toString("ascii").replace(/\0.*$/su, "").trim();
    const size = parseInt(sizeField, 8);
    const dataStart = offset + 512;
    if (name === entryName && Number.isFinite(size)) {
      return tar.subarray(dataStart, dataStart + size).toString("utf8");
    }
    if (!Number.isFinite(size)) break;
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return undefined;
}

/**
 * Whether the tarball currently published for `name@version` already
 * exports `exportedName` from its manifest `"."` entry (`exports["."]` or
 * `main`). Conservative: any failure to determine this (unreachable
 * registry, unreadable manifest/tarball, an unresolved `export *`) reports
 * `false` — a promotion is never treated as already-live on unverifiable
 * evidence.
 * @param registry Base registry URL (no trailing slash required).
 * @param name Package name.
 * @param version Exact version to check.
 * @param exportedName The binding name to look for.
 * @param fetchImpl Injectable transport, for tests — defaults to the global `fetch`.
 * @returns Whether the export is present in the published tarball.
 */
export async function ownerPublishedExportPresent(
  registry,
  name,
  version,
  exportedName,
  fetchImpl = fetch,
) {
  try {
    const base = registry.endsWith("/") ? registry : `${registry}/`;
    const manifestUrl = `${base}${name.replace("/", "%2F")}/${encodeURIComponent(version)}`;
    const manifestResponse = await fetchImpl(manifestUrl);
    if (!manifestResponse.ok) return false;
    const manifest = (await manifestResponse.json());
    const entry = ownerExportCandidates(manifest).find((candidate) => candidate.subpath === ".");
    if (entry === undefined) return false;
    const dist = manifest["dist"];
    const tarballUrl = dist !== null && typeof dist === "object" ? (dist)["tarball"] : undefined;
    if (typeof tarballUrl !== "string") return false;
    const tarballResponse = await fetchImpl(tarballUrl);
    if (!tarballResponse.ok) return false;
    const gzipped = Buffer.from(await tarballResponse.arrayBuffer());
    const tar = gunzipSync(gzipped);
    const cleanedTarget = entry.target.startsWith("./") ? entry.target.slice(2) : entry.target;
    const text = extractTarEntryText(tar, `package/${cleanedTarget}`);
    if (text === undefined) return false;
    const sourceFile = readJsnodeAst(text, "published-entry.mjs");
    const { names, hasStarExport } = moduleExportedNames(sourceFile);
    if (hasStarExport) return false;
    return names.has(exportedName);
  } catch {
    return false;
  }
}

// ---------- building the plan ----------

/** Registry access an owner-export-promotion republish check consults. */

async function buildPlan(
  root,
  candidate,
  explicitOwner,
  withinPackage,
  requestedCanonical,
  republishCheck,
) {
  const candidateSummary = {
    semanticFingerprint: candidate.semanticFingerprint,
    packages: candidate.packages,
    consumers: candidate.consumers,
    removableBytes: candidate.removableBytes,
  };

  const singlePackage = candidate.packages.length === 1;
  if (singlePackage || withinPackage) {
    const ownerName = singlePackage ? candidate.packages[0] : explicitOwner;
    if (ownerName === undefined) {
      return freezePlan(candidateSummary, null, null, [], [], [
        { reason: "no-owner", detail: "--within-package on a multi-package candidate needs --owner" },
      ]);
    }
    const pkg = [...eachWorkspacePackageDir(root)].find((record) => record.name === ownerName);
    if (pkg === undefined) {
      return freezePlan(candidateSummary, ownerName, null, [], [], [
        { reason: "owner-file-unreadable", detail: `owner package "${ownerName}" was not found in the workspace` },
      ]);
    }
    const implementations = candidate.implementations.filter((impl) => impl.package === ownerName);
    return buildWithinPackagePlan(pkg, candidateSummary, implementations, requestedCanonical);
  }

  if (requestedCanonical !== undefined) return freezePlan(candidateSummary, explicitOwner ?? null, null, [], [], [
    { reason: "canonical-not-in-candidate", detail: "an explicit canonical file and binding require within-package migration" },
  ]);

  // `candidate.owner` already resolves the org-layering law's seated-package
  // signal ahead of the plain dependency-graph one (workspaceDuplication's
  // own precedence); this call only adds the explicit `--owner` override on top.
  const ownerName = explicitOwner ?? candidate.owner;
  const refusals = [];
  if (ownerName === null) {
    refusals.push({ reason: "no-owner", detail: "no --owner given and the candidate has no owner" });
    return freezePlan(candidateSummary, null, null, [], [], refusals);
  }

  const workspacePackages = [...eachWorkspacePackageDir(root)];
  const ownerRecord = workspacePackages.find((pkg) => pkg.name === ownerName);
  let ownerExport = null;
  let promoteOwnerExport = null;
  let ownerRepublishRequired = false;
  if (ownerRecord === undefined) {
    refusals.push({ reason: "owner-file-unreadable", detail: `owner package "${ownerName}" was not found in the workspace` });
  } else {
    const resolved = resolveOwnerExport(ownerRecord, candidate.semanticFingerprint);
    if (resolved.kind === "unreadable") {
      refusals.push({ reason: "owner-file-unreadable", detail: resolved.detail });
    } else if (resolved.kind === "not-exporting") {
      const ownImplementations = candidate.implementations.filter((impl) => impl.package === ownerName);
      if (ownImplementations.length === 0) {
        refusals.push({ reason: "owner-not-exporting-fingerprint", detail: resolved.detail });
      } else {
        const promotionResult = planOwnerExportPromotion(ownerRecord, ownImplementations);
        if (promotionResult.kind === "refused") {
          refusals.push({ reason: "owner-not-exporting-fingerprint", detail: resolved.detail });
          refusals.push(promotionResult.refusal);
        } else {
          ownerExport = promotionResult.ownerExport;
          promoteOwnerExport = promotionResult.promotion;
          const ownerVersion = typeof ownerRecord.manifest["version"] === "string" ? (ownerRecord.manifest["version"]) : "";
          const present = await ownerPublishedExportPresent(
            republishCheck.registry, ownerName, ownerVersion, promotionResult.promotion.name, republishCheck.fetchImpl,
          );
          if (!present) {
            refusals.push({
              reason: "owner-republish-required",
              detail: `${ownerName}'s published ${ownerVersion} does not yet export "${promotionResult.promotion.name}" — publish it, then re-run`,
            });
            ownerRepublishRequired = true;
          }
        }
      }
    } else {
      ownerExport = resolved.reference;
    }
  }

  const nonOwnerImplementations = candidate.implementations.filter((impl) => impl.package !== ownerName);
  if (nonOwnerImplementations.length === 0) {
    refusals.push({ reason: "site-in-owner-only", detail: `every implementation of this family already lives in ${ownerName}` });
  }

  const manifestEdits = [];
  if (ownerRecord !== undefined) {
    const ownerVersion = typeof ownerRecord.manifest["version"] === "string" ? (ownerRecord.manifest["version"]) : "";
    const editedPackages = new Set();
    for (const impl of nonOwnerImplementations) {
      if (editedPackages.has(impl.package)) continue;
      editedPackages.add(impl.package);
      const record = workspacePackages.find((pkg) => pkg.name === impl.package);
      const dependencies = record !== undefined && record.manifest["dependencies"] !== null && typeof record.manifest["dependencies"] === "object"
        ? (record.manifest["dependencies"]) : {};
      if (!(ownerName in dependencies)) {
        manifestEdits.push({ package: impl.package, dependency: ownerName, version: ownerVersion });
      }
    }
  }

  const sites = [];
  if (ownerExport !== null && ownerRecord !== undefined) {
    const importSpecifier = ownerExport.subpath === "." ? ownerName : `${ownerName}/${ownerExport.subpath.replace(/^\.\//, "")}`;
    // `ownerExport.file` is where the name becomes manifest-reachable, which
    // for an `add-named-reexport` promotion is the ENTRY file (a re-export
    // line, no function body of its own) -- the real declaration to verify
    // substitutability against lives at `declarationFile`.
    const ownerDeclarationFile = promoteOwnerExport?.action === "add-named-reexport"
      ? promoteOwnerExport.declarationFile ?? ownerExport.file
      : ownerExport.file;
    let ownerSource;
    try {
      ownerSource = readFileSync(path.join(ownerRecord.dir, ownerDeclarationFile), "utf8");
    } catch {
      refusals.push({ reason: "owner-file-unreadable", detail: `cannot read owner file ${path.join(ownerRecord.dir, ownerDeclarationFile)}` });
    }
    if (ownerSource !== undefined) {
      for (const impl of nonOwnerImplementations) {
        const result = resolveSite(impl, ownerExport, ownerDeclarationFile, ownerRecord.dir, ownerSource, importSpecifier);
        if ("refusal" in result) {
          refusals.push(result.refusal);
          continue;
        }
        sites.push(result.site);
      }
    }
  }

  return freezePlan(candidateSummary, ownerName, ownerExport, sites, manifestEdits, refusals, promoteOwnerExport, ownerRepublishRequired);
}

function resolveSite(
  impl,
  ownerExport,
  ownerDeclarationFile,
  ownerDir,
  ownerSource,
  importSpecifier,
) {
  const absolute = path.join(impl.packageDir, impl.file);
  const source = readFileSync(absolute, "utf8");
  const sourceFile = readJsnodeAst(source, absolute);
  const located = locateTopLevelDeclaration(sourceFile, source, impl.line, impl.name);
  if (located === undefined) {
    throw new Error(`cannot locate top-level declaration "${impl.name}" at ${absolute}:${impl.line}`);
  }
  if (topLevelBoundNames(sourceFile, [located.statement]).has(ownerExport.name)) {
    return {
      refusal: { reason: "local-name-collision", detail: `${impl.package}:${impl.file} already binds "${ownerExport.name}" from elsewhere` },
    };
  }

  // See resolveWithinPackageSite for why this strict check is required on
  // top of the discovery scan's own loose, literal-erasing fingerprint.
  // `ownerDeclarationFile` (not necessarily `ownerExport.file` -- see the
  // add-named-reexport case in buildPlan) is where the owner's body itself
  // is declared, under its own local name (`ownerExport.name`).
  const siteForm = callableSubstitutionForm(source, absolute, impl.name);
  const ownerAbsolute = path.join(ownerDir, ownerDeclarationFile);
  const ownerForm = callableSubstitutionForm(ownerSource, ownerAbsolute, ownerExport.name);
  if (siteForm === null || ownerForm === null || siteForm !== ownerForm) {
    return {
      refusal: {
        reason: "not-verified-substitutable",
        detail: `${impl.package}:${impl.file}:${impl.name} did not verify as substitutable for the owner's `
          + `${ownerDeclarationFile}:${ownerExport.name} (differing constants, captured bindings, literal values, or `
          + "unsupported syntax); refused rather than risk importing distinct behavior",
      },
    };
  }

  return {
    site: {
      package: impl.package,
      packageDir: impl.packageDir,
      file: impl.file,
      line: impl.line,
      name: impl.name,
      action: "replace-declaration-with-import",
      importSpecifier,
      importedName: ownerExport.name,
      localName: impl.name,
      wasExported: exportedPublicName(located.statement, impl.name, sourceFile) !== undefined,
    },
  };
}

function freezePlan(
  candidate,
  owner,
  ownerExport,
  sites,
  manifestEdits,
  refusals,
  promoteOwnerExport = null,
  ownerRepublishRequired = false,
) {
  return Object.freeze({
    kind: "jsnode.duplication-migration.plan",
    candidate: Object.freeze(candidate),
    owner,
    ownerExport,
    sites: Object.freeze(sites),
    manifestEdits: Object.freeze(manifestEdits),
    refusals: Object.freeze(refusals),
    applicable: refusals.length === 0,
    promoteOwnerExport,
    ownerRepublishRequired,
  });
}

/** Compute one deterministic migration plan for a workspaceDuplication
 *  candidate: a canonical owner, its exported implementation, every
 *  non-owner site to replace with an import, and the manifest edits that
 *  wire the new dependency. A plan with any `refusals` entry has
 *  `applicable: false`. When the owner already holds a matching
 *  implementation that just isn't manifest-exported, `promoteOwnerExport`
 *  describes the edit that would fix that, checked against the registry so
 *  `ownerRepublishRequired` reflects whether the owner still needs to
 *  republish before the sites can apply. */
export async function planDuplicationMigration(
  root,
  selector,
  options = {},
) {
  const { owner, withinPackage, canonical, registry, fetchImpl, limit: _limit, ...duplicationOptions } = options;
  const candidate = selectCandidate(root, selector, duplicationOptions);
  return buildPlan(root, candidate, owner, withinPackage ?? false, canonical, {
    registry: registry ?? DEFAULT_REGISTRY,
    fetchImpl: fetchImpl ?? fetch,
  });
}

// ---------- applying the plan ----------

function buildImportLine(site) {
  return site.importedName === site.localName
    ? `import { ${site.importedName} } from "${site.importSpecifier}";`
    : `import { ${site.importedName} as ${site.localName} } from "${site.importSpecifier}";`;
}

/** Rewrite one file for a set of sites that all live in it: every site's
 *  declaration is deleted, then import sites gain an import block after the
 *  file's last existing import and alias sites gain `const` bindings after
 *  the canonical declaration (found by name, since deletions can shift line
 *  numbers a line-based re-lookup would miss). A file never mixes both kinds
 *  of site, since a file is either the canonical's own file (alias sites
 *  only) or a different one (import sites only). */
function rewriteFileForSites(original, fileName, sites) {
  const sourceFile = readJsnodeAst(original, fileName);
  const spans = [];
  for (const site of sites) {
    const located = locateTopLevelDeclaration(sourceFile, original, site.line, site.name);
    if (located === undefined) {
      throw new Error(`cannot relocate declaration "${site.name}" at ${fileName}:${site.line} to apply the migration`);
    }
    spans.push({ start: located.start, end: located.end });
  }
  // Deleting from the highest offset down leaves every not-yet-processed
  // (lower) offset, computed once against the original text, valid.
  let text = applyExactSourceEdits(original, spans.map((span) => ({ ...span, text: "" })));

  const importSites = sites.filter((site) => site.action === "replace-declaration-with-import");
  const aliasSites = sites.filter((site) => site.action === "replace-declaration-with-alias");

  if (importSites.length > 0) {
    const afterDeletion = readJsnodeAst(text, fileName);
    let anchor = 0;
    for (const stmt of afterDeletion.body) {
      if (stmt.type === "ImportDeclaration") anchor = stmt.end;
    }
    const lines = [];
    const seen = new Set();
    for (const site of importSites) {
      const importLine = buildImportLine(site);
      if (seen.has(importLine)) continue;
      seen.add(importLine);
      lines.push(importLine);
      if (site.wasExported) lines.push(`export { ${site.localName} };`);
    }
    const block = lines.join("\n");
    text = anchor === 0 ? `${block}\n${text}` : `${text.slice(0, anchor)}\n${block}${text.slice(anchor)}`;
  }

  if (aliasSites.length > 0) {
    const afterImports = readJsnodeAst(text, fileName);
    const canonicalName = aliasSites[0].importedName;
    const canonicalStatement = locateTopLevelDeclarationByName(afterImports, canonicalName);
    if (canonicalStatement === undefined) {
      throw new Error(`cannot relocate canonical declaration "${canonicalName}" in ${fileName} to place its aliases`);
    }
    const anchor = canonicalStatement.end;
    const lines = [];
    for (const site of aliasSites) {
      if (site.deleteOnly) continue;
      lines.push(`const ${site.localName} = ${site.importedName};`);
      if (site.wasExported) lines.push(`export { ${site.localName} };`);
    }
    if (lines.length > 0) {
      const block = lines.join("\n");
      text = `${text.slice(0, anchor)}\n${block}${text.slice(anchor)}`;
    }
  }

  return text;
}

/** Apply an `applicable` plan's AST edits, one affected package at a time,
 *  each gated on ITS OWN `npm test` exactly as `applyDuplicationMigrationBatch`
 *  already gates a batch's per-package edits — the same `applyPackageEditsWithTestGate`
 *  helper, not a second copy of its snapshot/verify/revert logic (owner-ruled
 *  2026-09-11, after a session's single-fingerprint `--apply` calls wrote three
 *  real regressions straight to disk with no test gate at all, requiring the
 *  session to hand-verify and hand-revert each one — exactly the check this
 *  function now performs itself, on every `--apply`, unconditionally).
 *  Returns the plan with `applied` listing only the files of packages whose
 *  tests passed (a reverted package's edits never appear there) and
 *  `packageResults` giving the full per-package outcome, including which
 *  packages were reverted and why. A non-applicable plan is returned
 *  unchanged, with nothing written. Dependency changes update the npm lockfile. */
export function applyDuplicationMigrationPlan(root, plan) {
  if (!plan.applicable) return plan;

  const packageDirs = new Map();
  for (const pkg of eachWorkspacePackageDir(root)) packageDirs.set(pkg.name, pkg.dir);

  const sitesByPackage = new Map();
  for (const site of plan.sites) {
    const list = sitesByPackage.get(site.package) ?? [];
    list.push(site);
    sitesByPackage.set(site.package, list);
  }
  const manifestEditsByPackage = new Map();
  for (const edit of plan.manifestEdits) {
    const list = manifestEditsByPackage.get(edit.package) ?? [];
    list.push(edit);
    manifestEditsByPackage.set(edit.package, list);
  }
  const packageOrder = [];
  for (const name of [...sitesByPackage.keys(), ...manifestEditsByPackage.keys()]) {
    if (!packageOrder.includes(name)) packageOrder.push(name);
  }

  const applied = [];
  const packageResults = [];
  for (const packageName of packageOrder) {
    const dir = packageDirs.get(packageName);
    if (dir === undefined) throw new Error(`cannot locate package "${packageName}" to apply its migration`);
    const sites = sitesByPackage.get(packageName) ?? [];
    const manifestEdits = manifestEditsByPackage.get(packageName) ?? [];
    const result = applyPackageEditsWithTestGate(dir, packageName, sites, manifestEdits, { requireTestScript: false });
    packageResults.push(result);
    if ("reverted" in result) continue;
    for (const site of sites) applied.push({ file: path.join(site.packageDir, site.file), action: "rewrote-source" });
    if (manifestEdits.length > 0) applied.push({ file: path.join(dir, "package.json"), action: "rewrote-manifest" });
  }

  return Object.freeze({ ...plan, applied: Object.freeze(applied), packageResults: Object.freeze(packageResults) });
}

// ---------- batch mode ----------

  

/** One `workspaceDuplication` scan, planned in ranked order: every
 *  cross-package candidate with a discoverable `owner` first (the scan
 *  itself already prefers the org-layering law's seated-package signal over
 *  a plain dependency edge — see `DuplicationCandidate.ownerBasis`) — then
 *  every candidate already confined to one package (within-package mode),
 *  each in the scan's own byte-savings order. `--limit` caps this planned
 *  list, not the underlying scan. */
export async function planDuplicationMigrationBatch(root, options = {}) {
  const progress = options.progress === true;
  const report = workspaceDuplication(root, {
    ...(options.exclude !== undefined ? { exclude: options.exclude } : {}),
    ...(options.scope !== undefined ? { scope: options.scope } : {}),
    ...(options.minimumBytes !== undefined ? { minimumBytes: options.minimumBytes } : {}),
    ...(options.cacheDir !== undefined ? { cacheDir: options.cacheDir } : {}),
    progress,
    // Migration planning reads every implementation site to place sites and
    // detect owner exports; the compact default view's per-candidate cap is
    // a report-shaping concern for a browsing caller, never for this one.
    detail: true,
  });
  if (progress) {
    process.stderr.write(`jsnode-duplication-migration: scan complete — ${report.candidateCount} candidates`
      + (report.unanalyzableSourceFiles.length > 0 ? `, ${report.unanalyzableSourceFiles.length} file(s) skipped as unanalyzable` : "")
      + "\n");
  }
  const crossPackageWithOwner = report.candidates.filter((candidate) => candidate.packages.length > 1 && candidate.owner !== null);
  const withinPackage = report.candidates.filter((candidate) => candidate.packages.length === 1);
  const ordered = [...crossPackageWithOwner, ...withinPackage];
  const limited = options.limit === undefined ? ordered : ordered.slice(0, Math.max(0, options.limit));

  const republishCheck = { registry: options.registry ?? DEFAULT_REGISTRY, fetchImpl: options.fetchImpl ?? fetch };
  const plans = [];
  for (const [candidateIndex, candidate] of limited.entries()) {
    const explicitOwner = candidate.packages.length > 1 ? (candidate.owner ?? undefined) : undefined;
    const plan = await buildPlan(root, candidate, explicitOwner, false, undefined, republishCheck);
    plans.push(plan);
    if (progress) {
      const status = plan.applicable ? "applicable" : `refused (${plan.refusals.map((r) => r.reason).join(", ")})`;
      process.stderr.write(`jsnode-duplication-migration: planned [${candidateIndex + 1}/${limited.length}] owner=${plan.owner ?? "none"}: ${status}\n`);
    }
  }

  const refused = {};
  let applicable = 0;
  for (const plan of plans) {
    if (plan.applicable) { applicable++; continue; }
    for (const refusal of plan.refusals) refused[refusal.reason] = (refused[refusal.reason] ?? 0) + 1;
  }

  return Object.freeze({
    kind: "jsnode.duplication-migration.batch",
    planned: plans.length,
    applicable,
    refused: Object.freeze(refused),
    plans: Object.freeze(plans),
  });
}

/** The last `maxLength` characters of `text`, unchanged when shorter. */
function tailOf(text, maxLength = 800) {
  return text.length <= maxLength ? text : text.slice(text.length - maxLength);
}

/** Installs a package's dependencies before its `npm test` gate runs a spawn
 *  gate that assumes `node_modules` is already present — the case a fresh
 *  checkout (a GitHub Actions runner, most of all) hits for every touched
 *  package. Existing installations are reused only when the manifest is unchanged.
 *  Changed manifests require `npm install` to update both dependencies and lockfile.
 *  Otherwise runs `npm ci` when `<dir>/package-lock.json` exists,
 *  `npm install` otherwise, both `--ignore-scripts --no-audit --no-fund`,
 *  spawned with the same stripped `env` the `npm test` gate uses. */
function ensureInstalledForTests(dir, env, manifestChanged = false) {
  const nodeModulesPath = path.join(dir, "node_modules");
  if (!manifestChanged && existsSync(nodeModulesPath) && statSync(nodeModulesPath).isDirectory()) return { installed: false };

  const command = !manifestChanged && existsSync(path.join(dir, "package-lock.json"))
    ? ["ci", "--ignore-scripts", "--no-audit", "--no-fund"]
    : ["install", "--ignore-scripts", "--no-audit", "--no-fund"];
  const result = spawnSync("npm", command, { cwd: dir, encoding: "utf8", env });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return {
    installed: true,
    command: ["npm", ...command],
    status: result.status,
    stderrTail: tailOf(stderr !== "" ? stderr : `${stdout}\n${stderr}`),
  };
}

/** Failing test names from `node --test`'s output, deduplicated in
 *  first-seen order — either reporter's shape: TAP's `not ok N - <name>`, or
 *  the default "spec" reporter's `✖ <name> (<duration>)`. */
function extractFailingTestNames(output) {
  const names = [];
  const seen = new Set();
  const patterns = [/^not ok \d+ - (.+)$/gmu, /^\s*(?:\x1b\[[0-9;]*m)*✖\s+(.+?)\s+\([\d.]+m?s\)\s*$/gmu];
  for (const pattern of patterns) {
    for (const match of output.matchAll(pattern)) {
      const name = match[1]?.trim();
      if (name !== undefined && name !== "" && !seen.has(name)) { seen.add(name); names.push(name); }
    }
  }
  return names;
}

/** Apply one package's share of a migration (its sites and manifest edits),
 *  gated on that package's own `npm test` whenever one exists: a package
 *  whose tests fail after the edit is restored byte-for-byte from copies
 *  taken before any write, with the failing test names and a stderr tail; a
 *  package whose tests still pass keeps its edits and reports the real byte
 *  delta of every file it touched (source and manifest together) — never a
 *  candidate's estimate. Installation updates the lockfile; failures restore it.
 *
 *  A package with NO `test` script: when `requireTestScript` is true (batch
 *  mode's own default — a mass, unattended sweep, conservative about
 *  anything it cannot verify), left untouched and reported with reason
 *  `no-test-script`. When false (single-fingerprint `--apply`'s default — one
 *  candidate the caller deliberately named), the edit is applied anyway and
 *  reported `unverified: true`, since refusing a deliberate, explicitly
 *  selected action merely because the target package happens to carry no
 *  tests is not a safety net, it is a silent no-op the caller did not ask
 *  for (owner-ruled 2026-09-11, after this exact refusal silently dropped a
 *  test fixture's single explicitly-selected migration to zero applied
 *  files).
 *
 *  Shared by `applyDuplicationMigrationBatch` and `applyDuplicationMigrationPlan`
 *  so both apply paths run the identical test gate where one is possible —
 *  not two separately-maintained copies of this logic. */
export function applyPackageEditsWithTestGate(
  dir,
  packageName,
  sites,
  manifestEdits,
  options = {},
) {
  const requireTestScript = options.requireTestScript ?? true;
  const manifestPath = path.join(dir, "package.json");
  const manifestRaw = readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const scripts = manifest["scripts"] !== null && typeof manifest["scripts"] === "object"
    ? manifest["scripts"] : {};
  const hasTestScript = typeof scripts["test"] === "string" && scripts["test"].trim() !== "";
  if (!hasTestScript && requireTestScript) {
    return { package: packageName, reverted: true, reason: "no-test-script" };
  }

  const touchedFiles = new Set();
  for (const site of sites) touchedFiles.add(path.join(site.packageDir, site.file));
  if (manifestEdits.length > 0) touchedFiles.add(manifestPath);
  const snapshots = new Map();
  for (const file of touchedFiles) snapshots.set(file, readFileSync(file, "utf8"));
  const lockfile = path.join(dir, "package-lock.json");
  const lockBefore = existsSync(lockfile) ? readFileSync(lockfile, "utf8") : undefined;
  const restore = () => {
    for (const [file, original] of snapshots) writeFileSync(file, original, "utf8");
    if (lockBefore === undefined) rmSync(lockfile, { force: true });
    else writeFileSync(lockfile, lockBefore, "utf8");
  };

  const sitesByFile = new Map();
  for (const site of sites) {
    const absolute = path.join(site.packageDir, site.file);
    const list = sitesByFile.get(absolute) ?? [];
    list.push(site);
    sitesByFile.set(absolute, list);
  }
  const rewritten = new Map();
  for (const [absoluteFile, fileSites] of sitesByFile) {
    const original = snapshots.get(absoluteFile);
    rewritten.set(absoluteFile, rewriteFileForSites(original, absoluteFile, fileSites));
  }
  if (manifestEdits.length > 0) {
    let current = JSON.parse(snapshots.get(manifestPath));
    for (const edit of manifestEdits) {
      const dependencies = current["dependencies"] !== null && typeof current["dependencies"] === "object"
        ? { ...(current["dependencies"]) } : {};
      dependencies[edit.dependency] = edit.version;
      current = { ...current, dependencies };
    }
    const serialized = JSON.stringify(current, null, 2) + (manifestRaw.endsWith("\n") ? "\n" : "");
    rewritten.set(manifestPath, serialized);
  }
  try {
    for (const [file, text] of rewritten) writeFileSync(file, text, "utf8");
  } catch (error) { restore(); throw error; }

  if (!hasTestScript) {
    // requireTestScript is false here (the earlier gate already returned
    // otherwise): the edit above is real and kept, there is just no test
    // script to verify it against.
    let bytesRemovedUnverified = 0;
    for (const [file, original] of snapshots) {
      bytesRemovedUnverified += Buffer.byteLength(original, "utf8") - Buffer.byteLength(readFileSync(file, "utf8"), "utf8");
    }
    return { package: packageName, applied: sites.length + manifestEdits.length, bytesRemoved: bytesRemovedUnverified, unverified: true };
  }

  // Strip the running process's own `node --test` markers before spawning:
  // inherited, a package's own `node --test` script sees itself as a
  // recursive child run and silently skips its tests (exit 0, nothing
  // executed) — a false pass this apply must never trust.
  const testEnv = { ...process.env };
  delete testEnv["NODE_TEST_CONTEXT"];
  delete testEnv["NODE_TEST_WORKER_ID"];

  const installResult = ensureInstalledForTests(dir, testEnv, rewritten.has(manifestPath) && rewritten.get(manifestPath) !== manifestRaw);
  if (installResult.installed && installResult.status !== 0) {
    restore();
    return {
      package: packageName,
      reverted: true,
      reason: "install-failed",
      command: installResult.command,
      stderrTail: installResult.stderrTail,
    };
  }

  const result = spawnSync("npm", ["test"], { cwd: dir, encoding: "utf8", env: testEnv });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.status !== 0) {
    restore();
    return {
      package: packageName,
      reverted: true,
      failingTests: extractFailingTestNames(`${stdout}\n${stderr}`),
      stderrTail: tailOf(stderr !== "" ? stderr : `${stdout}\n${stderr}`),
    };
  }

  let bytesRemoved = 0;
  for (const [file, original] of snapshots) {
    bytesRemoved += Buffer.byteLength(original, "utf8") - Buffer.byteLength(readFileSync(file, "utf8"), "utf8");
  }
  return {
    package: packageName,
    applied: sites.length + manifestEdits.length,
    bytesRemoved,
    ...(installResult.installed ? { installed: true, installCommand: installResult.command } : {}),
  };
}

/** Apply a batch's applicable plans package by package: every applicable
 *  plan's sites and manifest edits are grouped by the package whose files
 *  they write, then each package's share is applied and verified by
 *  `applyPackageEditsWithTestGate`. */
export function applyDuplicationMigrationBatch(root, report, options = {}) {
  const progress = options.progress === true;
  const packageDirs = new Map();
  for (const pkg of eachWorkspacePackageDir(root)) packageDirs.set(pkg.name, pkg.dir);

  const sitesByPackage = new Map();
  const manifestEditsByPackage = new Map();
  const packageOrder = [];
  const noteOrder = (name) => { if (!packageOrder.includes(name)) packageOrder.push(name); };
  for (const plan of report.plans) {
    if (!plan.applicable) continue;
    for (const site of plan.sites) {
      noteOrder(site.package);
      const list = sitesByPackage.get(site.package) ?? [];
      list.push(site);
      sitesByPackage.set(site.package, list);
    }
    for (const edit of plan.manifestEdits) {
      noteOrder(edit.package);
      const list = manifestEditsByPackage.get(edit.package) ?? [];
      list.push(edit);
      manifestEditsByPackage.set(edit.package, list);
    }
  }

  const packageResults = [];
  let index = 0;
  for (const packageName of packageOrder) {
    index++;
    if (progress) process.stderr.write(`jsnode-duplication-migration: [${index}/${packageOrder.length}] ${packageName}: checking...\n`);
    const dir = packageDirs.get(packageName);
    if (dir === undefined) continue;
    const sites = sitesByPackage.get(packageName) ?? [];
    const manifestEdits = manifestEditsByPackage.get(packageName) ?? [];
    const result = applyPackageEditsWithTestGate(dir, packageName, sites, manifestEdits);
    packageResults.push(result);
    if (progress) {
      const outcome = "reverted" in result
        ? `reverted (${result.reason ?? "test-failure"})`
        : `kept, ${result.applied} site(s), ${result.bytesRemoved} bytes removed`;
      process.stderr.write(`jsnode-duplication-migration: [${packageResults.length}/${packageOrder.length}] ${result.package}: ${outcome}\n`);
    }
  }

  return Object.freeze({ ...report, packageResults: Object.freeze(packageResults) });
}

// ---------- applying owner-export promotions ----------

/** Prefix a top-level declaration named `name` with `export `, by plain
 *  string splice at its statement start — matching this module's existing
 *  string-splice editing style rather than a printer/factory rewrite.
 * @throws {Error} When no top-level declaration named `name` exists in `source`.
 */
function addExportKeywordToDeclaration(source, fileName, name) {
  const sourceFile = readJsnodeAst(source, fileName);
  const statement = locateTopLevelDeclarationByName(sourceFile, name);
  if (statement === undefined) {
    throw new Error(`cannot locate top-level declaration "${name}" in ${fileName} to add its export keyword`);
  }
  const start = statement.start;
  return `${source.slice(0, start)}export ${source.slice(start)}`;
}

/** Apply every planned owner-export promotion from a batch report, grouped
 *  and deduplicated per owner package, gated on that owner's own `npm test`
 *  — entirely separate from `applyDuplicationMigrationBatch`'s per-package
 *  site migrations, which stay untouched here. A package with no `test`
 *  script is left untouched and reported with reason `"no-test-script"`; a
 *  package whose tests fail after the edits is restored byte-for-byte and
 *  reported with the failing test names. Never touches lockfiles. */
export function applyOwnerExportPromotions(root, report)

 {
  const packageDirs = new Map();
  for (const pkg of eachWorkspacePackageDir(root)) packageDirs.set(pkg.name, pkg.dir);

  const promotionsByOwner = new Map();
  for (const plan of report.plans) {
    if (plan.owner === null || plan.promoteOwnerExport === null) continue;
    const forOwner = promotionsByOwner.get(plan.owner) ?? new Map();
    forOwner.set(JSON.stringify(plan.promoteOwnerExport), plan.promoteOwnerExport);
    promotionsByOwner.set(plan.owner, forOwner);
  }

  const ownersPromoted = [];
  const reverted = [];

  for (const [ownerName, promotionsByKey] of promotionsByOwner) {
    const dir = packageDirs.get(ownerName);
    if (dir === undefined) continue;
    const promotions = [...promotionsByKey.values()];

    const manifestPath = path.join(dir, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const scripts = manifest["scripts"] !== null && typeof manifest["scripts"] === "object"
      ? manifest["scripts"] : {};
    const hasTestScript = typeof scripts["test"] === "string" && scripts["test"].trim() !== "";
    if (!hasTestScript) {
      reverted.push({ package: ownerName, reverted: true, reason: "no-test-script" });
      continue;
    }

    const touchedFiles = new Set();
    for (const promotion of promotions) {
      touchedFiles.add(path.join(dir, promotion.file));
      if (promotion.needsDeclarationExport === true && promotion.declarationFile !== undefined) {
        touchedFiles.add(path.join(dir, promotion.declarationFile));
      }
    }
    const snapshots = new Map();
    for (const file of touchedFiles) snapshots.set(file, readFileSync(file, "utf8"));

    const exportedNames = [];
    for (const promotion of promotions) {
      if (promotion.needsDeclarationExport === true && promotion.declarationFile !== undefined) {
        const declarationAbsolute = path.join(dir, promotion.declarationFile);
        writeFileSync(declarationAbsolute, addExportKeywordToDeclaration(readFileSync(declarationAbsolute, "utf8"), declarationAbsolute, promotion.name), "utf8");
      }
      const absolute = path.join(dir, promotion.file);
      if (promotion.action === "add-export-keyword") {
        writeFileSync(absolute, addExportKeywordToDeclaration(readFileSync(absolute, "utf8"), absolute, promotion.name), "utf8");
      } else {
        const current = readFileSync(absolute, "utf8");
        // ESM export order is not behaviorally significant; appending at
        // end-of-file is simplest and consistent across every promotion.
        const line = `export { ${promotion.name} } from "${promotion.relativeSpecifier}";\n`;
        writeFileSync(absolute, current.endsWith("\n") ? `${current}${line}` : `${current}\n${line}`, "utf8");
      }
      exportedNames.push(promotion.name);
    }

    const testEnv = { ...process.env };
    delete testEnv["NODE_TEST_CONTEXT"];
    delete testEnv["NODE_TEST_WORKER_ID"];

    const installResult = ensureInstalledForTests(dir, testEnv);
    if (installResult.installed && installResult.status !== 0) {
      for (const [file, original] of snapshots) writeFileSync(file, original, "utf8");
      reverted.push({
        package: ownerName,
        reverted: true,
        reason: "install-failed",
        command: installResult.command,
        stderrTail: installResult.stderrTail,
      });
      continue;
    }

    const result = spawnSync("npm", ["test"], { cwd: dir, encoding: "utf8", env: testEnv });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    if (result.status !== 0) {
      for (const [file, original] of snapshots) writeFileSync(file, original, "utf8");
      reverted.push({
        package: ownerName,
        reverted: true,
        failingTests: extractFailingTestNames(`${stdout}\n${stderr}`),
        stderrTail: tailOf(stderr !== "" ? stderr : `${stdout}\n${stderr}`),
      });
      continue;
    }

    ownersPromoted.push({
      package: ownerName,
      exports: exportedNames,
      ...(installResult.installed ? { installed: true, installCommand: installResult.command } : {}),
    });
  }

  return { ownersPromoted: Object.freeze(ownersPromoted), reverted: Object.freeze(reverted) };
}
