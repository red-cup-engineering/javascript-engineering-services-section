/**
 * Finite Node process-main boundary runner.
 */

import type { ServiceLifecycleRecord } from "./lifecycle-schema-schema.mts";
import { processIsoNow } from "./clock.mts";
import { serviceLifecycleEvent, serviceLifecycleRecord } from "./lifecycle.mts";
import { writeProcessStderr } from "./stdio.mts";

export interface ProcessMainRunnerOptions {
  readonly name: string;
  readonly exit?: (code: number) => void;
  readonly writeError?: (text: string) => void;
}

/** Summarize a finite process main invocation as a lifecycle record. */
export function processMainLifecycleRecord(name: string, code: number, at: string = processIsoNow()): ServiceLifecycleRecord {
  const service = `src/integrations/process/services/main-runner:runProcessMain:${name}`;
  const evidence = Object.freeze(["src/integrations/process/services/main-runner.mts", "src/integrations/process/services/main-runner:runProcessMain"]);
  return serviceLifecycleRecord({
    service,
    boundary: "process-main",
    events: Object.freeze([
      serviceLifecycleEvent({ service, boundary: "process-main", event: "start", at, ok: true, evidence }),
      serviceLifecycleEvent({ service, boundary: "process-main", event: "exit", at, ok: code === 0, code, evidence }),
    ]),
  });
}

/** Bind a finite service main to Node's stderr and exit-code process boundary. */
export async function runProcessMain(main: () => Promise<number>, options: ProcessMainRunnerOptions): Promise<void> {
  const exit = options.exit ?? ((code: number) => {
    // Let the process exit naturally so large stdout payloads finish draining
    // into the pipe; process.exit() here truncated them at racy offsets. The
    // unref'd timer hard-exits only if a stray handle keeps the loop alive.
    process.exitCode = code;
    setTimeout(() => process.exit(code), 5000).unref();
  });
  const writeError = options.writeError ?? writeProcessStderr;

  let code: number;
  try {
    code = await main();
  } catch (error) {
    writeError(`${options.name}: ${error instanceof Error ? error.message : String(error)}\n`);
    exit(1);
    return;
  }

  exit(code);
}
