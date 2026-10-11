export type ApiIndexSymbol = Readonly<{
  package: string;
  packagePath: string;
  module: string;
  import: string;
  file: string;
  name: string;
  kind: string;
  signature: string;
  documented: boolean;
}>;

export type ApiIndexPackage = Readonly<{
  name: string;
  path: string;
  aliases: readonly string[];
  symbols: number;
}>;

export type ApiIndexState = Readonly<{
  kind: "operations-manifold.jsnode.api-index";
  generatedAt: string;
  source: "package-source-doc-symbols";
  packages: readonly ApiIndexPackage[];
  symbols: readonly ApiIndexSymbol[];
}>;

export type ApiIndexQueryParams = Readonly<{
  package?: string | undefined;
  pkg?: string | undefined;
  focus?: string | undefined;
  match?: string | undefined;
  q?: string | undefined;
  name?: string | undefined;
  kind?: string | undefined;
  limit?: string | number | undefined;
  refresh?: string | boolean | undefined;
}>;

export type ApiIndexQueryResult = Readonly<{
  kind: "operations-manifold.jsnode.api-surface";
  index: Readonly<{
    path: string;
    generatedAt: string | null;
    stale: boolean;
    packages: number;
    symbols: number;
  }>;
  filters: Readonly<{
    package?: string;
    requestedPackage?: string;
    match?: string;
    kind?: string;
    limit: number;
  }>;
  totals: Readonly<{
    matchedSymbols: number;
  }>;
  functions: readonly ApiIndexSymbol[];
  types: readonly ApiIndexSymbol[];
  symbols: readonly ApiIndexSymbol[];
}>;

export function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export function requestedApiIndexPackage(params: ApiIndexQueryParams): string | undefined {
  return stringParam(params.package ?? params.pkg ?? params.focus);
}

export function resolveApiIndexPackage(state: ApiIndexState, requested: string): string | undefined {
  for (const pkg of state.packages) {
    if (pkg.aliases.includes(requested)) return pkg.name;
  }
  return undefined;
}

export function projectApiIndexQuery(
  state: ApiIndexState,
  { indexPath, requestedPackage, match, kind, limit }: Readonly<{
    indexPath: string;
    requestedPackage?: string;
    match?: string;
    kind?: string;
    limit: number;
  }>,
): ApiIndexQueryResult {
  const packageName = requestedPackage === undefined ? undefined : resolveApiIndexPackage(state, requestedPackage);
  const matched = state.symbols
    .filter((symbol) => packageName === undefined || symbol.package === packageName)
    .filter((symbol) => kind === undefined || symbol.kind === kind)
    .filter((symbol) => match === undefined || symbolMatches(symbol, match));
  const functions = Object.freeze(matched.filter((symbol) => symbol.kind === "function").slice(0, limit));
  const types = Object.freeze(matched.filter((symbol) => symbol.kind !== "function" && symbol.kind !== "variable").slice(0, limit));
  const symbols = Object.freeze(matched.slice(0, limit));
  return Object.freeze({
    kind: "operations-manifold.jsnode.api-surface" as const,
    index: Object.freeze({
      path: indexPath,
      generatedAt: state.generatedAt === "" ? null : state.generatedAt,
      stale: state.generatedAt === "",
      packages: state.packages.length,
      symbols: state.symbols.length,
    }),
    filters: Object.freeze({
      ...(packageName === undefined ? {} : { package: packageName }),
      ...(requestedPackage === undefined ? {} : { requestedPackage }),
      ...(match === undefined ? {} : { match }),
      ...(kind === undefined ? {} : { kind }),
      limit,
    }),
    totals: Object.freeze({ matchedSymbols: matched.length }),
    functions,
    types,
    symbols,
  });
}

export function symbolMatches(symbol: ApiIndexSymbol, match: string): boolean {
  const needles = queryTerms(match);
  if (needles.length === 0) return false;
  const terms = surfaceTerms([
    symbol.name,
    symbol.kind,
    symbol.signature,
    symbol.import,
    symbol.file,
    symbol.package,
    symbol.packagePath,
    symbol.module,
  ]);
  return needles.some((needle) => terms.some((term) => termMatches(term, needle)));
}

export function queryTerms(value: string): readonly string[] {
  return Object.freeze([...new Set(identifierTerms(value)
    .map(normalizeTerm)
    .filter((term) => term.length >= 3)
    .filter((term) => /[a-z]/u.test(term)))]);
}

export function surfaceTerms(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.flatMap(identifierTerms).map(normalizeTerm).filter((term) => term !== ""))]);
}

export function identifierTerms(value: string): readonly string[] {
  return Object.freeze(value
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((term) => term !== ""));
}

export function normalizeTerm(term: string): string {
  if (term.endsWith("ies") && term.length > 5) return `${term.slice(0, -3)}y`;
  if (term.endsWith("s") && term.length > 4 && !term.endsWith("ss")) return term.slice(0, -1);
  return term;
}

export function termMatches(term: string, needle: string): boolean {
  return term === needle || (needle.length >= 4 && term.startsWith(needle));
}
