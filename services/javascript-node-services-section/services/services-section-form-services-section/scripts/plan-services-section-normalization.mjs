import { dataArtifactStemOf, dataKindDirectory, dataKindOfDirectoryName, dataTierPathSegment, parseArtifactStem, serviceLogAddress } from "@red-cup-engineering/eavt-services-section/data-artifact-address";
import { artifactTiers } from "@red-cup-engineering/eavt-services-section/statement";
import { foldDirectoryEntriesIntoServicesSectionForm } from "./fold-directory-entries-into-services-section-form.mjs";

/** The tiers whose artifacts the data law files under `data/`, in the law's own order. */
const DATA_TIERS = Object.freeze(artifactTiers.map((tier) => tier.name).filter((name) => dataTierPathSegment(name).startsWith("data/")));
const tierSegments = (tier) => dataTierPathSegment(tier).split("/");
const SECTION_SUFFIX = "-services-section";
const HASH_ALGORITHM_SEGMENT = /^sha-?\d+$/iu;

const unplaceable = (rule, reason) => ({ to: null, rule, reason });

/**
 * Where the eavt data law files one tracked path under `data/`. The law owns the answer: the tier
 * directories come from `dataKindDirectory`, a dated service log's address from `serviceLogAddress`.
 * This only recognises the older shapes `data/<tier>/<x>-<tier>/...` (and a bare `<x>-service-<tier>`)
 * and hands `(tier, x)` to the law.
 *
 *   null                         the path is already where the law files it
 *   { to, rule, reason }         the law's path for it
 *   { to: null, rule, reason }   no placement is derived; never moved, reported with its path
 *
 * @param {string} file a tracked path relative to the section
 * @param {{ hirer?: string | null }} [context] the hiring section's name without `-services-section`
 */
export function placeDataPath(file, { hirer = null } = {}) {
  const parts = file.split("/");
  const tier = DATA_TIERS.find((name) => tierSegments(name)[1] === parts[1]);
  if (tier === undefined) return unplaceable("data-fits-no-tier", `${parts.slice(0, 2).join("/")} is not under a tier the data law files (${DATA_TIERS.map(dataTierPathSegment).join(", ")})`);
  if (parts.some((part) => HASH_ALGORITHM_SEGMENT.test(part))) return unplaceable("hash-sharded-not-renamed", "a hash-named shard is reported, not renamed; its writer changes first");
  const lawful = tierSegments(tier).slice(2);
  const consumed = lawful.every((segment, index) => parts[2 + index] === segment);
  const after = parts.slice(2 + (consumed ? lawful.length : 0));
  if (after.length < 2) return unplaceable("data-has-no-service-directory", `${file} sits at the ${tier} tier with no <service> directory`);
  const [name, ...rest] = after;
  const legacy = `-${parts[1]}`;
  const service = dataKindOfDirectoryName(tier, name) ?? (name.endsWith(legacy) && name.length > legacy.length ? name.slice(0, -legacy.length) : null);
  if (service === null) return unplaceable("data-fits-no-service-directory", `${name} is not <service>${legacy}`);
  let directory;
  try { directory = dataKindDirectory("", tier, service); } catch (error) { return unplaceable("data-service-not-a-type-name", error.message); }
  const stem = rest.length === 1 ? dataArtifactStemOf(rest[0]) : "";
  const dated = tier === "log" && rest[0] !== undefined && rest.length === 1 && rest[0] === `${stem}.jsonl` ? parseArtifactStem(stem) : null;
  if (dated !== null) {
    if (hirer === null) return unplaceable("log-hirer-unknown", `${file} is a dated log, but its section's name does not end in ${SECTION_SUFFIX}, so no hirer is derived`);
    try { return moved(file, serviceLogAddress({ root: "", hirer, service, at: dated.date }).path); } catch (error) { return unplaceable("log-address-not-derivable", error.message); }
  }
  return moved(file, [directory, ...rest].join("/"));
}

const moved = (file, to) => (to === file ? null : { to, rule: "eavt-data-law", reason: "the data law files this at the path derived from its tier and service" });

/** The hirer of a section's service logs: its name without `-services-section`, or null for any other name. */
export function hirerOf(sectionPath) {
  const name = String(sectionPath).split("/").filter(Boolean).at(-1) ?? "";
  return name.endsWith(SECTION_SUFFIX) && name.length > SECTION_SUFFIX.length ? name.slice(0, -SECTION_SUFFIX.length) : null;
}

/**
 * Plan how one section's files move into the form its law describes. Pure: it reads only the
 * already-listed entries and the Group's content taxonomy, and returns one item per file:
 *
 *   { from, to, rule, reason }   `to` is the derived destination, or null when no rule derives one
 *                                and the resource's owner must decide.
 *
 * The relocations are the Group's data (`contentTaxonomy.relocations`, each `{ from, to, rule, reason }`
 * with directory prefixes relative to the section), and so are the prefixes no rule can place
 * (`contentTaxonomy.unplaceable`). This code only applies them, together with what `fold` already
 * judges: top-level entries the law does not know and `test/` in a section that has no code.
 * Everything under `data/` is the eavt data law's (`placeDataPath`), including a relocation whose
 * destination is under `data/`. Two paths bound for one destination are both reported, never merged.
 * A path segment that is an opaque hash is reported as well, since the Leader wants named files
 * ("the files shouldn't have opaque hashes like this").
 *
 * @param {{ path: string, entries: string[], packageJson?: object, gitlinks?: Iterable<string> }} request
 * @param {object} contentTaxonomy
 * @returns {ReadonlyArray<{ from: string, to: string | null, rule: string, reason: string }>}
 */
export function planServicesSectionNormalization(request, contentTaxonomy) {
  const form = foldDirectoryEntriesIntoServicesSectionForm(request, contentTaxonomy);
  const files = request.entries.filter((entry) => !entry.endsWith("/"));
  const relocations = [...(contentTaxonomy.relocations ?? [])].sort((a, b) => b.from.length - a.from.length);
  const unplaceable = [...(contentTaxonomy.unplaceable ?? [])].sort((a, b) => b.from.length - a.from.length);
  const stray = new Set(form.stray);
  const gitlinks = new Set(request.gitlinks ?? []);
  const hirer = hirerOf(request.path);
  const hasCode = form.code.src.length + form.code.scripts.length + form.code.apps.length > 0;
  const items = [];

  for (const file of files) {
    const top = file.split("/")[0];
    const relocation = top === "data" ? undefined : relocations.find((entry) => file.startsWith(entry.from));
    const unplaced = relocation ? undefined : unplaceable.find((entry) => file.startsWith(entry.from));
    let reportedShard = false;
    if (top === "data") {
      const placement = placeDataPath(file, { hirer });
      if (placement !== null) items.push({ from: file, ...placement });
      reportedShard = placement?.rule === "hash-sharded-not-renamed";
    } else if (relocation) {
      const to = relocation.to + file.slice(relocation.from.length);
      const placement = to.startsWith("data/") ? placeDataPath(to, { hirer }) : null;
      if (placement === null) items.push({ from: file, to, rule: relocation.rule, reason: relocation.reason });
      else items.push({ from: file, to: placement.to, rule: placement.to === null ? placement.rule : relocation.rule, reason: placement.to === null ? `${relocation.rule} bound it for ${to}: ${placement.reason}` : relocation.reason });
    } else if (unplaced) items.push({ from: file, to: null, rule: unplaced.rule, reason: unplaced.reason });
    else if (stray.has(top)) items.push({ from: file, to: null, rule: "stray-top-level", reason: `${top}/ is not an entry the services-section law knows; its owner decides where it belongs` });
    else if (top === "test" && !hasCode) items.push({ from: file, to: null, rule: "tests-live-with-their-code", reason: "this section has no src, scripts or apps; a test belongs with the code it tests" });
    const opaque = file.split("/").find(isOpaqueName);
    if (opaque && !reportedShard) items.push({ from: file, to: null, rule: "named-not-hashed", reason: `${opaque} is an opaque hash, not a name` });
  }

  const occupied = new Set(files);
  const bound = new Map();
  for (const item of items) if (item.to !== null) bound.set(item.to, (bound.get(item.to) ?? 0) + 1);
  for (const item of items) {
    if (item.to === null) continue;
    if (gitlinks.has(item.from)) Object.assign(item, { to: null, rule: "gitlink-not-moved", reason: `${item.from} is a submodule; its owner moves it` });
    else if (bound.get(item.to) > 1) Object.assign(item, { to: null, rule: "destination-collision", reason: `${bound.get(item.to)} paths are bound for ${item.to}; none is moved` });
    else if (occupied.has(item.to)) Object.assign(item, { to: null, rule: "destination-occupied", reason: `${item.to} is already tracked` });
  }
  return Object.freeze(items.map((item) => Object.freeze(item)));
}

/** A path segment is opaque when its stem is a long hex or base64url token with no word boundary. */
export function isOpaqueName(segment) {
  const stem = String(segment).replace(/\.[^.]*$/u, "");
  return /^[0-9a-f]{16,}$/iu.test(stem) || (/^[A-Za-z0-9_]{20,}$/u.test(stem) && /\d/u.test(stem));
}

/**
 * Plan one section's normalization from its own git index (never a directory walk) under the law read from the
 * repository root.
 * @param {{root: string, section: string}} request The repository root and the section's repository-relative path.
 * @returns {Promise<{type: "ServicesSectionNormalizationPlan", section: string, items: ReadonlyArray<object>}>}
 */
export async function planServicesSectionNormalizationAt({ root, section: sectionPath }) {
  const { execFileSync } = await import("node:child_process");
  const { readFileSync, existsSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const { readServicesSectionLaw } = await import("./read-services-section-law.mjs");
  const section = resolve(root, sectionPath);
  const staged = execFileSync("git", ["-C", section, "ls-files", "-s", "-z", "--", "."], { encoding: "utf8", maxBuffer: 1 << 28 }).split("\0").filter(Boolean).map((line) => ({ mode: line.slice(0, 6), path: line.slice(line.indexOf("\t") + 1) }));
  const entries = staged.map((entry) => entry.path);
  const gitlinks = staged.filter((entry) => entry.mode === "160000").map((entry) => entry.path);
  const packageFile = resolve(section, "package.json");
  const packageJson = existsSync(packageFile) ? JSON.parse(readFileSync(packageFile, "utf8")) : undefined;
  const { contentTaxonomy } = await readServicesSectionLaw(resolve(root));
  const items = planServicesSectionNormalization({ path: sectionPath, entries, packageJson, gitlinks }, contentTaxonomy);
  return { type: "ServicesSectionNormalizationPlan", section: sectionPath, items };
}

export const operationDefinition = Object.freeze({
  name: "planServicesSectionNormalization",
  description: "Plans how one section's tracked files move into the form its law describes; each item names its derived destination, or none for its owner to decide.",
  inputSchema: { type: "object", required: ["root", "section"], properties: { root: { type: "string", minLength: 1 }, section: { type: "string", minLength: 1 } } },
  outputSchema: { type: "object", required: ["type", "section", "items"], properties: { type: { const: "ServicesSectionNormalizationPlan" } } },
});

// plan-services-section-normalization <repository root> <section path>
if (import.meta.main) {
  const [root, section] = process.argv.slice(2);
  if (!root || !section) { console.error("usage: plan-services-section-normalization <repository root> <section path>"); process.exit(2); }
  process.stdout.write(JSON.stringify(await planServicesSectionNormalizationAt({ root, section }), null, 2) + "\n");
}
