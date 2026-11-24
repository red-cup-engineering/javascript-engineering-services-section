import path from "node:path";

import {
  discoverWorkspace,
  egoGraph,
  workspaceAnalysis,
  workspaceDependencyGraph,
  workspaceTypeIndex,
} from "@red-cup-engineering/jsnode-computer";
import {
  eachWorkspacePackageDir,
  readJSNodePackage,
} from "@red-cup-engineering/jsnode-computer/workspace";

function textParam(params, ...names) {
  for (const name of names) {
    const value = params?.[name];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

function limitParam(value, fallback = 80) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(500, parsed)) : fallback;
}

function packageAliases(repoRoot, pkg) {
  const relative = path.relative(repoRoot, pkg.dir).split(path.sep).join("/");
  return new Set([pkg.name, relative, `./${relative}`, path.basename(relative)]);
}

function resolvePackage(repoRoot, requested) {
  if (requested === undefined) return undefined;
  return [...eachWorkspacePackageDir(repoRoot)].find((pkg) => packageAliases(repoRoot, pkg).has(requested));
}

function matches(value, query) {
  return query === undefined || value.toLowerCase().includes(query.toLowerCase());
}

/** Read one current JSNode package carrier by name or repository-relative path. */
export async function read561GroupJSNodePackage(repoRoot, params = {}) {
  const requested = textParam(params, "package", "name", "focus", "q");
  if (requested === undefined) throw new TypeError("package, name, focus, or q is required");
  const discovered = resolvePackage(repoRoot, requested);
  if (discovered === undefined) throw new Error(`jsnode package not found: ${requested}`);
  const pkg = await readJSNodePackage(discovered.dir, { introspect: params.introspect === true || params.introspect === "true" || params.introspect === "1" });
  if (pkg === undefined) throw new Error(`jsnode package became unreadable: ${requested}`);
  return Object.freeze({
    type: "JSNodePackageRead",
    version: 1,
    requested,
    directory: discovered.dir,
    package: pkg,
  });
}

/** Read one declared package export subpath as a JSNode module view. */
export async function read561GroupJSNodeModule(repoRoot, params = {}) {
  const packageRead = await read561GroupJSNodePackage(repoRoot, params);
  const requestedModule = textParam(params, "module", "subpath") ?? ".";
  const normalizedModule = requestedModule === "." || requestedModule.startsWith("./")
    ? requestedModule
    : `./${requestedModule}`;
  return Object.freeze({
    type: "JSNodeModuleRead",
    version: 1,
    package: packageRead.package.name,
    directory: packageRead.directory,
    module: normalizedModule,
    declared: packageRead.package.exports.includes(normalizedModule),
    availableModules: packageRead.package.exports,
  });
}

function readApiSlice(repoRoot, params, kind) {
  const index = workspaceTypeIndex(repoRoot);
  const requested = textParam(params, "package", "pkg", "focus");
  const discovered = resolvePackage(repoRoot, requested);
  const packageName = discovered?.name ?? requested;
  const query = textParam(params, "match", "q", "name");
  const limit = limitParam(params.limit);
  const records = (kind === "types" ? index.types : index.functions)
    .filter((record) => packageName === undefined || record.pkg === packageName)
    .filter((record) => matches(record.name, query))
    .slice(0, limit);
  return Object.freeze({
    type: kind === "types" ? "JSNodeTypesRead" : "JSNodeFunctionsRead",
    version: 1,
    filters: Object.freeze({ package: packageName ?? null, match: query ?? null, limit }),
    total: records.length,
    [kind]: Object.freeze(records),
  });
}

/** Read attributed types from built declaration surfaces. */
export function read561GroupJSNodeTypes(repoRoot, params = {}) {
  return readApiSlice(repoRoot, params, "types");
}

/** Read attributed functions from built declaration surfaces. */
export function read561GroupJSNodeFunctions(repoRoot, params = {}) {
  return readApiSlice(repoRoot, params, "functions");
}

/** Read one named type or function from the current attributed API surface. */
export function read561GroupJSNodeSymbol(repoRoot, params = {}) {
  const name = textParam(params, "symbol", "name", "q");
  if (name === undefined) throw new TypeError("symbol, name, or q is required");
  const packageName = resolvePackage(repoRoot, textParam(params, "package", "pkg", "focus"))?.name
    ?? textParam(params, "package", "pkg", "focus");
  const index = workspaceTypeIndex(repoRoot);
  const types = index.types.filter((record) => record.name === name && (packageName === undefined || record.pkg === packageName));
  const functions = index.functions.filter((record) => record.name === name && (packageName === undefined || record.pkg === packageName));
  return Object.freeze({
    type: "JSNodeSymbolRead",
    version: 1,
    package: packageName ?? null,
    name,
    types: Object.freeze(types),
    functions: Object.freeze(functions),
    found: types.length + functions.length > 0,
  });
}

/** Read the current package dependency graph, optionally focused to an ego graph. */
export async function read561GroupJSNodeWorkspaceGraph(repoRoot, params = {}) {
  const workspace = await discoverWorkspace(repoRoot);
  const graph = workspaceDependencyGraph(workspace);
  const requested = textParam(params, "package", "name", "focus", "q");
  const discovered = resolvePackage(repoRoot, requested);
  const focus = discovered?.name ?? requested;
  const selected = focus === undefined
    ? graph
    : egoGraph(graph, focus, {
        upDepth: limitParam(params.up, 1),
        downDepth: limitParam(params.down, 1),
      });
  return Object.freeze({
    type: "JSNodeWorkspaceGraphRead",
    version: 1,
    root: path.resolve(repoRoot),
    focus: focus ?? null,
    graph: selected,
  });
}

/** Analyze the current workspace dependency topology. */
export async function topologize561GroupJSNode(repoRoot) {
  const workspace = await discoverWorkspace(repoRoot);
  const graph = workspaceDependencyGraph(workspace);
  return Object.freeze({
    type: "JSNodeWorkspaceTopologyRead",
    version: 1,
    root: path.resolve(repoRoot),
    graph,
    analysis: workspaceAnalysis(graph),
  });
}
