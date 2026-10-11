// One effectful operation: execute one already-admitted command and capture its result.
import { spawnSync } from "node:child_process";
import { directArguments, normalizeCommandResult, normalizeVerificationResult } from "./command-normalization.mjs";

export function runCommand(command, { cwd, shell = "auto", signal } = {}) {
  if (signal?.aborted) throw signal.reason ?? new Error("command execution cancelled by customer");
  const childEnvironment = { ...process.env };
  // Node deliberately suppresses recursive `node --test` execution when this
  // private marker leaks from the outer test runner. Verification commands are
  // separate host acts and must execute rather than inherit that suppression.
  delete childEnvironment.NODE_TEST_CONTEXT;
  const argv = shell === true ? null : directArguments(command);
  // A declared direct Node verification is a request for this provider's
  // runtime, not whatever executable an ambient PATH happens to name.  Keep
  // PATH itself intact for declared child tools (for example forge/cast).
  if (argv?.[0] === "node") argv[0] = process.execPath;
  const res = argv
    ? spawnSync(argv[0], argv.slice(1), { cwd, shell: false, encoding: "utf8", maxBuffer: Number.POSITIVE_INFINITY, env: childEnvironment })
    : spawnSync(command, { cwd, shell: shell === false ? false : true, encoding: "utf8", maxBuffer: Number.POSITIVE_INFINITY, env: childEnvironment });
  return normalizeCommandResult(res);
}

// Run a test/verify command; passed = exit code 0.
export function runTestsCommand(workdir, command, opts = {}) {
  return normalizeVerificationResult(runCommand(command, { cwd: workdir, ...opts }));
}
