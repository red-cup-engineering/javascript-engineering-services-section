# finite-number-module-order
## Requirements
- `double-result`: doubleValue returns twice its finite numeric input.
- `increment-result`: incrementValue returns its finite numeric input plus one.
## Prohibitions
- `invalid-input`: doubleValue refuses nonnumeric and nonfinite input. [claims: malformed-input-outside-domain]
## Laws
- `doubling` | Arithmetic | integer multiplication | urn:example:integer-multiplication | Applies to the examples and receiver's independent integer cases. | Doubling n yields n + n.
- `incrementing` | Arithmetic | integer addition | urn:example:integer-addition | Applies to the increment examples and receiver's independent integer cases. | Incrementing n yields n + 1.
## Standards
- `node-esm` | Node.js | v24 | https://nodejs.org/api/esm.html | Applies to the module's consumer. | The consumer imports an ESM named export.
## Open questions
none
## Claims
- `malformed-input-outside-domain` | derived | world | A request or field not of its declared type lies outside the operation's input domain | none | constraint:node-esm; citation:Red Cup reconcile-typed-boundaries skill, a boundary admits only its declared type | Refusing an out-of-domain input is the typed boundary's own behavior, not a further choice
## Modules
```json
{"operations":[{"name":"double-value","module":"src/numbers.mjs","exportName":"doubleValue","description":"Double a finite number and refuse other inputs.","inputSchema":{"type":"number"},"outputSchema":{"type":"number"}},{"name":"increment-value","module":"src/numbers.mjs","exportName":"incrementValue","description":"Increment a finite number.","inputSchema":{"type":"number"},"outputSchema":{"type":"number"}}],"examples":[{"name":"doubles two","operation":"double-value","input":2,"output":4},{"name":"increments two","operation":"increment-value","input":2,"output":3}],"dependencies":{}}
```
## Acceptance obligations
```json
[{"id":"consumer-behavior","kind":"assay","statement":"A distinct receiver runs its existing consumer with independent integer cases and invalid inputs, observing the required values and refusals."}]
```
## Traceability
- `double-result` -> projection `jsnode-modules`; acceptance `consumer-behavior`; constraints `doubling`, `node-esm`
- `increment-result` -> projection `jsnode-modules`; acceptance `consumer-behavior`; constraints `incrementing`, `node-esm`
- `invalid-input` -> projection `jsnode-modules`; acceptance `consumer-behavior`; constraints `doubling`, `node-esm`
