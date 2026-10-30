// A native command's exit code is only one part of its outcome. In particular,
// spawnSync can supply an error alongside status 0 when a host refuses launch.
export function packageCheckExecutionProblem(result) {
  if (result?.error != null) {
    const code = typeof result.error.code === "string" ? `${result.error.code}: ` : "";
    return `native command execution failed: ${code}${result.error.message ?? String(result.error)}`;
  }
  if (result?.signal != null) return `native command terminated by signal ${result.signal}`;
  if (!Number.isInteger(result?.status)) return "native command supplied no integer exit status";
  if (result.status !== 0) return `native command exited with status ${result.status}`;
  return null;
}

// Match the native Node TAP reporter's escaping of an enrolled file name.
function tapFileName(file) {
  return file.replaceAll("\b", "\\b").replaceAll("\f", "\\f")
    .replaceAll("\t", "\\t").replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r").replaceAll("\v", "\\v")
    .replaceAll("\\", "\\\\").replaceAll("#", "\\#");
}

// Receive the native Node TAP copy used by run-package-tests. Unlike the
// fabrication assay receiver, this runner permits suites, skips, TODOs and an
// explicitly filtered empty run. It does not infer expected test names from
// source. Counts are usable only after the runner supplied complete accounting.
// Enrolled files bind the native file-wrapper numbering exception; this is
// execution/report completeness, not proof of a file's intended case names.
export function receivePackageTestReport(tap, { files = [] } = {}) {
  const refused = (problem) => ({ counts: { ran: 0, passed: 0, failed: 0 }, problem });
  if (!Array.isArray(files) || files.some(file => typeof file !== "string" || file.length === 0))
    return refused("native test file enrollment is invalid");
  const fileNumbers = new Map(files.map((file, index) => [tapFileName(file), index + 1]));
  if (fileNumbers.size !== files.length) return refused("native test file enrollment is ambiguous");
  if (typeof tap !== "string") return refused("native TAP report is missing");
  const lines = tap.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "TAP version 13" || lines.filter(line => line === "TAP version 13").length !== 1)
    return refused("native TAP report has no unique root header");

  const results = [], plans = [], counters = new Map();
  for (const [lineNumber, line] of lines.entries()) {
    if (/^\s*Bail out!(?:\s|$)/u.test(line)) return refused("native TAP report bailed out");
    const result = /^(ok|not ok) ([1-9][0-9]*) - (.*)$/u.exec(line);
    if (result) {
      const ordinal = Number(result[2]);
      if (!Number.isSafeInteger(ordinal)) return refused("native TAP result ordinal is invalid");
      results.push({ ordinal, lineNumber, name: result[3],
        failed: result[1] === "not ok" && !/ # TODO(?:\s|$)/u.test(result[3]),
      });
    } else if (/^(?:not )?ok(?:\s|$)/u.test(line)) return refused("native TAP root result is malformed");

    const plan = /^1\.\.([0-9]+)$/u.exec(line);
    if (plan) {
      const count = Number(plan[1]);
      if (!Number.isSafeInteger(count)) return refused("native TAP root plan count is invalid");
      plans.push({ count, lineNumber });
    } else if (/^1\.\./u.test(line)) return refused("native TAP root plan is malformed");

    // Before the root plan, these comments may be ordinary test diagnostics.
    if (plans.length === 0) continue;
    const counter = /^# (tests|suites|pass|fail|cancelled|skipped|todo) ([0-9]+)$/u.exec(line);
    if (counter) {
      const value = Number(counter[2]);
      if (!Number.isSafeInteger(value) || counters.has(counter[1]))
        return refused("native TAP counters are invalid or repeated");
      counters.set(counter[1], { value, lineNumber });
    } else if (/^# (?:tests|suites|pass|fail|cancelled|skipped|todo)(?:\s|$)/u.test(line))
      return refused("native TAP counter is malformed");
  }

  if (plans.length !== 1) return refused("native TAP root plan is missing or repeated");
  const plan = plans[0];
  if (plan.count !== results.length) return refused("native TAP root results do not complete the plan");
  // Node renumbers registered tests globally, but a file with top-level asserts
  // can emit a file wrapper carrying its original 1-based enrolled-file index.
  // Permit that exception only once for its exact, unannotated selected file;
  // arbitrary repeated or displaced test ordinals remain incomplete evidence.
  const fileWrappers = new Set();
  for (const [index, result] of results.entries()) {
    const fileWrapper = fileNumbers.get(result.name) === result.ordinal;
    if (result.ordinal !== index + 1 && (!fileWrapper || fileWrappers.has(result.name)))
      return refused("native TAP root results do not complete the plan");
    if (fileWrapper) fileWrappers.add(result.name);
  }
  if (results.some(result => result.lineNumber >= plan.lineNumber))
    return refused("native TAP root plan precedes its results");
  if (counters.size !== 7 || [...counters.values()].some(counter => counter.lineNumber <= plan.lineNumber))
    return refused("native TAP terminal counters are missing or out of order");
  const count = (name) => counters.get(name).value;
  const passed = count("pass"), failed = count("fail") + count("cancelled");
  const ran = passed + failed + count("skipped") + count("todo");
  if (!Number.isSafeInteger(ran) || count("tests") !== ran)
    return refused("native TAP test counters are inconsistent");
  // A root result can describe a suite rather than an individual test, so its
  // plan count must not be equated to the terminal number of tests. Its outcome
  // must still have corresponding terminal accounting.
  if ((plan.count === 0 && (ran !== 0 || count("suites") !== 0)) ||
      plan.count > ran + count("suites") ||
      (failed === 0 && results.some(result => result.failed)))
    return refused("native TAP root outcomes contradict terminal counters");
  return { counts: { ran, passed, failed }, problem: null };
}
