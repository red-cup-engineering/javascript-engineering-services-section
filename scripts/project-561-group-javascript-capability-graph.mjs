#!/usr/bin/env node
import { basename, resolve } from "node:path";
import { parseArgs } from "node:util";
import { admitEdge, admitNode, createOperationsGraph, isDag, proposeEdge, proposeNode, toDot } from "@red-cup-engineering/computer-content-graph-engineering-services-section/operations-graph";
import { readJavascriptFileImports } from "@red-cup-engineering/javascript-file-import-services-section/read-javascript-file-imports";
import { readJavascriptPackageSources, resolveJavascriptPackageSource } from "../src/javascript-package-sources.mjs";

/** Project executable scripts and their local source dependencies into an operations graph. */
export function project561GroupJavascriptCapabilityGraph(packageDirectory) {
  const root = resolve(packageDirectory);
  const sources = readJavascriptPackageSources(root);
  const sourcePaths = new Set(sources.map(({ path: sourcePath }) => sourcePath));
  const scripts = sources.filter(({ path: sourcePath }) => sourcePath.startsWith("scripts/") && sourcePath.endsWith(".mjs"));
  let graph = createOperationsGraph();
  const packageId = `package:${root}`;
  graph = admitNode(graph, proposeNode({ id: packageId, kind: "javascript-package-carrier", payload: { directory: root } })).operationsGraph;
  const admittedModules = new Set();
  for (const script of scripts) {
    const scriptId = `script:${script.path}`;
    graph = admitNode(graph, proposeNode({ id: scriptId, kind: "javascript-executable", payload: { file: script.path }, acts: [basename(script.path, ".mjs")] })).operationsGraph;
    graph = admitEdge(graph, proposeEdge({ from: packageId, kind: "contains", to: scriptId, evidence: { source: "scripts directory" } })).operationsGraph;
    const localSpecifiers = readJavascriptFileImports(script).imports
      .map(({ specifier }) => specifier)
      .filter((specifier) => specifier.startsWith("."))
      .sort();
    for (const specifier of localSpecifiers) {
      const modulePath = resolveJavascriptPackageSource(script.path, specifier, sourcePaths);
      const moduleId = modulePath.startsWith("scripts/") && sourcePaths.has(modulePath) ? `script:${modulePath}` : `module:${modulePath}`;
      if (!moduleId.startsWith("script:") && !admittedModules.has(moduleId)) {
        graph = admitNode(graph, proposeNode({ id: moduleId, kind: "javascript-source-module", payload: { file: modulePath } })).operationsGraph;
        admittedModules.add(moduleId);
      }
      graph = admitEdge(graph, proposeEdge({ from: scriptId, kind: "imports", to: moduleId, evidence: { specifier } })).operationsGraph;
    }
  }
  return { sourceDirectory: root, graph, isDag: isDag(graph) };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { directory: { type: "string" }, format: { type: "string", default: "json" } } });
  if (!values.directory || !["json", "dot"].includes(values.format)) {
    process.stderr.write("usage: project-561-group-javascript-capability-graph --directory PACKAGE_DIRECTORY [--format json|dot]\n");
    process.exit(1);
  }
  const projection = project561GroupJavascriptCapabilityGraph(values.directory);
  process.stdout.write(values.format === "dot" ? `${toDot(projection.graph)}\n` : `${JSON.stringify(projection)}\n`);
}
