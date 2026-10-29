# @red-cup-engineering/project-jsnode-operation-source-from-arguments-service

Projects one JsnodeOperationArguments record into the canonical JSNode operation source text: shebang, ordered imports, one JSDoc block ahead of the exported function, and the canonical import.meta.main NDJSON command guard that reads stdin and writes stdout through the house standard-stream hands and refuses invalid JSON or a thrown operation error as one {ok:false,refusal} datum with exit code 2 — a pure, deterministic text projection with no filesystem access.

## Operation

~~~js
export function projectJsnodeOperationSourceFromArguments(argumentsRecord)
~~~

### Parameters

- argumentsRecord (object): Preserves import evaluation order and alias bindings; replaces the command guard with the single canonical NDJSON interface and reports interfaceChanged. A JsnodeOperationArguments record carrying `path`, `exportName`, `description`, `bodyText`, and optional `params`, `returns`, `throws`, `imports`, `isAsync`, `inputSchema`, `outputSchema`.

### Returns

object: A JsnodeOperationSourceProjection record: type, version, path, text, files.

### Refusals

- TypeError: When required fields are missing, top-level residue would be discarded.

## Command

project-jsnode-operation-source-from-arguments reads one JSON value per input line and writes one JSON value per output line.

## Examples

### projects a legacy guard to the canonical command interface

Input:

~~~json
{
  "path": "scripts/double-value.mjs",
  "exportName": "doubleValue",
  "description": "Doubles a value.",
  "bodyText": "export function doubleValue(value) { return value * 2; }",
  "params": [{ "name": "value", "type": "number", "description": "Value to double." }],
  "returns": { "type": "number", "description": "The doubled value." },
  "inputSchema": { "$schema": "https://json-schema.org/draft/2020-12/schema", "title": "doubleValueInput", "type": "number", "description": "Value to double." },
  "outputSchema": { "$schema": "https://json-schema.org/draft/2020-12/schema", "title": "doubleValueOutput", "type": "number", "description": "The doubled value." },
  "imports": [],
  "mainGuardText": "if (import.meta.main) { process.stdout.write(String(doubleValue(2))); }"
}
~~~

Output (selected fields from the current operation):

~~~json
{
  "type": "JsnodeOperationSourceProjection",
  "version": 1,
  "path": "scripts/double-value.mjs",
  "interfaceChanged": true,
  "files": [
    { "path": "scripts/double-value.mjs" },
    { "path": "data/records/schema/double-value.input.schema.json" },
    { "path": "data/records/schema/double-value.output.schema.json" }
  ]
}
~~~

The projected script carries the canonical NDJSON guard and the exact source is
returned in both `text` and `files[0].text`.
