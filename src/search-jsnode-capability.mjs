import { discoverWorkspace, workspaceTypeIndex } from "@red-cup-engineering/jsnode-computer";
import { searchPackages } from "@red-cup-engineering/jsnode-topology";

function termsOf(query) {
  return Object.freeze([...new Set(query.toLowerCase().split(/[^a-z0-9@._/-]+/u).filter((term) => term.length > 1))]);
}

function includesTerms(text, terms) {
  const haystack = text.toLowerCase();
  return terms.length > 0 && terms.every((term) => haystack.includes(term));
}

/** Search current package carriers and built API surfaces for a capability. */
export async function search561GroupJSNodeCapability(repoRoot, params = {}) {
  const query = typeof params.q === "string" ? params.q.trim() : typeof params.query === "string" ? params.query.trim() : "";
  const terms = termsOf(query);
  const workspace = await discoverWorkspace(repoRoot);
  const index = workspaceTypeIndex(repoRoot);
  const packages = query === "" ? [] : searchPackages(workspace.packages, query).map((match) => Object.freeze({
    name: match.package.name,
    description: match.package.description,
    field: match.field,
  }));
  const functions = index.functions.filter((fn) => includesTerms(`${fn.pkg} ${fn.name} ${fn.domain.join(" ")} ${fn.codomain ?? ""}`, terms));
  const types = index.types.filter((type) => includesTerms(`${type.pkg} ${type.name} ${type.kind}`, terms));
  return Object.freeze({
    kind: "jsnode.capability-search",
    query,
    terms,
    packages: Object.freeze(packages),
    functions: Object.freeze(functions),
    types: Object.freeze(types),
  });
}

/** Check whether current JSNode carriers cover every term in a query. */
export async function check561GroupJSNodeCapability(repoRoot, params = {}) {
  const result = await search561GroupJSNodeCapability(repoRoot, params);
  const searchable = JSON.stringify([result.packages, result.functions, result.types]).toLowerCase();
  const coveredTerms = result.terms.filter((term) => searchable.includes(term));
  const gaps = result.terms.filter((term) => !coveredTerms.includes(term));
  const total = result.packages.length + result.functions.length + result.types.length;
  return Object.freeze({
    kind: "jsnode.capability-check",
    query: result.query,
    foundExistingCarrier: total > 0 && gaps.length === 0,
    counts: Object.freeze({ packages: result.packages.length, functions: result.functions.length, types: result.types.length, total }),
    coveredTerms: Object.freeze(coveredTerms),
    gaps: Object.freeze(gaps),
    result,
  });
}
