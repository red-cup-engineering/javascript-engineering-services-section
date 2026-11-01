import { canonicalChecked } from "@red-cup-engineering/json-services-section";

function renderImportLine(importRecord) {
  if (typeof importRecord.text === "string") return importRecord.text;
  const { source, names = [], namespace, default: defaultName } = importRecord;
  const parts = [];
  if (defaultName) parts.push(defaultName);
  if (namespace) parts.push(`* as ${namespace}`);
  if (names.length > 0) parts.push(`{ ${(importRecord.bindings?.length ? importRecord.bindings.map(({ imported, local }) => imported === local ? local : imported + " as " + local) : names).join(", ")} }`);
  if (!parts.length) return `import "${source}";`;
  return `import ${parts.join(", ")} from "${source}";`;
}

const OPERATION_RUNTIME_SPECIFIER = "@red-cup-engineering/javascript-node-services-section/operation";

/** Whether an import record only binds the runtime the old main guard called, which no declaration module imports. */
export function isDeadOperationRuntimeImport(importRecord, bodyText) {
  if (importRecord.source !== OPERATION_RUNTIME_SPECIFIER) return false;
  const locals = [importRecord.default, importRecord.namespace, ...(importRecord.bindings?.length ? importRecord.bindings.map(({ local }) => local) : importRecord.names ?? [])].filter(Boolean);
  return !locals.some((local) => new RegExp(`(?<![\\w$.])${local}(?![\\w$])`, "u").test(stripLeadingJsDoc(bodyText)));
}

function mergedImports(imports, bakedImports) {
  const result = [...imports];
  for (const required of bakedImports) {
    const local = required.names?.[0] ?? required.default;
    const bound = imports.find((record) => record.names?.includes(local) || record.default === local || record.namespace === local || (typeof record.text === "string" && new RegExp(`\\b${local}\\b`, "u").test(record.text)));
    if (bound) {
      const binding = bound.bindings?.find((entry) => entry.local === local);
      const correctDefault = required.default === local && bound.default === local;
      const correctNamed = required.names?.includes(local) && bound.names?.includes(local) && (!binding || binding.imported === local);
      if ((!correctDefault && !correctNamed) || bound.source !== required.source) throw new TypeError("canonical command import binding collision: " + local);
    } else result.push(required);
  }
  return result;
}

function jsDocLines(description, params, returns, throwsList) {
  const lines = ["/**"];
  for (const descriptionLine of description.split("\n")) lines.push(` * ${descriptionLine}`);
  for (const param of params) lines.push(` * @param {${param.type ?? "*"}} ${param.name} ${param.description}`.trimEnd());
  if (returns) lines.push(` * @returns {${returns.type ?? "*"}} ${returns.description}`.trimEnd());
  for (const entry of throwsList) lines.push(` * @throws {${entry.type ?? "*"}} ${entry.description}`.trimEnd());
  lines.push(" */");
  return lines;
}

function stripLeadingJsDoc(bodyText) {
  return bodyText.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/u, "");
}

// A module below the code layer declares what it runs and never runs itself: the code layer's
// runJavascriptNodeOperationModule executes this exported definition.
function operationDeclarationLines({ commandName, exportName, description, inputSchemaBinding, outputSchemaBinding }) {
  const fields = [`name: ${JSON.stringify(commandName)}`, `description: ${JSON.stringify(description)}`, `operation: ${exportName}`];
  if (inputSchemaBinding !== null) fields.push(`inputSchema: ${inputSchemaBinding}`);
  if (outputSchemaBinding !== null) fields.push(`outputSchema: ${outputSchemaBinding}`);
  return [`export const operation = Object.freeze({ ${fields.join(", ")} });`];
}

function commandNameFromPath(path) {
  const match = /^scripts\/([a-z][a-z0-9-]*)\.mjs$/u.exec(typeof path === "string" ? path : "");
  return match ? match[1] : null;
}

function orderedSchemaText(schema) {
  return `${canonicalChecked(schema, "JSON Schema")}\n`;
}

function schemaFileProjections({ inputSchema, outputSchema }, command) {
  const projections = [];
  if (command === null) return projections;
  if (inputSchema !== null) {
    projections.push({
      path: `data/records/schema/${command}.input.schema.json`,
      text: orderedSchemaText(inputSchema),
    });
  }
  if (outputSchema !== null) {
    projections.push({
      path: `data/records/schema/${command}.output.schema.json`,
      text: orderedSchemaText(outputSchema),
    });
  }
  return projections;
}

function schemaImports({ inputSchema, outputSchema }, command) {
  if (command === null) return [];
  const imports = [];
  if (inputSchema !== null) imports.push({ source: `../data/records/schema/${command}.input.schema.json`, default: "operationInputSchema", text: `import operationInputSchema from ${JSON.stringify(`../data/records/schema/${command}.input.schema.json`)} with { type: "json" };` });
  if (outputSchema !== null) imports.push({ source: `../data/records/schema/${command}.output.schema.json`, default: "operationOutputSchema", text: `import operationOutputSchema from ${JSON.stringify(`../data/records/schema/${command}.output.schema.json`)} with { type: "json" };` });
  return imports;
}

/**
 * Projects one JsnodeOperationArguments record into canonical JSNode operation source text declaring the typed NDJSON operation it runs.
 * @param {object} argumentsRecord Preserves import evaluation order and alias bindings; replaces the command guard with an exported `operation` declaration that the code layer executes (the module imports no runtime and carries no shebang) and reports interfaceChanged. A JsnodeOperationArguments record carrying `path`, `exportName`, `description`, `bodyText`, and optional `params`, `returns`, `throws`, `imports`, `inputSchema`, `outputSchema`.
 * @returns {object} A JsnodeOperationSourceProjection record: type, version, path, text, files.
 * @throws {TypeError} When required fields are missing, top-level residue would be discarded.
 */
export function projectJsnodeOperationSourceFromArguments(argumentsRecord) {
  const {
    path,
    exportName,
    description,
    bodyText,
    params = [],
    returns = null,
    throws: throwsList = [],
    imports = [],
    isAsync = false,
    inputSchema = null,
    outputSchema = null,
    command = true,
  } = argumentsRecord ?? {};
  if (typeof exportName !== "string" || exportName.length === 0) throw new TypeError("exportName is required");
  if (typeof bodyText !== "string" || bodyText.length === 0) throw new TypeError("bodyText is required");
  if (typeof description !== "string" || description.length === 0) throw new TypeError("description is required");

  if ((argumentsRecord.residue?.length ?? 0) || (argumentsRecord.residueStatements?.length ?? 0)) throw new TypeError("cannot project unrepresented top-level statements");
  if (typeof command !== "boolean") throw new TypeError("command must be a boolean");
  const commandName = commandNameFromPath(path) ?? exportName;
  if (command && (exportName === "operation" || /\bexport\s+(?:async\s+)?(?:const|let|var|function|class)\s+operation\b/u.test(bodyText))) throw new TypeError("canonical operation declaration collision: operation");
  const schemaImportRecords = command ? schemaImports({ inputSchema, outputSchema }, commandNameFromPath(path)) : [];
  const importLines = mergedImports(command ? imports.filter((record) => !isDeadOperationRuntimeImport(record, bodyText)) : imports, schemaImportRecords).map(renderImportLine);
  const jsDocBlock = jsDocLines(description, params, returns, throwsList);
  const functionCode = stripLeadingJsDoc(bodyText);
  const declarationLines = command ? operationDeclarationLines({ commandName, exportName, description, inputSchemaBinding: inputSchema === null ? null : "operationInputSchema", outputSchemaBinding: outputSchema === null ? null : "operationOutputSchema" }) : [];

  const sections = [
    importLines,
    [...jsDocBlock, functionCode],
    declarationLines,
  ];
  const text = `${sections.filter((section) => section.length).map((section) => section.join("\n")).join("\n\n")}\n`;

  const commandPath = command ? commandNameFromPath(path) : null;
  const files = [{ path, text }, ...schemaFileProjections({ inputSchema, outputSchema }, commandPath)];

  const interfaceChanged = command && Object.hasOwn(argumentsRecord, "mainGuardText") && argumentsRecord.mainGuardText !== null;
  return { type: "JsnodeOperationSourceProjection", version: 1, path, text, files, interfaceChanged };
}
