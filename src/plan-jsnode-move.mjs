import { eachWorkspacePackageDir } from "@red-cup-engineering/jsnode-computer/workspace";

const EXAMPLES = Object.freeze([
  "look @emsenn/operations-manifold",
  "map @emsenn/operations-manifold",
  "module @emsenn/operations-manifold .",
  "symbol @emsenn/operations-manifold agentPlatform",
  "types Workspace",
  "functions graph",
  "find graph svg",
  "describe @emsenn/operations-manifold as 561 Group Operations Manifold operator console and jsnode atlas.",
]);

function movePlan({ command, verb, href, target, obstructions = [] }) {
  return Object.freeze({
    kind: "operations-manifold.jsnode.move-plan",
    command,
    verb,
    settlement: obstructions.length === 0 ? "admitted" : "blocked",
    href: obstructions.length === 0 ? href ?? null : null,
    target: obstructions.length === 0 ? target ?? null : null,
    obstructions: Object.freeze([...obstructions]),
    examples: EXAMPLES,
  });
}

function packageNames(repoRoot) {
  return Object.freeze([...eachWorkspacePackageDir(repoRoot)].map((pkg) => pkg.name).sort((a, b) => b.length - a.length));
}

function hasPackage(repoRoot, name) {
  return packageNames(repoRoot).includes(name);
}

function parseImportSpec(repoRoot, spec) {
  const clean = spec.trim();
  if (clean === "") return null;
  for (const name of packageNames(repoRoot)) {
    if (clean === name) return { packageName: name, module: "." };
    if (clean.startsWith(`${name}/`)) return { packageName: name, module: clean.slice(name.length + 1) || "." };
  }
  return null;
}

function splitVerb(command) {
  const match = command.match(/^(\S+)(?:\s+([\s\S]*))?$/u);
  return { verb: match?.[1]?.toLowerCase() ?? "look", rest: match?.[2]?.trim() ?? "" };
}

const packageHref = (packageName) => `/jsnode/package?name=${encodeURIComponent(packageName)}`;
const moduleHref = (packageName, moduleName) => `/jsnode/module?package=${encodeURIComponent(packageName)}&module=${encodeURIComponent(moduleName)}`;
const symbolHref = (packageName, symbolName) => `/jsnode/symbol?package=${encodeURIComponent(packageName)}&name=${encodeURIComponent(symbolName)}`;

/** Plan one JSNode interface move without changing the workspace. */
export async function planJSNodeMove(repoRoot, inputCommand) {
  const command = inputCommand.trim();
  if (command === "" || command === "look" || command === "help") {
    return movePlan({ command, verb: command === "" ? "look" : command, href: "/jsnode", target: { kind: "realm" } });
  }

  const { verb, rest } = splitVerb(command);
  if (verb === "find" || verb === "search") {
    if (rest === "") return movePlan({ command, verb, obstructions: ["search query is empty"] });
    return movePlan({ command, verb, href: `/find?q=${encodeURIComponent(rest)}`, target: { kind: "capability-search", query: rest } });
  }
  if (verb === "types" || verb === "type") {
    return movePlan({ command, verb, href: rest === "" ? "/jsnode/types" : `/jsnode/types?match=${encodeURIComponent(rest)}`, target: { kind: "api-surface", surface: "types", query: rest } });
  }
  if (verb === "functions" || verb === "function" || verb === "fn") {
    return movePlan({ command, verb, href: rest === "" ? "/jsnode/functions" : `/jsnode/functions?match=${encodeURIComponent(rest)}`, target: { kind: "api-surface", surface: "functions", query: rest } });
  }
  if (verb === "map" || verb === "graph") {
    if (rest === "") return movePlan({ command, verb, href: "/jsnode", target: { kind: "realm" } });
    if (!hasPackage(repoRoot, rest)) return movePlan({ command, verb, obstructions: [`jsnode package not found: ${rest}`] });
    return movePlan({ command, verb, href: `/jsnode?focus=${encodeURIComponent(rest)}`, target: { kind: "realm", package: rest } });
  }

  const description = command.match(/^describe\s+(\S+)\s+as\s+([\s\S]+)$/iu);
  if (description !== null) {
    const packageName = description[1] ?? "";
    const nextDescription = description[2]?.trim() ?? "";
    if (!hasPackage(repoRoot, packageName)) return movePlan({ command, verb: "describe", obstructions: [`jsnode package not found: ${packageName}`] });
    if (nextDescription === "") return movePlan({ command, verb: "describe", obstructions: ["description is empty"] });
    return movePlan({ command, verb: "describe", href: `/jsnode/description?package=${encodeURIComponent(packageName)}&description=${encodeURIComponent(nextDescription)}`, target: { kind: "description", package: packageName, description: nextDescription } });
  }

  if (["package", "pkg", "look", "go", "open"].includes(verb)) {
    if (rest === "") return movePlan({ command, verb, href: "/jsnode", target: { kind: "realm" } });
    const parsed = parseImportSpec(repoRoot, rest);
    if (parsed === null) return movePlan({ command, verb, obstructions: [`jsnode package not found for target: ${rest}`] });
    return parsed.module === "."
      ? movePlan({ command, verb, href: packageHref(parsed.packageName), target: { kind: "package", package: parsed.packageName } })
      : movePlan({ command, verb, href: moduleHref(parsed.packageName, parsed.module), target: { kind: "module", package: parsed.packageName, module: parsed.module } });
  }
  if (verb === "module" || verb === "mod") {
    const [packageName = "", moduleName = "."] = rest.split(/\s+/u, 2);
    if (!hasPackage(repoRoot, packageName)) return movePlan({ command, verb, obstructions: [`jsnode package not found: ${packageName}`] });
    return movePlan({ command, verb, href: moduleHref(packageName, moduleName), target: { kind: "module", package: packageName, module: moduleName } });
  }
  if (verb === "symbol" || verb === "sym" || verb === "inspect") {
    const [packageName = "", symbolName = ""] = rest.split(/\s+/u, 2);
    if (!hasPackage(repoRoot, packageName)) return movePlan({ command, verb, obstructions: [`jsnode package not found: ${packageName}`] });
    if (symbolName === "") return movePlan({ command, verb, obstructions: ["symbol name is empty"] });
    return movePlan({ command, verb, href: symbolHref(packageName, symbolName), target: { kind: "symbol", package: packageName, symbol: symbolName } });
  }

  const parsed = parseImportSpec(repoRoot, command);
  if (parsed !== null) {
    return parsed.module === "."
      ? movePlan({ command, verb: "look", href: packageHref(parsed.packageName), target: { kind: "package", package: parsed.packageName } })
      : movePlan({ command, verb: "open", href: moduleHref(parsed.packageName, parsed.module), target: { kind: "module", package: parsed.packageName, module: parsed.module } });
  }
  return movePlan({ command, verb, obstructions: [`unknown jsnode move: ${verb}`] });
}
