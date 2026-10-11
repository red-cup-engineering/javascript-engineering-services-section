# greet-person
## Requirements
- `greeting-result`: The operation returns a Greeting record for one named person.
## Prohibitions
- `missing-name-refusal`: The operation must refuse requests without a string name.
## Laws
- `admitted-example-face-equivalence` | JSNode operation face-equivalence law | v1 | lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-code-engineering-services-section/services/javascript-engineering-services-section/services/javascript-code-fabrication-services-section/services/javascript-node-code-fabrication-services-section/services/jsnode-package-services-section/README.md | Applies to the shared examples projected to the JSNode import and command faces. | Every admitted example has equivalent import and command outputs under the downstream JSNode face assay.
## Standards
- `node-esm-operation` | Node.js | v24.2.0+ | https://nodejs.org/docs/v24/api/esm.html | Applies to the .mjs operation, its import.meta.main guard, and downstream package-birth assays. | The package uses one executable ESM operation source file that is eligible for downstream staged package-birth assays.
## Open questions
none
## Package
```json
{"packageName":"@red-cup-engineering/greet-person-service","packageVersion":"0.1.0","license":"MIT","dependencies":{},"devDependencies":{}}
```
## Operation
```mjs path=scripts/greet-person.mjs
#!/usr/bin/env node
/**
 * Greets one named person.
 * @param {object} request A record containing the person's name.
 * @returns {object} A Greeting record.
 * @throws {TypeError} When the name is absent.
 */
export function greetPerson(request) {
  if (typeof request?.name !== "string") throw new TypeError("name is required");
  return { type: "Greeting", text: `Hello, ${request.name}!` };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("greetPerson — Greets one named person.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.length > 0) process.stdout.write(`${JSON.stringify(greetPerson(JSON.parse(line)))}\n`);
    }
  }
}
```
## Tests
```mjs path=test/greet-person.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { greetPerson } from "../scripts/greet-person.mjs";
test("greets the named person", () => assert.equal(greetPerson({ name: "Ada" }).text, "Hello, Ada!"));
test("refuses a missing name", () => assert.throws(() => greetPerson({}), /name is required/u));
```
## Examples
```json name="greets Ada"
{"input":{"name":"Ada"},"output":{"type":"Greeting","text":"Hello, Ada!"}}
```
## Traceability
- `greeting-result` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `admitted-example-face-equivalence`, `node-esm-operation`
- `missing-name-refusal` -> projection `jsnode-operation-package`; acceptance `jsnode-package-assays`; constraints `admitted-example-face-equivalence`, `node-esm-operation`
