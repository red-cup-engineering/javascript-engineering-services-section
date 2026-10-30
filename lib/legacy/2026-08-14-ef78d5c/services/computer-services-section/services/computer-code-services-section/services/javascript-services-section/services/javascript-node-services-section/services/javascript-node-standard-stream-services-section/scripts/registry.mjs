import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export const registry = Object.freeze({
  models: Object.freeze({}),
  behaviors: Object.freeze({ readJavascriptNodeStandardInputText, writeJavascriptNodeStandardOutputText }),
  qualities: Object.freeze({}),
});
