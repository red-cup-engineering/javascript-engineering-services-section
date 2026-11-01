#!/usr/bin/env node
import { relative, resolve } from "node:path";
import { readFileText } from "@red-cup-engineering/computer-file-engineering-services-section/read-file";
import { walkPosixPaths } from "@red-cup-engineering/computer-filepath-engineering-services-section/walk-posix-paths";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";
import { findServicesSectionRepositoryRoot, readServicesSectionLaw } from "./read-services-section-law.mjs";
import { foldDirectoryEntriesIntoServicesSectionForm } from "./fold-directory-entries-into-services-section-form.mjs";
import { readServiceSection } from "../src/service-section.mjs";

// The same directories the agency read skips: dependencies, history, revival inventory and build
// output are not part of any section's standing form.
const EXCLUDES = Object.freeze(["node_modules", ".git", ".pnpm-store", "legacy", "_archive", "dist", ".cache", ".tmp", "coverage"]);
// A section's own package is its root manifest; the units it deploys (apps, sites, deployments,
// tools) are packages it holds one directory down.
const HELD_PACKAGE = /^(?:(?:apps|sites|deployments|tools)\/[^/]+\/)?package\.json$/u;
const SERVICE_SECTION_DOCUMENT = "data/records/service-section.json";
// The form reads data/ only to its kind directories (data/<tier>/<kind>/) and the Service Section document; a
// snapshot's interior is the record's content, never more sections or more form.
const DATA_DEPTH = 3;

export const operationDefinition = Object.freeze({
  name: "readServicesSectionTree",
  description: "Reads each services section's directory form, README and manifests, and its source-qualified Service Section document when present, in one walk of the root.",
  inputSchema: {
    type: "object",
    required: ["root"],
    properties: { root: { type: "string", minLength: 1 } },
  },
  outputSchema: {
    type: "object",
    required: ["type", "version", "root", "sections"],
    properties: {
      type: { const: "ServicesSectionTree" },
      version: { const: 1 },
      root: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          required: ["form", "readme", "packageJson", "packages", "serviceSection"],
          properties: {
            form: { type: "object" },
            readme: { anyOf: [{ type: "string" }, { type: "null" }] },
            packageJson: { anyOf: [{ type: "object" }, { type: "null" }] },
            serviceSection: { anyOf: [{ type: "object" }, { type: "null" }] },
            packages: {
              type: "array",
              items: { type: "object", required: ["path", "manifest"], properties: { path: { type: "string" }, manifest: { type: "object" } } },
            },
          },
        },
      },
    },
  },
});

/**
 * The section a repository-relative path stands in: the deepest prefix of an unbroken services/<name>/services/<name>
 * chain from the repository root. A services/ directory anywhere else (in data/, lib/, apps/) is not a section.
 */
function sectionOf(parts, end) {
  let section;
  for (let index = 1; index < end && parts[index - 1] === "services"; index += 2) section = parts.slice(0, index + 1).join("/");
  return section;
}

/** The entry a section's form reads for one of its files, or undefined when the form reads none of it. */
function formEntry(entry) {
  const parts = entry.split("/");
  if (parts[0] !== "data" || parts.length <= DATA_DEPTH || entry === SERVICE_SECTION_DOCUMENT) return entry;
  return `${parts.slice(0, DATA_DEPTH).join("/")}/`;
}

const readManifest = async (path) => {
  try { return JSON.parse(await readFileText(path)); }
  catch (error) { if (error?.code === "ENOENT" || error instanceof SyntaxError) return null; throw error; }
};

const readOptional = async (path) => {
  try { return await readFileText(path); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
};

/**
 * Reads every services section under a root — each directory on an unbroken services/<name> chain from the repository root — into its ServicesSectionForm record, with the README and package manifest it describes itself by, in one walk of the root.
 * @param {object} request A record with `root` (the directory the section paths are relative to).
 * @returns {Promise<object>} A ServicesSectionTree with each section's directory form, README, manifests and source-qualified `serviceSection` reading (null when no document is present). A present invalid document refuses through its original reader; it is not reported as absent. The form remains the directory observation under the Group's law.
 * @throws {TypeError} When root is not a non-empty string.
 */
export async function readServicesSectionTree(request) {
  if (typeof request?.root !== "string" || request.root.length === 0) throw new TypeError("root is required");
  const root = resolve(request.root);
  const repositoryRoot = await findServicesSectionRepositoryRoot(root);
  const { contentTaxonomy } = await readServicesSectionLaw(repositoryRoot);
  // Section paths are repository-relative, as the law's `path` is, wherever in the forest the read starts.
  const prefix = relative(repositoryRoot, root).split("\\").join("/");
  const entriesOf = new Map();
  const enter = (section) => {
    if (entriesOf.has(section)) return;
    entriesOf.set(section, new Set());
    const parts = section.split("/");
    const parent = sectionOf(parts, parts.length - 1);
    if (parent === undefined) return;
    enter(parent);
    entriesOf.get(parent).add(`${section.slice(parent.length + 1)}/`);
  };
  // Each file is folded into its section's entries as the walk reaches it; the walk itself retains no file list,
  // so a forest's size in records does not bound what can be read.
  const receive = (walked) => {
    if (walked.kind !== "file" && walked.kind !== "symlink") return;
    const file = prefix === "" ? walked.path : `${prefix}/${walked.path}`;
    const parts = file.split("/");
    const section = sectionOf(parts, parts.length - 1);
    if (section === undefined) return;
    enter(section);
    entriesOf.get(section).add(formEntry(file.slice(section.length + 1)));
  };
  // The form reads data/ only to its kind directories, so the walk stops there: a kind directory is its entry, and
  // nothing inside it (snapshots, logs, copied runtimes) is read. A directory the host cannot read is skipped.
  const descend = (directory) => {
    const path = prefix === "" ? directory.path : `${prefix}/${directory.path}`;
    const parts = path.split("/");
    const section = sectionOf(parts, parts.length);
    if (section === undefined || section === path) return true;
    const inner = path.slice(section.length + 1).split("/");
    if (inner[0] !== "data" || inner.length < DATA_DEPTH) return true;
    enter(section);
    entriesOf.get(section).add(`${inner.slice(0, DATA_DEPTH).join("/")}/`);
    return false;
  };
  await walkPosixPaths({ root, excludes: [...EXCLUDES], result: "paths", includeFile: () => false, includeDirectory: descend,
    unreadable: "skip", inspectEntry: receive });
  const at = (path, entry) => resolve(repositoryRoot, path, entry);
  const sections = await Promise.all([...entriesOf.keys()].sort().map(async (path) => {
    const entries = [...entriesOf.get(path)];
    const [readme, held, serviceSection] = await Promise.all([
      entries.includes("README.md") ? readOptional(at(path, "README.md")) : null,
      Promise.all(entries.filter((entry) => HELD_PACKAGE.test(entry)).sort().map(async (entry) => ({
        path: entry.slice(0, -"package.json".length).replace(/\/$/u, ""),
        manifest: await readManifest(at(path, entry)),
      }))),
      entries.includes(SERVICE_SECTION_DOCUMENT)
        ? readFileText(at(path, SERVICE_SECTION_DOCUMENT))
          .then(text => readServiceSection(JSON.parse(text)))
        : null,
    ]);
    const packages = held.filter((held) => held.manifest !== null).map(Object.freeze);
    const packageJson = packages.find((held) => held.path === "")?.manifest ?? null;
    return Object.freeze({ form: foldDirectoryEntriesIntoServicesSectionForm({ path, entries, packageJson }, contentTaxonomy), readme, packageJson, packages: Object.freeze(packages), serviceSection });
  }));
  return Object.freeze({ type: "ServicesSectionTree", version: 1, root, sections: Object.freeze(sections) });
}

if (import.meta.main) {
  process.exitCode = (await runJavascriptNodeOperation(
    { ...operationDefinition, operation: readServicesSectionTree },
    { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout },
  )).exitCode;
}
