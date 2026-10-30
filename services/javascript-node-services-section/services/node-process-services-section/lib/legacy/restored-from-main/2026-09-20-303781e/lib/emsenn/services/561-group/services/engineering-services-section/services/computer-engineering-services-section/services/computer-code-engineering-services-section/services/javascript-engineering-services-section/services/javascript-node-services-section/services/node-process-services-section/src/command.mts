/**
 * Node child-process command **result** boundary: pure interpretation and
 * lifecycle-record projection over an already-produced command receipt.
 *
 * Command *execution* is not this module's concern. Spawning the process is
 * the house `@red-cup-engineering/execute-javascript-node-command-service`
 * primitive's job (a typed request/receipt over `spawnSync` without a
 * shell); this module never imports `node:child_process` and never spawns
 * anything itself. It only turns that primitive's already-produced result
 * into a service-lifecycle record and interprets its exit code and
 * diagnostic lines (561-group ruling 2026-09-11: the former in-package
 * `runProcessCommand` — a direct `spawnSync` reinvention of that same
 * capability — was deleted; every real consumer now calls the house
 * primitive directly and hands its result here only for interpretation).
 */

import type { ServiceLifecycleRecord } from "./lifecycle-schema-schema.mts";
import { processIsoNow } from "./clock.mts";
import { serviceLifecycleEvent, serviceLifecycleRecord } from "./lifecycle.mts";

/** The command a lifecycle record is reporting on. */
export interface CommandLifecycleContext {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}

/** The house command-execution primitive's result, read generically. */
export interface CommandExecutionResult {
  readonly status: number | null;
  readonly signal?: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: string;
}

/** Summarize one already-executed command as a lifecycle record. */
export function processCommandLifecycleRecord(
  context: CommandLifecycleContext,
  result: CommandExecutionResult,
  at: string = processIsoNow(),
  service = "src/integrations/process/services/command:runProcessCommand",
): ServiceLifecycleRecord {
  const code = processCommandExitCode(result);
  const evidence = Object.freeze(["src/integrations/process/services/command.mts", service]);
  return serviceLifecycleRecord({
    service,
    boundary: "child-process",
    events: Object.freeze([
      serviceLifecycleEvent({
        service,
        boundary: "child-process",
        event: "spawn",
        at,
        ok: true,
        detail: { command: context.command, args: [...context.args], cwd: context.cwd },
        evidence,
      }),
      serviceLifecycleEvent({
        service,
        boundary: "child-process",
        event: "exit",
        at,
        ok: code === 0,
        code,
        signal: result.signal ?? null,
        detail: {
          command: context.command,
          args: [...context.args],
          cwd: context.cwd,
          stderr: processCommandOutputText(result.stderr),
        },
        evidence,
      }),
    ]),
  });
}

/** Interpret a command-execution result's status/error pair as the service exit code. */
export function processCommandExitCode(result: CommandExecutionResult): number {
  return result.status ?? (result.error === undefined || result.error === "" ? 0 : 1);
}

/** Normalize one command-output channel to text. */
export function processCommandOutputText(value: string | Buffer | null | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : value.toString("utf8");
}

/** Select trimmed process-output lines carrying one diagnostic level marker. */
export function processDiagnosticLines(text: string, level: "error" | "warning"): readonly string[] {
  return Object.freeze(text.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().includes(`${level}:`)));
}
