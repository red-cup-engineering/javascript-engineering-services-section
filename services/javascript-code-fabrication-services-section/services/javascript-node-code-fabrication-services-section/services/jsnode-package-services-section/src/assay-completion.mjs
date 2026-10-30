// The connected-module fabricator must verify that the trusted Node test
// runner actually executed every supplied example/independent clause case.
// Exit 0 alone can mean that a supplied module called process.exit(0)
// during import: Node reports its test-file wrapper as passing even though
// zero of the admitted behavior checks ran.
//
// This parses the runner's TAP observations, not supplier output as truth.
// Ordinary stdout from a module is emitted as prefixed TAP comments.
// This is test-completeness checking, NOT an OS isolation boundary.
export function admittedAssayNames(closure, derivedCases = []) {
  return Object.freeze(closure.operations.flatMap(operation => [
    ...closure.examples.filter(item => item.operation === operation.name)
      .map(item => operation.name + ": " + item.name),
    ...derivedCases.filter(item => item.operation === operation.name)
      .map(item => operation.name + ": clause assay " + item.name),
  ]));
}

// Test names are public, exact words in the native TAP receiving contract.
// Reject collisions and control characters *before* the supplier is asked to
// fabricate code. A runner name is composed from the original operation and
// example/clause name, so validating only the separate input arrays misses
// collisions such as example "clause assay x" versus independent case "x".
// Node's TAP reporter escapes # and \ in test names (as \# and \\).
// Those labels cannot match source-owned exact names: reject them before
// buying a source attempt rather than reporting false incompletion.
const safeAssayName = name => typeof name === "string" &&
  name.trim().length > 0 && name.length <= 512 &&
  !/[\\#\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(name);

/** Admit one exact native runner name set without running, spending or writing. */
export function assertAdmittedAssayNames(closure, derivedCases = []) {
  if (!Array.isArray(closure?.operations) || !Array.isArray(closure?.examples) ||
      !Array.isArray(derivedCases) ||
      closure.operations.some(item => !safeAssayName(item?.name)) ||
      [...closure.examples, ...derivedCases].some(item =>
        !safeAssayName(item?.operation) || !safeAssayName(item?.name)))
    throw new TypeError("original assay names require bounded, printable, source-owned words");
  const names = admittedAssayNames(closure, derivedCases);
  if (!names.length || names.some(name => !safeAssayName(name)) ||
      new Set(names).size !== names.length)
    throw new TypeError("original example and clause-assay runner names must be distinct and printable");
  return names;
}

// A source-owned proof *problem* is read from one original host's TAP bytes.
// Null means every necessary structural condition was observed; none of these
// readings certify a sandbox, a mathematical theorem, a buyer or payment.
function tapCompletionProblem(tap, expectedNames) {
  if (typeof tap !== "string" || !Array.isArray(expectedNames) ||
      expectedNames.length === 0 || expectedNames.some(name => !safeAssayName(name)) ||
      new Set(expectedNames).size !== expectedNames.length)
    return "INVALID_ADMITTED_ASSAYS";
  const lines = tap.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "TAP version 13") return "ROOT_TAP_HEADER_INVALID";

  const results = [], rootPlans = [];
  for (const [lineNumber, line] of lines.entries()) {
    if (/^Bail out!(?:\s|$)/u.test(line)) return "ROOT_TAP_BAILOUT";
    // Root-only. Indented TAP observations are child/subtest claims, not the
    // separately admitted top-level checks of the original fabrication order.
    const entry = /^(ok|not ok) ([1-9][0-9]*) - (.*)$/u.exec(line);
    // A malformed extra result is contradictory execution evidence, not an
    // absent line that a complete-looking success summary can erase.
    if (!entry && /^(?:not )?ok(?:\s|$)/u.test(line)) return "ROOT_RESULT_MALFORMED";
    if (entry) {
      const ordinal = Number(entry[2]);
      if (!Number.isSafeInteger(ordinal)) return "ROOT_ORDINAL_MISMATCH";
      results.push({ ordinal, pass: entry[1] === "ok", name: entry[3], lineNumber });
    }
    const rootPlan = /^1\.\.([0-9]+)$/u.exec(line);
    if (rootPlan) {
      const count = Number(rootPlan[1]);
      if (!Number.isSafeInteger(count)) return "ROOT_PLAN_COUNT_MISMATCH";
      rootPlans.push({ count, lineNumber });
    }
  }
  if (results.length !== expectedNames.length) return "ROOT_RESULTS_INCOMPLETE";
  if (rootPlans.length !== 1) return "ROOT_PLAN_MISSING_OR_REPEATED";
  if (rootPlans[0].count !== expectedNames.length) return "ROOT_PLAN_COUNT_MISMATCH";
  if (results.some((result, index) => result.ordinal !== index + 1))
    return "ROOT_ORDINAL_MISMATCH";
  if (results.some(result => !result.pass)) return "ROOT_RESULT_FAILED";
  const declared = new Set(expectedNames);
  if (results.some(result => !declared.has(result.name)) ||
      new Set(results.map(result => result.name)).size !== expectedNames.length)
    return "ROOT_NAMES_MISMATCH";
  if (rootPlans[0].lineNumber <= results.at(-1).lineNumber)
    return "ROOT_PLAN_PREMATURE";

  // Require the original Node runner's actual final accounting; no skips,
  // TODOs or cancelled checks can turn into accepted fabricated program Work.
  const counters = new Map();
  for (const [lineNumber, line] of lines.entries()) {
    const match = /^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/u.exec(line);
    if (match) {
      const value = Number(match[2]);
      if (lineNumber <= rootPlans[0].lineNumber ||
          counters.has(match[1]) || !Number.isSafeInteger(value))
        return "RUNNER_COUNTERS_INCONSISTENT";
      counters.set(match[1], value);
    }
  }
  if (counters.get("tests") !== expectedNames.length ||
      counters.get("pass") !== expectedNames.length ||
      counters.get("fail") !== 0 ||
      counters.get("cancelled") !== 0 ||
      counters.get("skipped") !== 0 ||
      counters.get("todo") !== 0) return "RUNNER_COUNTERS_INCONSISTENT";
  return null;
}

export function testRunCompletedAllAssays(tap, expectedNames) {
  return tapCompletionProblem(tap, expectedNames) === null;
}


/**
 * Independently receive the trusted host's bounded, *isolated* Node TAP
 * execution. This checks the host outcome and all intended behavioral
 * observations, not the existence of a sandbox. The host, not source text or
 * a customer-supplied JSON field, must own and attest process isolation.
 */
export function receiveIsolatedAssayOutcome(run, expectedNames) {
  if (!run || run.isolated !== true ||
      !Number.isInteger(run.status) ||
      typeof run.stdout !== "string" || typeof run.stderr !== "string" ||
      run.truncated === true || run.timedOut === true || run.signal)
    return { passed: false, code: "ASSAY_EXECUTION_REFUSED",
      reason: "HOST_RESULT_UNQUALIFIED",
      failure: "isolated host did not provide a complete bounded execution outcome" };
  // Resource limits are in actual UTF-8 bytes; independent host source must
  // provide *bounded* observations even if JS string length appears small.
  if (Buffer.byteLength(run.stdout, "utf8") > 2 * 1024 * 1024 ||
      Buffer.byteLength(run.stderr, "utf8") > 2 * 1024 * 1024)
    return { passed: false, code: "ASSAY_EXECUTION_REFUSED",
      reason: "CAPTURED_OUTPUT_TOO_LARGE",
      failure: "isolated host did not provide a complete bounded execution outcome" };
  if (run.status === 0) {
    const reason = tapCompletionProblem(run.stdout, expectedNames);
    if (reason === null) return { passed: true };
    return {
      passed: false, code: "ASSAY_INCOMPLETE", reason,
      failure: "assay-incomplete: host runner exited zero without executing every admitted example and clause test",
    };
  }
  const lines = run.stdout.trim().split("\n");
  const failureAt = lines.findIndex(line => /^\s*not ok \d+ - /u.test(line));
  const said = failureAt >= 0 ? lines.slice(failureAt, failureAt + 16).join("\n")
    : run.stderr.trim().split("\n").slice(-3).join(" ").trim();
  // A failed trusted execution may expose no individual failing TAP case or
  // stderr, e.g. a partial crash of Node's enclosing test process. Such a
  // result is STILL an observable execution refusal: record its exact exit
  // status as context, but never invent a test or an independently detected
  // semantic violation to fill an otherwise empty receipt.
  const observed = said.trim() || `isolated assay process exited status ${run.status}; no attributable TAP failure or stderr was supplied`;
  return { passed: false, code: "ASSAY_TEST_FAILED", failure: observed.slice(0, 600) };
}
