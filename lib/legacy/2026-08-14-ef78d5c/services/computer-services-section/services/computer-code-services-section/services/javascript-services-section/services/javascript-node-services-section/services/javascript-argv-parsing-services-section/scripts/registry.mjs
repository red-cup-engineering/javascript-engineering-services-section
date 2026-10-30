import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { projectJavascriptArgvTail } from "@red-cup-engineering/project-javascript-argv-tail-service";

export const registry = Object.freeze({
  models: Object.freeze({}),
  behaviors: Object.freeze({ parseJavascriptArgv, projectJavascriptArgvTail }),
  qualities: Object.freeze({}),
});
