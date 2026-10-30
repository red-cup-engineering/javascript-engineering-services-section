#!/usr/bin/env node
import { applyNpmPackageDependencyProjection } from "@red-cup-engineering/apply-npm-package-dependency-projection-service";
import { applyNpmPackageExportsProjection } from "@red-cup-engineering/apply-npm-package-exports-projection-service";
import { convertJavascriptFileImportsToRegistryImports } from "@red-cup-engineering/convert-javascript-file-imports-to-registry-imports-service";
import { canonical } from "@red-cup-engineering/json-codec-service";
import { normalizeJsnodePackageDependencies } from "@red-cup-engineering/npm-package-dependency-normalization-service";
import { observeNpmPackageDirectories } from "@red-cup-engineering/npm-package-directory-observation-service";
import { normalizeJsnodePackageIdentity } from "@red-cup-engineering/npm-package-identity-normalization-service";
import { normalizeJsnodePackageIdentityReferences } from "@red-cup-engineering/npm-package-identity-reference-normalization-service";
import { normalizeJsnodePackageManifest } from "@red-cup-engineering/npm-package-manifest-normalization-service";
import { projectJsnodePackageOwner } from "@red-cup-engineering/npm-package-owner-projection-service";
import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { projectNpmPackageCustody } from "@red-cup-engineering/project-npm-package-custody-service";
import { readJsnodePackageBody } from "@red-cup-engineering/read-jsnode-package-body-service";
import { readTextFile } from "@red-cup-engineering/read-text-file-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";
import { writeTextFile } from "@red-cup-engineering/write-text-file-service";
import { dirname, resolve } from "node:path";

const DEFAULT_EXCLUDES = Object.freeze(["node_modules", ".git", "legacy", "content", "data", "dev", "dist", "test", "tests"]);

export async function normalizeJsnodePackageBody({ root = process.cwd(), excludes = DEFAULT_EXCLUDES, apply = false } = {}) {
  const packageSet = await observeNpmPackageDirectories({ root, excludes });
  const observed = await readJsnodePackageBody(packageSet);
  const absoluteRoot = observed.root;
  const packages = observed.packages;
  const duplicateOld = Object.entries(Object.groupBy(packages, ({ manifest }) => manifest.name ?? "")).filter(([name, rows]) => !name || rows.length > 1);
  if (duplicateOld.length) throw new Error(`active package identities are ambiguous: ${duplicateOld.map(([name]) => name || "<unnamed>").join(", ")}`);

  const identities = packages.map(({ path, manifest }) => {
    const ownerProjection = projectJsnodePackageOwner(resolve(absoluteRoot, path));
    const identity = normalizeJsnodePackageIdentity({ packageName: manifest.name, owner: ownerProjection.owner });
    const normalizedManifest = normalizeJsnodePackageManifest({ manifest, identity });
    return { ...identity, version: normalizedManifest.version, path, root: absoluteRoot, ownerProjection };
  });
  const collisions = Object.entries(Object.groupBy(identities, ({ name }) => name)).filter(([, rows]) => rows.length > 1);
  if (collisions.length) throw new Error(`normalized package identities collide: ${collisions.map(([name, rows]) => `${name} <= ${rows.map(({ priorName, path }) => `${priorName} at ${path}`).join(" | ")}`).join("; ")}`);

  const identitiesByName = new Map(identities.map((identity) => [identity.priorName, identity]));
  const identitiesByDirectory = new Map(identities.map((identity) => [dirname(resolve(absoluteRoot, identity.path)), identity]));
  const byLeaf = Object.groupBy(identities, ({ leaf }) => leaf);
  for (const [leaf, rows] of Object.entries(byLeaf)) if (rows.length === 1) identitiesByName.set(`@emsenn/${leaf}`, rows[0]);
  const replacements = [...identitiesByName.entries()].map(([before, identity]) => [before, identity.name]).filter(([before, after]) => before !== after).sort((left, right) => right[0].length - left[0].length);

  const rows = packages.map(({ path, manifest }) => {
    const identity = identitiesByName.get(manifest.name);
    let after = normalizeJsnodePackageManifest({ manifest, identity });
    after = normalizeJsnodePackageDependencies({ manifest: after, manifestPath: path, root: absoluteRoot, providersByName: identitiesByName, providersByDirectory: identitiesByDirectory });
    const { "x-semiotic-voxel": voxel, "x-agentic-metro-enterprise": enterprise, ...cleaned } = after;
    return { path, before: manifest, after: cleaned, identity };
  });
  const rowByManifestPath = new Map(rows.map((row) => [resolve(absoluteRoot, row.path), row]));
  const sourceRewrites = [];
  const edges = new Map();
  const refusals = [];

  for (const relativePath of observed.sourceFiles) {
    const reading = await readTextFile({ path: resolve(absoluteRoot, relativePath) });
    const custodies = rows.map((row) => projectNpmPackageCustody({
      type: "NpmPackageManifestRead",
      path: resolve(absoluteRoot, row.path),
      manifest: row.after,
    }));
    const conversion = await convertJavascriptFileImportsToRegistryImports({ reading, custodies });
    for (const projection of conversion.dependencies) {
      const consumer = rowByManifestPath.get(projection.manifestPath);
      if (consumer) consumer.after = applyNpmPackageDependencyProjection({ manifest: consumer.after, projection });
    }
    for (const projection of conversion.exports) {
      const provider = rowByManifestPath.get(projection.manifestPath);
      if (provider) provider.after = applyNpmPackageExportsProjection({ manifest: provider.after, projection });
    }
    for (const edge of conversion.edges) edges.set(canonical(edge), edge);
    refusals.push(...conversion.skipped);
    const text = normalizeJsnodePackageIdentityReferences({ source: conversion.content.text, replacements });
    if (text !== reading.text) sourceRewrites.push({ type: "TextFileContentProjection", path: reading.path, before: reading.text, text });
  }

  const manifestRewrites = rows.filter(({ before, after }) => canonical(before) !== canonical(after)).map(({ path, before, after }) => Object.freeze({
    type: "TextFileContentProjection",
    path: resolve(absoluteRoot, path),
    before: `${canonical(before)}\n`,
    text: `${canonical(after)}\n`,
  }));
  if (apply) await Promise.all([
    ...manifestRewrites.map(writeTextFile),
    ...sourceRewrites.map(writeTextFile),
  ]);
  const packageEdges = Object.freeze([...edges.values()]);
  return Object.freeze({
    type: "JsnodePackageBodyNormalizationReceipt",
    version: 1,
    applied: apply,
    packages: rows.length,
    manifestFilesChanged: manifestRewrites.length,
    identitiesChanged: rows.filter(({ before, after }) => before.name !== after.name).length,
    identityAliasesKnown: replacements.length,
    consumerFilesChanged: sourceRewrites.length,
    packageContractEdgesChanged: packageEdges.length,
    manifestProjections: Object.freeze(manifestRewrites),
    sourceProjections: Object.freeze(sourceRewrites),
    packageEdges,
    refusals: Object.freeze(refusals),
  });
}

if (import.meta.main) {
  const parsed = parseJavascriptArgv({ argumentVector: process.argv, options: { apply: { type: "boolean", default: false }, exclude: { type: "string", multiple: true } }, allowPositionals: true });
  if (parsed.positionals.length > 1) throw new TypeError("usage: normalize-jsnode-package-body [ROOT] [--exclude SEGMENT]... [--apply]");
  const receipt = await normalizeJsnodePackageBody({ root: parsed.positionals[0] ?? process.cwd(), excludes: parsed.options.exclude ?? DEFAULT_EXCLUDES, apply: parsed.options.apply });
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(receipt)}\n` });
}
