/**
 * The one test plan of a house package (jsnode-package-services-section's run-package-tests and
 * check-package-syntax run it): which of its files are its tests, which of them declare a requirement
 * a plain checkout may not meet, and which files `check` reads, so every package is tested the same way
 * everywhere and "requires host" is told apart from "fails".
 *
 * A package's tests are every `*.test.mjs`, `*.test.js`, `*.test.cjs` or `*.test.mts` among its own files:
 * not under a nested package, node_modules, legacy, vendor or a fixtures directory. A test that needs what
 * the checkout may lack is declared in package.json `testRequires`, by package-relative path, with one or
 * more kinds:
 *
 *   "testRequires": {
 *     "test/inference/speak.test.mjs": { "host": "/home/emsenn/info", "reason": "reads the corpus" },
 *     "test/vault-payment.test.mjs": { "network": "calls the Stripe test API" },
 *     "test/replica.test.mjs": { "env": ["HIVE_KEY_ROOT"] },
 *     "test/rdf.test.mjs": { "package": "@red-cup-engineering/witness-journal-rdf-projection-service" }
 *   }
 *
 * A declared test stays in the plan; it runs wherever its requirement is met and is reported as `requires`
 * where it is not. A declaration is never a way to skip a test.
 *
 * This module depends on nothing but the language, so a reader of committed files can use it without
 * composing a workspace.
 */

/** A test file of the standard plan. */
export const TEST_FILE = /\.test\.(?:[cm]?js|mts)$/u;
/** Code that `check` reads with `node --check` (TypeScript is the type checker's, not this check's). */
export const CHECKED_FILE = /\.(?:[cm]?js)$/u;
const NOT_OWN = /(?:^|\/)(?:node_modules|legacy|vendor|vendored|\.git)\//u;
const FIXTURE = /(?:^|\/)fixtures\//u;
/** The kinds of requirement a test may declare. */
export const REQUIREMENT_KINDS = Object.freeze(["host", "network", "env", "package"]);

const posix = (path) => String(path).replace(/\\/gu, "/").replace(/^\.\//u, "");
const under = (path, root) => path === root || path.startsWith(`${root}/`);

/** The package-relative directories of the packages nested in this one, from its file list. */
export function nestedPackageRoots(files) {
  return [...new Set(files.map(posix)
    .filter((path) => /(?:^|\/)package\.json$/u.test(path) && path !== "package.json" && !NOT_OWN.test(path) && !FIXTURE.test(path))
    .map((path) => path.slice(0, -"/package.json".length)))].sort();
}

/** The files that are this package's own: not a nested package's, not node_modules/legacy/vendor, not fixtures. */
export function ownFiles(files, { nestedRoots = nestedPackageRoots(files) } = {}) {
  const nested = nestedRoots.map(posix).filter((root) => root && root !== ".");
  return files.map(posix).filter((path) => !NOT_OWN.test(path) && !FIXTURE.test(path) && !nested.some((root) => under(path, root)));
}

/** Admit a manifest's `testRequires` against the plan's tests. Returns `{ requirements, problems }`. */
export function admitTestRequires(testRequires, tests) {
  const requirements = {}, problems = [];
  if (testRequires === undefined) return { requirements, problems };
  if (testRequires === null || typeof testRequires !== "object" || Array.isArray(testRequires)) {
    return { requirements, problems: ["testRequires must be an object from test path to its requirement"] };
  }
  const known = new Set(tests);
  for (const [rawPath, declaration] of Object.entries(testRequires)) {
    const path = posix(rawPath);
    if (!known.has(path)) { problems.push(`testRequires names ${rawPath}, which is not a test of this package`); continue; }
    if (declaration === null || typeof declaration !== "object" || Array.isArray(declaration)) { problems.push(`testRequires ${rawPath}: a requirement is an object of kinds`); continue; }
    const kinds = Object.keys(declaration).filter((key) => key !== "reason");
    const unknown = kinds.filter((kind) => !REQUIREMENT_KINDS.includes(kind));
    if (unknown.length) problems.push(`testRequires ${rawPath}: unknown kind ${unknown.join(", ")} (kinds: ${REQUIREMENT_KINDS.join(", ")})`);
    const entry = [];
    for (const kind of kinds.filter((k) => REQUIREMENT_KINDS.includes(k))) {
      const values = kind === "network" ? [declaration.network] : [declaration[kind]].flat();
      if (values.some((value) => typeof value !== "string" || value.trim() === "")) { problems.push(`testRequires ${rawPath}: ${kind} must name its ${kind === "network" ? "reason" : kind === "host" ? "path" : kind === "env" ? "variable" : "package"}`); continue; }
      for (const value of values) entry.push({ kind, value });
    }
    if (kinds.length === 0) problems.push(`testRequires ${rawPath}: declares no requirement`);
    if (entry.length) requirements[path] = Object.freeze({ requires: Object.freeze(entry), reason: typeof declaration.reason === "string" ? declaration.reason : null });
  }
  return { requirements, problems };
}

/**
 * A package's test plan from its files (package-relative paths, as a tracked listing gives them) and its
 * manifest. Returns `{ files, tests, requirements, check, problems }`: `tests` every test in the plan, sorted;
 * `files` retains the complete input listing so migration can detect tests the plan would omit;
 * `requirements` the declared requirement of each test that has one; `check` the code files `check` reads.
 */
export function testPlan({ files, manifest = {}, nestedRoots } = {}) {
  if (!Array.isArray(files)) throw new TypeError("testPlan requires the package's files");
  const own = ownFiles(files, nestedRoots === undefined ? {} : { nestedRoots });
  const tests = own.filter((path) => TEST_FILE.test(path)).sort();
  const { requirements, problems } = admitTestRequires(manifest.testRequires, tests);
  const check = own.filter((path) => CHECKED_FILE.test(path)).sort();
  return Object.freeze({ files: Object.freeze(files.map(posix)), tests: Object.freeze(tests), requirements: Object.freeze(requirements), check: Object.freeze(check), problems: Object.freeze(problems) });
}

/**
 * Which of a test's declared requirements this environment does not meet. `exists(path)` and
 * `hasPackage(name)` are supplied by the caller (the runner checks the filesystem and node_modules);
 * `environment` is the process environment. A network requirement is met only where TEST_NETWORK=1.
 */
export function unmetRequirements(requirement, { environment = {}, exists, hasPackage, home = environment.HOME } = {}) {
  if (!requirement) return [];
  return requirement.requires.filter(({ kind, value }) => {
    if (kind === "host") return !exists(value.startsWith("~/") && home ? `${home}${value.slice(1)}` : value);
    if (kind === "env") return !(typeof environment[value] === "string" && environment[value] !== "");
    if (kind === "package") return !hasPackage(value);
    return environment.TEST_NETWORK !== "1";
  });
}
