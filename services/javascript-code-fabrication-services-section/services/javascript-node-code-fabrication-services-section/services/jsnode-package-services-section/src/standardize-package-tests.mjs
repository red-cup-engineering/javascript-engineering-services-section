/**
 * The STD-TEST codemod for one package: its `scripts.test` becomes the one standard command over the test plan
 * (`run-package-tests`, keeping the node flags the old command passed), and its `scripts.check` starts with
 * `check-package-syntax` in place of its hand-listed `node --check` calls, keeping every other step it chained.
 * A package whose test command is not a `node --test` form (forge, lake, guile, a custom runner, a build step
 * before the tests) is left as written and reported, for its owner to decide. Nothing is dropped from a plan:
 * the tests the old command did not run are reported as newly run. A command that selects files outside
 * the standard plan, or whose flags/selectors cannot be resolved safely, is retained exactly and reported.
 */

/** The standard test command, and the check command every standard check begins with. */
export const STANDARD_TEST = "run-package-tests";
export const STANDARD_CHECK = "check-package-syntax";
/** The package that carries both commands: the owner of the test plan. */
export const TEST_PLAN_PACKAGE = "@red-cup-engineering/jsnode-package-services-section";

// Only known option arities are rewritten. An unknown bare option may take the next token as its value;
// treating that value as a file selector would silently drop it. Equals-form options are unambiguous.
const VALUE_FLAGS = new Set([
  "--test-concurrency", "--test-timeout", "--test-name-pattern", "--test-skip-pattern", "--test-shard",
  "--test-reporter", "--test-reporter-destination", "--test-coverage-branches", "--test-coverage-functions",
  "--test-coverage-lines", "--test-coverage-include", "--test-coverage-exclude", "--test-isolation",
  "--experimental-test-isolation", "--test-global-setup", "--test-random-seed", "--test-rerun-failures",
  "--max-old-space-size", "--stack-size", "--import", "--require", "--loader", "--experimental-loader",
  "--conditions", "--input-type", "--experimental-default-type", "--unhandled-rejections",
]);
const BOOLEAN_FLAGS = new Set([
  "--test-only", "--test-force-exit", "--test-update-snapshots", "--test-randomize", "--experimental-test-coverage",
  "--no-warnings", "--trace-warnings", "--trace-deprecation", "--throw-deprecation", "--no-deprecation",
  "--enable-source-maps", "--no-strip-types", "--experimental-strip-types", "--experimental-transform-types",
]);
const NO_OP = /^(?:echo\b[^&|;]*(?:(?:&&|;)\s*exit 0)?|true|exit 0)$/u;

/** Whether a test command is the standard form: `run-package-tests` with node flags only. */
export function isStandardTest(command) {
  const parsed = parseTestCommand(command, STANDARD_TEST);
  return parsed !== null && parsed.args.length === 0;
}
/** Whether a check command is the standard form: it begins with `check-package-syntax`. */
export function isStandardCheck(command) {
  return typeof command === "string" && /^check-package-syntax(?:\s|$)/u.test(command.trim());
}

/** Read simple shell words while retaining their original quoting for the rewritten command. */
function commandWords(command) {
  if (typeof command !== "string" || /[;&|<>`$\\\n\r]/u.test(command)) return null;
  const words = command.trim().match(/(?:[^\s'"]+|'[^']*'|"[^"]*")+/gu) ?? [];
  // Unbalanced quotes and concatenated quoted/unquoted words are kept for the owner's shell to interpret.
  if (words.some((raw) => !/^(?:[^\s'"]+|'[^']*'|"[^"]*"|--[\w-]+=(?:'[^']*'|"[^"]*"))$/u.test(raw))) return null;
  if (words.join("").replace(/\s/gu, "") !== command.replace(/\s/gu, "")) return null;
  return words;
}
const unquote = (raw) => raw.replace(/^(['"])(.*)\1$/u, "$2");

/** A simple test command with correctly paired option operands, or null when its meaning is uncertain. */
function parseTestCommand(command, executable) {
  const words = commandWords(command);
  if (!words || words.shift() !== executable) return null;
  const flags = [];
  let test = executable === STANDARD_TEST, index = 0;
  for (; index < words.length; index += 1) {
    const word = words[index];
    if (word === "--") { index += 1; break; }
    if (!word.startsWith("-")) break;
    if (word === "--test" && executable === "node") { test = true; continue; }
    if (/^--[\w-]+=.+$/u.test(word) || BOOLEAN_FLAGS.has(word)) { flags.push(word); continue; }
    if (!VALUE_FLAGS.has(word) || !words[index + 1] || unquote(words[index + 1]).startsWith("-")) return null;
    flags.push(word, words[++index]);
  }
  return test ? { flags, args: words.slice(index) } : null;
}
const nodeTestCommand = (command) => parseTestCommand(command, "node");

const toPattern = (glob, shell) => new RegExp(`^${glob.replace(/^\.\//u, "").split("/").map((segment) => segment === "**"
  ? (shell ? "[^/]*" : "\u0000")
  : segment.replace(/[.+^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, "[^/]*").replace(/\?/gu, "[^/]")).join("/").replace(/\u0000\//gu, "(?:.*/)?").replace(/\u0000/gu, ".*")}$`, "u");

/** Node 24's default discovery, used only to compare the old command with the standard plan. */
function nodeDiscovers(path, flags) {
  if (/(?:^|\/)node_modules\//u.test(path)) return false;
  const extensions = flags.includes("--no-strip-types") ? /\.[cm]?js$/u : /\.[cm]?[jt]s$/u;
  return extensions.test(path) && (/(?:^|\/)test\//u.test(path)
    || /(?:^|\/)(?:test|test-.+|.+[._-]test)\.[cm]?[jt]s$/u.test(path));
}

/** Resolve only the supported literal/simple-glob selectors; unresolved meaning blocks a rewrite. */
function selectedTests(parsed, files) {
  if (parsed.args.length === 0) return { run: new Set(files.filter((file) => nodeDiscovers(file, parsed.flags))), unresolved: [] };
  const run = new Set(), unresolved = [];
  const directories = [...new Set(files.flatMap((file) => file.split("/").slice(0, -1).map((_, index) => file.split("/").slice(0, index + 1).join("/"))))];
  for (const raw of parsed.args) {
    const quoted = /^['"]/u.test(raw), arg = unquote(raw).replace(/^\.\//u, "");
    if (!arg || arg.startsWith("-") || arg.startsWith("/") || /(?:^|\/)\.\.?(?:\/|$)|[{}[\]~]/u.test(arg)) { unresolved.push(raw); continue; }
    let hits;
    if (!/[*?]/u.test(arg)) hits = files.filter((file) => file === arg);
    else {
      const shellPattern = toPattern(arg, true), nodePattern = toPattern(arg, false);
      const shellMatches = quoted ? [] : [...files, ...directories].filter((path) => shellPattern.test(path));
      const pattern = shellMatches.length ? shellPattern : nodePattern;
      // Node executes a selected directory as an entry point; it is not recursive discovery.
      if (directories.some((path) => pattern.test(path))) unresolved.push(raw);
      hits = files.filter((file) => pattern.test(file));
    }
    if (hits.length === 0) unresolved.push(raw);
    for (const file of hits) run.add(file);
  }
  return { run, unresolved };
}

/**
 * The files an old `node --test` command selected. Quoted globs are node's (`**` recursive); unquoted
 * globs use shell matching first. Bare --test uses Node's default discovery, not the standard plan's.
 * Directories and unsupported selectors are not silently interpreted as recursive test discovery.
 */
export function testsRunBy(command, files) {
  const parsed = nodeTestCommand(command ?? "");
  return parsed ? selectedTests(parsed, files).run : new Set();
}

/** The standard check for an old check command: its `node --check` steps become one `check-package-syntax`. */
function standardCheckFor(previous) {
  const steps = String(previous).split(/\s*&&\s*/u).map((step) => step.trim()).filter(Boolean);
  const kept = steps.filter((step) => !/^node\s+(?:--check|-c)\b/u.test(step) && step !== STANDARD_CHECK);
  return [STANDARD_CHECK, ...kept].join(" && ");
}

/**
 * Standardize one package's scripts against its test plan. `range` is the version range the package's
 * devDependency on the test-plan package gets. `selectionComplete` is false when the caller knows the
 * file listing omits paths the original command could select (for example ignored files). Returns `{ manifest, changed, test, check, newlyRun, kept }`.
 */
export function standardizePackageTests(manifest, plan, { range, selectionComplete = true }) {
  if (manifest?.name === TEST_PLAN_PACKAGE) return { manifest, changed: false, test: null, check: null, newlyRun: [], kept: "the test plan's owner runs its own scripts directly" };
  const scripts = { ...(manifest.scripts ?? {}) };
  const previousTest = scripts.test, previousCheck = scripts.check;
  let test = null, check = null, kept = null, newlyRun = [];

  if (!isStandardTest(previousTest)) {
    const parsed = previousTest === undefined || NO_OP.test(previousTest.trim()) ? { flags: [], args: null } : nodeTestCommand(previousTest);
    const selection = parsed && parsed.args !== null ? selectedTests(parsed, plan.files ?? []) : { run: new Set(), unresolved: [] };
    const omitted = [...selection.run].filter((file) => !plan.tests.includes(file));
    if (!parsed) kept = `test command is not a node --test form with known option operands: ${previousTest}`;
    else if (parsed.args !== null && !Array.isArray(plan.files)) kept = "complete package file listing is required to preserve the old test selection";
    else if (parsed.args !== null && !selectionComplete && (parsed.args.length === 0 || parsed.args.some((arg) => /[*?]/u.test(arg)))) kept = "the file listing excludes ignored paths; retaining wildcard or default test discovery";
    else if (parsed.args !== null && plan.tests.length === 0) kept = "the standard plan is empty; retaining the original test command";
    else if (selection.unresolved.length) kept = `test selectors cannot be safely resolved: ${selection.unresolved.join(", ")}`;
    else if (omitted.length) kept = `test command selects files outside the standard plan: ${omitted.join(", ")}`;
    else if (!(previousTest === undefined && plan.tests.length === 0)) {
      scripts.test = [STANDARD_TEST, ...parsed.flags].join(" ");
      test = { from: previousTest ?? null, to: scripts.test };
      const before = selection.run;
      newlyRun = plan.tests.filter((path) => !before.has(path));
    }
  }
  if (!isStandardCheck(previousCheck) && !(previousCheck === undefined && plan.check.length === 0)) {
    scripts.check = previousCheck === undefined ? STANDARD_CHECK : standardCheckFor(previousCheck);
    check = { from: previousCheck ?? null, to: scripts.check };
  }
  if (!test && !check) return { manifest, changed: false, test, check, newlyRun, kept };

  const next = { ...manifest, scripts };
  const devDependencies = { ...(manifest.devDependencies ?? {}) };
  if (!manifest.dependencies?.[TEST_PLAN_PACKAGE] && devDependencies[TEST_PLAN_PACKAGE] === undefined) {
    devDependencies[TEST_PLAN_PACKAGE] = range;
    next.devDependencies = Object.fromEntries(Object.entries(devDependencies).sort(([a], [b]) => a.localeCompare(b)));
  }
  return { manifest: next, changed: true, test, check, newlyRun, kept };
}
