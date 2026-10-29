# @red-cup-engineering/read-jsnode-operation-arguments-service

Reads one JavaScript ESM script's source into a JsnodeOperationArguments record: its single exported function's JSDoc, parameters, imports, main-guard shape, complete top-level residue, exact main guard, and import bindings — a pure AST reading with no filesystem access.

## Operation

~~~js
export function readJsnodeOperationArguments(request)
~~~

### Parameters

- request (object): A record with `text` (the complete JavaScript ESM source of one script) and `path` (its intended scripts/<name>.mjs path).

### Returns

object: A JsnodeOperationArguments record: type, version, path, exportName, exportCount, isAsync, description, params, returns, inputSchema, outputSchema, throws, imports, hasMainGuard, readsStdin, writesStdout, bodyText, shebang, residue, residueStatements, mainGuardText, shebangText; imports also carry exact text, bindings, and attributes.

### Refusals

- TypeError: When text is not a string, or path does not match ^scripts/[a-z][a-z0-9-]*\.mjs$.
- SyntaxError: When the carried JavaScript does not parse (propagated from the composed export-documentation reader).

## Command

read-jsnode-operation-arguments reads one JSON value per input line and writes one JSON value per output line.

## Examples

### reads JSDoc, the exact main guard, and no residue

Input:

~~~json
{
  "path": "scripts/double-value.mjs",
  "text": "/**\n * Doubles a value.\n * @param {number} value Value to double.\n * @returns {number} The doubled value.\n */\nexport function doubleValue(value) { return value * 2; }\n\nif (import.meta.main) { process.stdout.write(String(doubleValue(2))); }\n"
}
~~~

Output (selected fields from the current operation):

~~~json
{
  "type": "JsnodeOperationArguments",
  "version": 1,
  "path": "scripts/double-value.mjs",
  "exportName": "doubleValue",
  "description": "Doubles a value.",
  "imports": [],
  "residue": [],
  "residueStatements": [],
  "mainGuardText": "if (import.meta.main) { process.stdout.write(String(doubleValue(2))); }",
  "shebangText": null
}
~~~
