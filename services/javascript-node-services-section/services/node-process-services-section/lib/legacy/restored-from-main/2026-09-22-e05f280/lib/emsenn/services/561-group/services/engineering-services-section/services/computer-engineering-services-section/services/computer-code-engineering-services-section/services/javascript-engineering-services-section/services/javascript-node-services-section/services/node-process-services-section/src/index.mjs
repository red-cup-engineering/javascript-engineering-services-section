/**
 * @packageDocumentation
 *
 * node-process-services-section — shared Node process boundary helpers:
 * argv, environment, clock, entropy, stdio, command-result interpretation
 * and lifecycle-record projection, config-file/data-root resolution, and
 * service lifecycle events/records. Relocated from MetroPlat's former
 * `src/integrations/process/` (owner-ruled 2026-09-05/2026-09-11: an app
 * carries no capability of its own). Command *execution* itself is the
 * house `@red-cup-engineering/execute-javascript-node-command-service`
 * primitive's job; this section's own `command.mjs` only interprets that
 * primitive's result and never spawns a process itself (561-group ruling
 * 2026-09-11: a direct `spawnSync` reinvention here was deleted).
 */
export * from "./clock.mjs";
export * from "./command.mjs";
export * from "./config.mjs";
export * from "./entrypoint.mjs";
export * from "./entropy.mjs";
export * from "./environment.mjs";
export * from "./lifecycle.mjs";
export * from "./main-runner.mjs";
export * from "./stdio.mjs";
