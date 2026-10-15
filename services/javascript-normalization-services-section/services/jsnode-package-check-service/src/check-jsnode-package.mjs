import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { address, cell } from "@red-cup-engineering/signcell/cell";

// Ported from the legacy organizing-with-jsnode conformance/{check,kind,layer}.mts
// trio. The legacy checker used a private charge framework. This owner keeps
// its existing findings for old consumers and now also emits source-qualified
// SignCell witness cells. FOUR belongs to the shared Data/Metrologic substrate,
// not to a local status-to-charge table.
//
// Every finding carries a `convention` tag a caller can filter on:
//   "live"    - the legacy rule was verified to still hold in this tree.
//   "adapted" - the legacy rule's principle holds but its literal shape (a
//               field name, a scope literal, a layer table) was rewritten to
//               match what this tree actually does.
//   "dead"    - the legacy rule references a convention, framework, or
//               vocabulary this tree never adopted; kept for lineage, never
//               blocking (status is always "informational").

const LAYERS = Object.freeze(["lib", "apps", "services", "sites"]);
const SOURCE_EXTENSIONS = new Set([".mjs", ".mts", ".js", ".ts", ".cjs", ".cts"]);

function finding(invariantId, convention, status, message) {
  return Object.freeze({ type: "JsnodePackageCheckFinding", invariantId, convention, status, message });
}

export function layerOf(packageDir) {
  const parent = basename(dirname(resolve(packageDir)));
  if (!LAYERS.includes(parent)) {
    throw new TypeError(`package directory ${packageDir} is not under lib/, apps/, services/, or sites/`);
  }
  return parent;
}

// --- kind detection (ported from kind.mts) ---------------------------------

function packageHasTopLevelMarkdown(dir) {
  return readdirSync(dir, { withFileTypes: true }).some((entry) => entry.isFile() && entry.name.endsWith(".md"));
}

function packageReadmeText(dir) {
  const p = join(dir, "README.md");
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

export function detectPackageKind(dir, manifest) {
  const srcDir = join(dir, "src");
  const scripts = manifest.scripts ?? {};
  const description = typeof manifest.description === "string" ? manifest.description : "";
  const readmeText = packageReadmeText(dir);
  // Adaptation: the legacy check only recognized an object exports map as a
  // JS boundary. This family's exports field is routinely a plain string
  // (see jsnode-package-identity-normalization-service); without this branch
  // every plain-ESM package here would misclassify as unimplemented.
  const hasImplementedJsBoundary =
    existsSync(srcDir) ||
    typeof manifest.exports === "object" ||
    typeof manifest.exports === "string" ||
    typeof manifest.main === "string" ||
    typeof manifest.types === "string" ||
    typeof manifest.bin === "object";

  if (!hasImplementedJsBoundary && /\b(scaffolded|planned|not yet wired|not wired|placeholder)\b/iu.test(`${description}\n${readmeText}`)) {
    return "site-scaffold";
  }

  const hasEmacsBoundary =
    existsSync(join(dir, "lisp")) ||
    existsSync(join(dir, "init.el")) ||
    existsSync(join(dir, "early-init.el")) ||
    Object.values(scripts).some((script) => typeof script === "string" && /\bemacs\b/u.test(script));
  if (hasEmacsBoundary) return "emacs-app";

  const hasJsBoundary = hasImplementedJsBoundary || ["check", "test", "verify"].some((script) => typeof scripts[script] === "string");
  if (hasJsBoundary) return "jsnode";

  const hasContentEvidence =
    packageHasTopLevelMarkdown(dir) ||
    existsSync(join(dir, "docs")) ||
    existsSync(join(dir, "working")) ||
    existsSync(join(dir, "chartering")) ||
    /\b(content|markdown|frontmatter|prose|records?)\b/iu.test(description);
  return hasContentEvidence ? "content-records" : "jsnode";
}

// --- source collection -------------------------------------------------

async function sourceFiles(srcDir) {
  const out = [], uninspected = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (entry.name.includes(".test.")) continue;
      if (entry.isSymbolicLink() || !entry.isFile()) {
        // A symlink could be a whole directory subtree or executable source;
        // claiming complete positive source coverage without reading it lies.
        uninspected.push(full);
        continue;
      }
      if (SOURCE_EXTENSIONS.has(extname(entry.name))) out.push(full);
    }
  }
  await walk(srcDir);
  return Object.freeze({
    files: Object.freeze(out.sort()),
    uninspected: Object.freeze(uninspected.sort()),
  });
}

// --- M: manifest invariants ---------------------------------------------

function checkM1(dir, manifest) {
  const dirLeaf = basename(resolve(dir));
  const name = manifest.name;
  if (typeof name !== "string" || !/^@[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*$/u.test(name)) {
    return finding("M1", "adapted", "violation", `name ${String(name)} is not a valid scoped @owner/leaf package name`);
  }
  const leaf = name.split("/")[1];
  return leaf === dirLeaf
    ? finding("M1", "adapted", "clean", `name ${name} matches directory ${dirLeaf}`)
    : finding("M1", "adapted", "violation", `name leaf "${leaf}" does not match directory "${dirLeaf}"`);
}

function checkM2(manifest, kind) {
  const faults = [];
  if (manifest.private !== true) faults.push("private is not true");
  if (kind === "jsnode" && manifest.type !== "module") faults.push('type is not "module"');
  return faults.length > 0
    ? finding("M2", "adapted", "violation", faults.join("; "))
    : finding("M2", "adapted", "clean", "private and, for jsnode packages, type: module");
}

function checkM2SideEffects(manifest, kind) {
  if (kind !== "jsnode") return finding("M2b", "dead", "informational", "sideEffects requirement only considered for jsnode packages");
  const value = manifest.sideEffects;
  return finding("M2b", "dead", "informational", value === undefined
    ? "sideEffects is unset (this family does not set it; legacy required false)"
    : `sideEffects is ${JSON.stringify(value)}`);
}

// Read locally checkable root export targets, including conditional branches,
// without treating an unchecked branch or a null export as an observed file.
function rootExportTargets(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(rootExportTargets);
  if (value && typeof value === "object") return Object.values(value).flatMap(rootExportTargets);
  return [];
}

function hasFallbackArray(value) {
  return Array.isArray(value) || !!(value && typeof value === "object" && Object.values(value).some(hasFallbackArray));
}


/** One source-owned observation shared by the checker and its SignCell witness.
 * A directory, missing target, or symlink crossing package ownership is not
 * a verified installed export. Wildcard expansion remains unobserved here.
 */
function insidePackage(root, candidate) {
  const displaced = relative(root, candidate);
  return displaced !== ".." && !displaced.startsWith(".." + sep) && !isAbsolute(displaced);
}

function observeExportTarget(dir, target) {
  const requested = resolve(dir, target);
  if (!target.startsWith("./") || !insidePackage(dir, requested))
    return Object.freeze({ target, withinPackage: false, exists: false });
  if (target.includes("*"))
    return Object.freeze({ target, withinPackage: true, exists: null });
  try {
    const actual = realpathSync(requested);
    const withinPackage = insidePackage(realpathSync(dir), actual);
    return Object.freeze({ target, withinPackage, exists: withinPackage && statSync(actual).isFile() });
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR")
      return Object.freeze({ target, withinPackage: true, exists: false });
    throw error;
  }
}

function checkM3(dir, manifest, observations) {
  const exp = manifest.exports;
  if (exp === undefined) return finding("M3", "adapted", "violation", "no exports field");
  const isMap = exp !== null && typeof exp === "object" && !Array.isArray(exp);
  if (typeof exp !== "string" && !isMap && !Array.isArray(exp))
    return finding("M3", "adapted", "violation", "exports field is neither a string, array nor a map");
  if (observations.length === 0)
    return finding("M3", "adapted", "informational", "declared exports have no file targets whose presence was inspected");
  const invalid = observations.filter((read) => !read.withinPackage).map((read) => read.target);
  if (invalid.length > 0)
    return finding("M3", "adapted", "violation", "export target escapes its package or is not package-relative: " + invalid.join(", "));
  if (hasFallbackArray(exp))
    return finding("M3", "adapted", "informational", "export fallback arrays were not resolved; a missing alternative is not yet a proven failure");
  const missing = observations.filter((read) => read.exists === false).map((read) => read.target);
  if (missing.length > 0)
    return finding("M3", "adapted", "violation", "export targets missing or not regular files: " + missing.join(", "));
  if (observations.some((read) => read.exists === null))
    return finding("M3", "adapted", "informational", "declared exports have wildcard targets; their expansion has not been inspected");
  return finding("M3", "adapted", "clean", observations.length + " declared export target(s) exist as files inside the package");
}

function checkM4(manifest, kind) {
  if (kind === "content-records") return finding("M4", "adapted", "informational", "content package has no JS lifecycle script requirement");
  const scripts = manifest.scripts ?? {};
  // Adaptation: legacy only required "verify" for the lib/ layer. This tree's
  // CLAUDE.md states check/test/verify for every package regardless of layer.
  const wanted = ["check", "test", "verify"];
  const absent = wanted.filter((s) => typeof scripts[s] !== "string");
  return absent.length > 0
    ? finding("M4", "adapted", "violation", `missing scripts: ${absent.join(", ")}`)
    : finding("M4", "adapted", "clean", `scripts present: ${wanted.join(", ")}`);
}

function checkM5(manifest) {
  const deps = Object.entries(manifest.dependencies ?? {}).filter(([n]) => n.startsWith("@"));
  const pinned = deps.filter(([, v]) => v !== "workspace:*");
  return finding("M5", "dead", "informational",
    `${deps.length} scoped dependenc${deps.length === 1 ? "y" : "ies"}, ${pinned.length} pinned to an exact version (this tree pins versions rather than using workspace:*)`);
}

// --- L: layering invariants ----------------------------------------------

function checkL1(manifest, layer) {
  if (layer !== "services") return finding("L1", "adapted", "informational", "atomic-import rule only applies to the services/ layer");
  const deps = Object.keys(manifest.dependencies ?? {}).filter((n) => n.startsWith("@"));
  return deps.length === 0
    ? finding("L1", "adapted", "clean", "atomic service declares no workspace-scoped dependencies")
    : finding("L1", "adapted", "violation", `atomic services must not import each other: ${deps.join(", ")}`);
}

function checkL2(layer) {
  if (layer !== "apps") return finding("L2", "adapted", "informational", "not an apps/ package");
  return finding("L2", "adapted", "informational",
    "apps/ packages may depend on services/ (legacy apps-may-depend-on-lib-only rule is superseded here)");
}

function checkL3(layer) {
  return layer === "sites"
    ? finding("L3", "adapted", "informational", "no live sites/ packages observed in this section; layering rule unverified")
    : finding("L3", "adapted", "informational", "not a sites/ package");
}

function checkL4(dir, manifest) {
  const isCodec = /-codecs(-|$)/u.test(basename(resolve(dir)));
  if (!isCodec) return finding("L4", "live", "informational", "not a *-codecs package (no live instances found in this section)");
  const count = Object.keys(manifest.dependencies ?? {}).length;
  return count === 0
    ? finding("L4", "live", "clean", "codec package is zero-dep")
    : finding("L4", "live", "violation", `codec package declares ${count} runtime dependenc${count === 1 ? "y" : "ies"}; codecs should carry nothing`);
}

function checkL5(manifest) {
  const count = Object.keys(manifest.dependencies ?? {}).length;
  return count > 8
    ? finding("L5", "live", "violation", `${count} direct dependencies - the god-package smell`)
    : finding("L5", "live", "clean", `${count} direct dependenc${count === 1 ? "y" : "ies"}`);
}

// --- A: source-text invariants -------------------------------------------

function checkA1(texts) {
  const hits = [];
  for (const { file, text } of texts) {
    for (const match of text.matchAll(/export (?:function|const) ((?:is|has|can)[A-Z]\w*)[^\n]*?:\s*boolean/gu)) {
      hits.push(`${basename(file)}: ${match[1]}`);
    }
  }
  return finding("A1", "dead", "informational", hits.length > 0
    ? `boolean-typed judgment exports found (legacy TS-only rule; no type annotations in plain ESM): ${hits.slice(0, 6).join("; ")}`
    : "no TS-annotated boolean judgment exports found (rule is vacuous outside TypeScript sources)");
}

const RECORD_LIKE_NAME = /(Config|Options|Input|Output|Request|Response|Result|Report|Snapshot|Payload|Record|Dto|DTO)$/u;

function checkA2(texts) {
  const hits = [];
  for (const { file, text } of texts) {
    for (const match of text.matchAll(/export\s+(?:interface|type)\s+([A-Z][A-Za-z0-9_]*)/gu)) {
      const name = match[1] ?? "";
      if (RECORD_LIKE_NAME.test(name)) hits.push(`${basename(file)}: ${name}`);
    }
  }
  return finding("A2", "dead", "informational",
    `legacy Mark/Utterance relational-descent convention is not part of this family's vocabulary${hits.length > 0 ? `; ${hits.length} TS record-like export(s) found` : ""}`);
}

function checkA3(texts) {
  const bad = [];
  let total = 0;
  for (const { file, text } of texts) {
    for (const match of text.matchAll(/\btype:\s*["'`]([^"'`]+)["'`]/gu)) {
      total += 1;
      const value = match[1] ?? "";
      if (!/^[A-Z][A-Za-z0-9]*$/u.test(value)) bad.push(`${basename(file)}: "${value}"`);
    }
  }
  if (total === 0) return finding("A3", "adapted", "informational", "no type-discriminator strings found");
  return bad.length > 0
    ? finding("A3", "adapted", "violation", `non-PascalCase type discriminators: ${bad.slice(0, 6).join("; ")}`)
    : finding("A3", "adapted", "clean", `${total} type discriminator(s) are PascalCase`);
}

// --- S: fallback "law" invariants (regex scans, kept for lineage) --------

const FALLBACK_LAWS = Object.freeze([
  { id: "S1", key: "wall-clock-as-data", re: /\bDate\.now\(\)|new Date\(\)/u },
  { id: "S2", key: "delete-not-trace", re: /\b(unlinkSync|rmSync|rmdirSync)\b|\.\s*(unlink|rm)\(|\bdelete\s+[a-zA-Z_$][\w$.[\]]*/u },
  { id: "S3", key: "stringify-not-identity", re: /JSON\.stringify[\s\S]{0,80}?(sha256|assertionId|contentKey|append|writeFile)/u },
  { id: "S4", key: "ungated-admit", re: /\b(admitLog|federate|mergeWorlds|mergeLog)\s*\(/u },
  { id: "S5", key: "domain-throw", re: /throw new Error\(\s*["'`][^"'`]*(not.?found|denied|conflict|missing|unauthorized)/iu },
]);

function checkLaws(texts) {
  return FALLBACK_LAWS.map((law) => {
    const hits = [];
    for (const { file, text } of texts) {
      text.split("\n").forEach((lineText, i) => { if (law.re.test(lineText)) hits.push(`${basename(file)}:${i + 1}`); });
    }
    return finding(law.id, "dead", "informational", hits.length > 0
      ? `${hits.length} occurrence(s) of legacy "${law.key}" pattern (framework not adopted by this family): ${hits.slice(0, 6).join("; ")}`
      : `no occurrences of legacy "${law.key}" pattern`);
  });
}

function checkS6(layer, texts) {
  if (layer !== "services") return finding("S6", "dead", "informational", "wall-clock-tick rule only considered for services/ layer");
  const hits = [];
  for (const { file, text } of texts) {
    text.split("\n").forEach((lineText, i) => { if (/setInterval\s*\(/u.test(lineText)) hits.push(`${basename(file)}:${i + 1}`); });
  }
  return finding("S6", "dead", "informational", hits.length > 0
    ? `${hits.length} setInterval occurrence(s) (legacy tick-law not adopted by this family): ${hits.join("; ")}`
    : "no setInterval occurrences");
}

// --- D: package hygiene ---------------------------------------------------

function checkD1(dir) {
  const p = join(dir, "README.md");
  return finding("D1", "dead", "informational", existsSync(p)
    ? "README.md present"
    : "no README.md (this family does not use per-package README.md files)");
}


/**
 * Preserve the actual read boundary for witnessed package claims.
 *
 * This is not a FOUR evaluator. SignCell derives the charge from the for/against
 * witness sets. Rules that the existing checker did not actually evaluate
 * stay without witnesses (unknown), even if a legacy report has prose about them.
 * Each subject pins the checked manifest, inspected source content, observed
 * exported-file existence, and the checker source itself.
 */
function witnessedPackageCells(findings, { dir, layer, kind, manifest, manifestSource, texts, checkerSource, exportTargets, uninspectedSourceEntries }) {
  const manifestField = (key) => Object.hasOwn(manifest, key) ? manifest[key] : null;
  const scannedSources = texts.map(({ file, text }) => Object.freeze({
    path: relative(dir, file),
    contentId: address(cell("jsnode.source-bytes", relative(dir, file), text)),
  }));
  const revision = address(cell(dir, "jsnode.inspected-source", {
    manifestSource,
    scannedSources,
    uninspectedSourceEntries,
    exportTargets,
  }));
  const checkerRevision = address(cell("jsnode-package-check-service", "checker-source", checkerSource));
  const subject = Object.freeze({
    type: "JsnodePackageSourceRevision",
    directory: dir,
    revision,
    checkerRevision,
  });
  const observed = {
    M1: { name: manifestField("name"), directoryName: basename(dir) },
    M2: { private: manifestField("private"), type: manifestField("type"), packageKind: kind },
    M3: { exports: manifestField("exports"), exportTargets },
    M4: { scripts: manifestField("scripts"), packageKind: kind },
    L1: { layer, dependencies: manifestField("dependencies") },
    L4: { layer, directoryName: basename(dir), dependencies: manifestField("dependencies") },
    L5: { dependencies: manifestField("dependencies") },
    A3: { files: scannedSources, uninspected: uninspectedSourceEntries, coverage: "recursive src, admitted JS/TS extensions, excluding test files and unresolved links" },
  };
  return Object.freeze(findings.map((finding) => {
    const basis = observed[finding.invariantId];
    // Informational, dead-convention, skipped and uninspected rules do not
    // establish either conformity or violation. Never translate them to pass.
    const warranted = basis !== undefined && finding.status !== "informational" &&
      finding.convention !== "dead";
    const witness = warranted ? Object.freeze({
      type: "JsnodePackageRuleObservation",
      rule: finding.invariantId,
      convention: finding.convention,
      sourceRevision: revision,
      checkerRevision,
      observed: basis,
      reported: finding.message,
    }) : null;
    return cell(subject, "conforms-to-jsnode-rule", finding.invariantId, {
      for: witness && finding.status === "clean" ? [witness] : [],
      against: witness && finding.status === "violation" ? [witness] : [],
    });
  }));
}

/**
 * Check one package directory against house package invariants and return
 * frozen findings. Read-only: never writes to the package or its manifest.
 */
export async function checkJsnodePackage({ directory } = {}) {
  if (typeof directory !== "string" || !directory) throw new TypeError("directory is required");
  const dir = resolve(directory);
  const layer = layerOf(dir);
  const manifestPath = join(dir, "package.json");
  if (!existsSync(manifestPath)) throw new TypeError(`no package.json at ${manifestPath}`);
  const [manifestSource, checkerSource] = await Promise.all([readFile(manifestPath, "utf8"), readFile(new URL(import.meta.url), "utf8")]);
  const manifest = JSON.parse(manifestSource);
  const kind = detectPackageKind(dir, manifest);

  const srcDir = join(dir, "src");
  const sourceInventory = kind === "jsnode" && existsSync(srcDir)
    ? await sourceFiles(srcDir) : { files: [], uninspected: [] };
  const uninspectedSourceEntries = Object.freeze(sourceInventory.uninspected.map((file) => relative(dir, file)));
  const texts = await Promise.all(sourceInventory.files.map(async (file) => ({ file, text: await readFile(file, "utf8") })));
  const checkedA3 = checkA3(texts);
  // A negative observation may stand despite incomplete coverage. A positive
  // "no problems anywhere" cannot be witnessed while source entries are unread.
  const sourceA3 = checkedA3.status === "clean" && uninspectedSourceEntries.length > 0
    ? finding("A3", "adapted", "informational", "source scan incomplete; uninspected entries: " + uninspectedSourceEntries.join(", "))
    : checkedA3;

  const exportTargets = Object.freeze(rootExportTargets(manifest.exports).map((target) => observeExportTarget(dir, target)));

  const findings = [
    checkM1(dir, manifest),
    checkM2(manifest, kind),
    checkM2SideEffects(manifest, kind),
    checkM3(dir, manifest, exportTargets),
    checkM4(manifest, kind),
    checkM5(manifest),
    checkL1(manifest, layer),
    checkL2(layer),
    checkL3(layer),
    checkL4(dir, manifest),
    checkL5(manifest),
    ...(kind === "jsnode" ? [checkA1(texts), checkA2(texts), sourceA3] : []),
    ...(kind === "jsnode" ? checkLaws(texts) : []),
    ...(kind === "jsnode" ? [checkS6(layer, texts)] : []),
    checkD1(dir),
  ];

  const violationCount = findings.filter((f) => f.status === "violation").length;
  const byConvention = { live: 0, adapted: 0, dead: 0 };
  for (const f of findings) byConvention[f.convention] += 1;

  return Object.freeze({
    type: "JsnodePackageCheckReport",
    packageDir: dir,
    layer,
    packageKind: kind,
    findings: Object.freeze(findings),
    violationCount,
    byConvention: Object.freeze(byConvention),
    cells: witnessedPackageCells(findings, { dir, layer, kind, manifest, manifestSource, texts, checkerSource, exportTargets, uninspectedSourceEntries }),
  });
}
