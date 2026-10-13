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

export function testRunCompletedAllAssays(tap, expectedNames) {
  if (typeof tap !== "string" || !Array.isArray(expectedNames) ||
      expectedNames.length === 0 || expectedNames.some(name =>
        typeof name !== "string" || name.length === 0 || /[\r\n]/u.test(name)) ||
      new Set(expectedNames).size !== expectedNames.length)
    return false;
  const lines = tap.replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "TAP version 13") return false;

  // Test outcome lines, not # Subtest announcement or arbitrary console
  // output; Node escapes a test module's console.log as "# ..." comments.
  const results = [];
  for (const line of lines) {
    const entry = /^\s*(ok|not ok) \d+ - (.*)$/u.exec(line);
    if (entry) results.push({ pass: entry[1] === "ok", name: entry[2] });
  }
  if (results.length !== expectedNames.length ||
      results.some(result => !result.pass || !expectedNames.includes(result.name)) ||
      new Set(results.map(result => result.name)).size !== expectedNames.length)
    return false;

  // Require the outer runner's accounting, not only its exit status:
  // skipped, todo and cancelled test bodies are not fabrication evidence.
  const counters = new Map();
  for (const line of lines) {
    const match = /^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/u.exec(line);
    if (match) {
      if (counters.has(match[1])) return false; // ambiguous TAP accounting
      counters.set(match[1], Number(match[2]));
    }
  }
  return counters.get("tests") === expectedNames.length &&
    counters.get("pass") === expectedNames.length &&
    counters.get("fail") === 0 &&
    counters.get("cancelled") === 0 &&
    counters.get("skipped") === 0 &&
    counters.get("todo") === 0;
}
