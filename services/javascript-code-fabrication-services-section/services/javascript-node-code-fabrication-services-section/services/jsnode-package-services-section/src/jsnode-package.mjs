export const JSNODE_PACKAGE_DIALECT_RULES = Object.freeze([
  "A v2 work order uses the existing closed Markdown headings plus Package, Sources, Operations, Tests, Examples, and Traceability.",
  "Package metadata is JSON with version 2, topic, packageName, packageVersion, license, dependencies, and devDependencies.",
  "Sources are mjs fences with path=src/<path>.mjs; Operations bind names to module exports and explicit input/output schemas.",
  "Examples are JSON fences with name=\"...\" operation=<binding-name> and carry input and output.",
  "Package metadata cli:null omits the CLI; otherwise one catalog invokes the module exports. Legacy work orders normalize through the same projection.",
]);

export const JSNODE_PACKAGE_DIALECT_EXAMPLE = `# number-topic
## Requirements
- \`number-result\`: The topic returns typed number results.
## Prohibitions
- \`bad-input\`: Invalid inputs are refused. [claims: input-outside-domain]
## Laws
- \`face-equivalence\` | JSNode | v1 | local | Applies to every operation. | Module exports and the optional catalog agree.
## Standards
- \`node-esm\` | Node.js | v24.2.0+ | https://nodejs.org | Applies to package sources. | Sources are ESM.
## Open questions
none
## Claims
- \`input-outside-domain\` | derived | world | An input that is not of its declared type lies outside the operation's input domain | none | constraint:node-esm; citation:Red Cup reconcile-typed-boundaries skill, a boundary admits only its declared type | Refusing an out-of-domain input is the typed boundary's own behavior
## Package
\`\`\`json
{"version":2,"topic":"number-topic","packageName":"@red-cup-engineering/number-topic-service","packageVersion":"0.1.0","license":"MIT","dependencies":{},"devDependencies":{}}
\`\`\`
## Sources
\`\`\`mjs path=src/numbers.mjs
function number(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("a finite number is required");
  return value;
}
export function doubleValue(value) { return number(value) * 2; }
export function incrementValue(value) { return number(value) + 1; }
\`\`\`
## Operations
\`\`\`json
{"name":"double-value","module":"src/numbers.mjs","exportName":"doubleValue","description":"Doubles one number.","inputSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","title":"DoubleInput","type":"number","description":"The value."},"outputSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","title":"DoubleOutput","type":"number","description":"The result."}}
\`\`\`
\`\`\`json
{"name":"increment-value","module":"src/numbers.mjs","exportName":"incrementValue","description":"Increments one number.","inputSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","title":"IncrementInput","type":"number","description":"The value."},"outputSchema":{"$schema":"https://json-schema.org/draft/2020-12/schema","title":"IncrementOutput","type":"number","description":"The result."}}
\`\`\`
## Tests
\`\`\`mjs path=test/number-topic.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { doubleValue, incrementValue } from "../src/numbers.mjs";
test("composes the module exports", () => assert.equal(doubleValue(incrementValue(2)), 6));
test("refuses invalid input", () => { assert.throws(() => doubleValue("2"), TypeError); assert.throws(() => incrementValue(null), TypeError); });
\`\`\`
## Examples
\`\`\`json name="doubles two" operation=double-value
{"input":2,"output":4}
\`\`\`
\`\`\`json name="increments two" operation=increment-value
{"input":2,"output":3}
\`\`\`
## Traceability
- \`number-result\` -> projection \`jsnode-operation-package\`; acceptance \`jsnode-package-assays\`; constraints \`face-equivalence\`, \`node-esm\`
- \`bad-input\` -> projection \`jsnode-operation-package\`; acceptance \`jsnode-package-assays\`; constraints \`face-equivalence\`, \`node-esm\`
`;
