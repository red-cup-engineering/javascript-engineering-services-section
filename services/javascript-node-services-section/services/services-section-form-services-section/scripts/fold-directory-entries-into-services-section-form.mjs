#!/usr/bin/env node
import {agencyPathReading}from"../src/agency-layout.mjs";
import { pathBasename as projectFilepathBasename } from "@red-cup-engineering/computer-filepath-engineering-services-section/posix";
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";
import { findServicesSectionRepositoryRoot, readServicesSectionLaw } from "./read-services-section-law.mjs";
import { checkServicesSectionFormConformance } from "./check-services-section-form-conformance.mjs";
import { sectionCustody } from "./derive-services-section-path.mjs";

export const operationDefinition = Object.freeze({
  name: "foldDirectoryEntriesIntoServicesSectionForm",
  description: "Folds a section's path, its already-listed relative entries, and its already-parsed package.json into a ServicesSectionForm record — a pure transformation over its request, using explicitly supplied content-taxonomy law.",
  inputSchema: {
    type: "object",
    required: ["path", "entries"],
    properties: {
      path: { type: "string", minLength: 1 },
      entries: { type: "array", items: { type: "string" } },
      packageJson: { anyOf: [{ type: "object" }, { type: "null" }] },
    },
  },
  outputSchema: { type: "object" },
});

/**
 * Folds a section's path, its already-listed relative entries, and its already-parsed package.json into a ServicesSectionForm record — a pure transformation over its request; the consumer supplies the applicable content taxonomy and no filesystem access occurs.
 * @param {object} request A record with `path` (repository-relative section path, used only for name and custody derivation), `entries` (an array of relative file/directory paths under the section; directories carry a trailing "/"), and optional `packageJson` (the already-parsed package.json object).
 * @param {object} contentTaxonomy The applicable Group content-taxonomy law.
 * @returns {object} A ServicesSectionForm record: type, version, path, name, custody, readme, package, content, code, data, services, legacy, stray, laws.
 * @throws {TypeError} When path is not a non-empty string, or entries is not an array of strings.
 */
export function foldDirectoryEntriesIntoServicesSectionForm(request, contentTaxonomy) {
  if (typeof request?.path !== "string" || request.path.length === 0) throw new TypeError("path is required");
  if (!Array.isArray(request?.entries) || !request.entries.every((entry) => typeof entry === "string")) {
    throw new TypeError("entries must be an array of strings");
  }
  if (typeof contentTaxonomy !== "object" || contentTaxonomy === null) throw new TypeError("contentTaxonomy must be supplied explicitly");
  const sectionPath = request.path;
  const entries = request.entries;
  const packageJson = request.packageJson ?? null;

  const name = projectFilepathBasename(sectionPath);
  // A path outside the five custody roots derives no custody; the law then reports it rather than a default hiding it.
  const custody = sectionCustody(sectionPath);

  const topSegment = (entry) => entry.split("/")[0];
  const topSegments = (() => {
    const seen = [];
    for (const entry of entries) {
      const segment = topSegment(entry);
      if (segment.length > 0 && !seen.includes(segment)) seen.push(segment);
    }
    return seen;
  })();

  const directChildFiles = (prefix, isMatch) => {
    const names = [];
    for (const entry of entries) {
      if (!entry.startsWith(prefix)) continue;
      const rest = entry.slice(prefix.length);
      if (rest.length === 0 || rest.includes("/")) continue;
      if (isMatch(rest)) names.push(rest);
    }
    return names;
  };
  const countDirectChildFiles = (prefix, isMatch) => directChildFiles(prefix, isMatch).length;
  const isMdFile = (rest) => rest.endsWith(".md");
  const isMjsOrMtsFile = (rest) => rest.endsWith(".mjs") || rest.endsWith(".mts");
  const isTestFile = (rest) => rest.endsWith(".test.mjs") || rest.endsWith(".test.mts");

  const readmePresent = entries.includes("README.md");

  const packagePresent = entries.includes("package.json");
  const packageForm = { present: packagePresent };
  if (packagePresent && packageJson !== null && typeof packageJson === "object") {
    if (typeof packageJson.name === "string") packageForm.name = packageJson.name;
    if (typeof packageJson.version === "string") packageForm.version = packageJson.version;
    if (typeof packageJson.type === "string") packageForm.type = packageJson.type;
    if (packageJson.exports !== undefined) packageForm.exports = packageJson.exports;
    if (packageJson.bin !== undefined) packageForm.bin = packageJson.bin;
    const versions = [
      ...Object.values(packageJson.dependencies ?? {}),
      ...Object.values(packageJson.devDependencies ?? {}),
    ];
    packageForm.dependenciesExactPins = versions.every((v) => typeof v === "string" && /^\d/u.test(v));
  }

  const contentPresent = topSegments.includes("content");
  const notesPattern = new RegExp(contentTaxonomy.notesDatedPathPattern, "u");
  const notesCount = entries.filter((entry) => notesPattern.test(entry)).length;
  const taxonomyPaths = contentTaxonomy.contentTaxonomyPaths;

  const content = {
    present: contentPresent,
    text: {
      glossary: {
        terms: countDirectChildFiles(taxonomyPaths.glossaryTerms, isMdFile),
        concepts: countDirectChildFiles(taxonomyPaths.glossaryConcepts, isMdFile),
        topics: countDirectChildFiles(taxonomyPaths.glossaryTopics, isMdFile),
      },
      documents: {
        articles: {
          notes: notesCount,
          teachingArticles: {
            explanations: countDirectChildFiles(taxonomyPaths.teachingArticleExplanations, isMdFile),
            guides: countDirectChildFiles(taxonomyPaths.teachingArticleGuides, isMdFile),
            references: countDirectChildFiles(taxonomyPaths.teachingArticleReferences, isMdFile),
            tutorials: countDirectChildFiles(taxonomyPaths.teachingArticleTutorials, isMdFile),
          },
          specifications: countDirectChildFiles(taxonomyPaths.specifications, isMdFile),
          bibliographies: countDirectChildFiles(taxonomyPaths.bibliographies, isMdFile),
          researchArticles: countDirectChildFiles(taxonomyPaths.researchArticles, isMdFile),
        },
      },
    },
  };

  const firstLevelNames = (prefix) => {
    const seen = [];
    for (const entry of entries) {
      if (!entry.startsWith(prefix)) continue;
      const rest = entry.slice(prefix.length);
      if (rest.length === 0) continue;
      const segment = rest.split("/")[0];
      if (segment.length > 0 && !seen.includes(segment)) seen.push(segment);
    }
    return seen;
  };

  // An app is a directory (apps/<topic>-engine/, -server/, -platform/); a bare module under apps/ is seen too, so the
  // law can name it as the misfit it is.
  const code = {
    src: directChildFiles("src/", isMjsOrMtsFile),
    scripts: directChildFiles("scripts/", isMjsOrMtsFile),
    apps: firstLevelNames("apps/"),
    test: directChildFiles("test/", isTestFile),
  };

  const dataPresent = topSegments.includes("data");
  const dataTopNames = firstLevelNames("data/");
  const trio = new Set(contentTaxonomy.dataTrioNames);
  // A listing may contain explicit directory entries or just descendant files.
  // The bare entry data/logs is a file, even though its name is in the trio.
  const dataDirectoryPresent = (name) => entries.some((entry) => entry.startsWith(`data/${name}/`));
  const data = {
    present: dataPresent,
    logs: dataDirectoryPresent("logs"),
    records: dataDirectoryPresent("records"),
    state: dataDirectoryPresent("state"),
    other: dataTopNames.filter((entry) => !trio.has(entry) || entries.includes(`data/${entry}`)),
  };

  const services = firstLevelNames("services/");
  const legacy = firstLevelNames("lib/legacy/");

  const known = new Set(contentTaxonomy.knownTopLevelNames);
  const stray = topSegments.filter((segment) => !known.has(segment));

  const laws = {
    dataTrioOnly: true,
    scriptsVerbNounNaming: true,
    appsComposeScripts: true,
    oneTopicPerSection: true,
    contentUnderContentText: true,
    notesDatedPath: true,
    noRootWorkspaceFiles: true,
    legacyIsRevivalInventory: true,
    uniformAgency: true,
  };

  return {
    type: "ServicesSectionForm",
    version: 1,
    path: sectionPath,
    name,
    custody,
    readme: { present: readmePresent },
    package: packageForm,
    content,
    code,
    data,
    services,
    legacy,
    agency:agencyPathReading(entries),
    stray,
    laws,
  };
}

if (import.meta.main) {
  let law;
  const operation = async (request) => {
    law ??= readServicesSectionLaw(await findServicesSectionRepositoryRoot(process.cwd()));
    const { schema, contentTaxonomy } = await law;
    const form = foldDirectoryEntriesIntoServicesSectionForm(request, contentTaxonomy);
    const receiving = checkServicesSectionFormConformance(form, schema);
    if (!receiving.conformant) throw new Error(JSON.stringify(receiving.obstructions));
    return form;
  };
  process.exitCode = (await runJavascriptNodeOperation(
    { ...operationDefinition, operation },
    { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout },
  )).exitCode;
}
