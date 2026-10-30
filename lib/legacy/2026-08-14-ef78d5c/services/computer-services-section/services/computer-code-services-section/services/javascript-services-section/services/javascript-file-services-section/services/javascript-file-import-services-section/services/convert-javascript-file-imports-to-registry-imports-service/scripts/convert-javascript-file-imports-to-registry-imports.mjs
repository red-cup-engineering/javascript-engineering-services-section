#!/usr/bin/env node
import { applyTextFileContentEdits } from "@red-cup-engineering/apply-text-file-content-edits-service";
import { classifyCrossPackageJavascriptFileImport } from "@red-cup-engineering/classify-cross-package-javascript-file-import-service";
import { convertJavascriptFileImportToRegistryImport } from "@red-cup-engineering/convert-javascript-file-import-to-registry-import-service";
import { canonical, parse } from "@red-cup-engineering/json-codec-service";
import { projectNpmPackageDependencyFromCrossPackageImport } from "@red-cup-engineering/project-npm-package-dependency-from-cross-package-import-service";
import { projectNpmPackageEdgeFromCrossPackageImport } from "@red-cup-engineering/project-npm-package-edge-from-cross-package-import-service";
import { projectNpmPackageExportFromCrossPackageImport } from "@red-cup-engineering/project-npm-package-export-from-cross-package-import-service";
import { readJavascriptFileImports } from "@red-cup-engineering/read-javascript-file-imports-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { resolveJavascriptNodeFileImport } from "@red-cup-engineering/resolve-javascript-node-file-import-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

function unique(records, keyOf) {
  return [...new Map(records.map((record) => [keyOf(record), record])).values()];
}

export async function convertJavascriptFileImportsToRegistryImports({ reading, custodies } = {}) {
  if (reading?.type !== "TextFileRead") throw new TypeError("reading must be a TextFileRead carrier");
  if (!Array.isArray(custodies) || custodies.some(({ type }) => type !== "NpmPackageCustody")) throw new TypeError("custodies must be NpmPackageCustody carriers");
  const imports = readJavascriptFileImports(reading);
  const resolutions = await Promise.all(imports.map(resolveJavascriptNodeFileImport));
  const skipped = resolutions.filter(({ type }) => type === "JavascriptNodeFileImportResolutionRefusal");
  const classifications = resolutions
    .filter(({ type }) => type === "ResolvedJavascriptNodeFileImport")
    .map((resolution) => classifyCrossPackageJavascriptFileImport({ resolution, custodies }));
  skipped.push(...classifications.filter(({ type }) => type === "CrossPackageJavascriptFileImportRefusal"));
  const crossPackageImports = classifications.filter(({ type }) => type === "CrossPackageJavascriptFileImport");
  const edits = crossPackageImports.map(convertJavascriptFileImportToRegistryImport);
  const content = applyTextFileContentEdits({ reading, edits });
  const dependencies = unique(crossPackageImports.map(projectNpmPackageDependencyFromCrossPackageImport), ({ manifestPath, dependency }) => `${manifestPath}\n${dependency}`);
  const edges = unique(crossPackageImports.map(projectNpmPackageEdgeFromCrossPackageImport), ({ consumer, provider, providerSubpath }) => `${consumer}\n${provider}\n${providerSubpath}`);
  const exportsByManifest = new Map();
  for (const crossPackageImport of crossPackageImports) {
    const manifestPath = crossPackageImport.provider.manifestPath;
    exportsByManifest.set(manifestPath, projectNpmPackageExportFromCrossPackageImport({ crossPackageImport, prior: exportsByManifest.get(manifestPath) }));
  }
  return Object.freeze({
    type: "JavascriptFileRegistryImportConversion",
    content,
    crossPackageImports: Object.freeze(crossPackageImports),
    dependencies: Object.freeze(dependencies),
    exports: Object.freeze([...exportsByManifest.values()]),
    edges: Object.freeze(edges),
    skipped: Object.freeze(skipped),
  });
}

if (import.meta.main) {
  const input = parse(await readJavascriptNodeStandardInputText({ standardInput: process.stdin }));
  const conversion = await convertJavascriptFileImportsToRegistryImports(input);
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(conversion)}\n` });
}
