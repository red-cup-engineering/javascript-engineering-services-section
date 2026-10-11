import { posix as path } from "node:path";
import { readFileSync } from "node:fs";
import { compileJsonSchema } from "@red-cup-engineering/json-schema-services-section/validation";
import { readJsnodeModuleExports, readJsnodeModuleRequests } from "@red-cup-engineering/javascript-node-services-section/syntax";

const specificationSchema = JSON.parse(readFileSync(new URL("../data/records/schema/jsnode-module-specification.schema.json", import.meta.url), "utf8"));
const specificationContract = compileJsonSchema(specificationSchema);
const schemaPath = (operation, side) => operation[`${side}SchemaPath`] ?? `data/records/schema/${operation.name}.${side}.schema.json`;

function textFile(path, text, mode = 0o644) {
  return Object.freeze({ type: "TextFileCreationProjection", version: 1, path, text, mode });
}
function relative(from, to) {
  const value = path.relative(path.dirname(from), to);
  return value.startsWith(".") ? value : `./${value}`;
}
function json(value) {
  const text = JSON.stringify(value, null, 2);
  if (text === undefined) throw new TypeError("schemas must be JSON values");
  return `${text}\n`;
}
function rejectIssues(issues) {
  const detail = issues.map((issue) => `${issue.path || "/"} ${issue.message}`).join("; ");
  throw new TypeError(`invalid JSNode module specification: ${detail}`);
}
function confined(pathname, prefix) {
  if (typeof pathname !== "string" || pathname.startsWith("/") || pathname.includes("\\")) throw new TypeError(`unsafe path: ${pathname}`);
  const parts = pathname.split("/");
  if (parts[0] !== prefix || parts.some((part) => part === "" || part === "." || part === "..")) throw new TypeError(`unsafe path: ${pathname}`);
}
function validateOperationSchema(schema, operation, side) {
  const result = compileJsonSchema(schema).validate(null);
  if (result.issues.some((issue) => issue.kind === "schema")) throw new TypeError(`invalid ${side} schema for ${operation.name}: ${result.issues.map((issue) => issue.message).join("; ")}`);
}
function namedExports(text, fileName) {
  return new Set(readJsnodeModuleExports(text, fileName).names.filter((name) => name !== "default"));
}
function validateSourceImports(sources, externalReferences) {
  const paths = new Set(sources.map((source) => source.path));
  const external = new Set(externalReferences ?? []);
  for (const source of sources) for (const request of readJsnodeModuleRequests(source.text, source.path)) {
    const specifier = request.specifier;
    if (specifier === null) throw new TypeError(`computed module request is not projectable: ${source.path}`);
    if (!specifier.startsWith(".")) continue;
    const resolved = path.normalize(path.join(path.dirname(source.path), specifier));
    if (resolved.startsWith("src/")) {
      if (!paths.has(resolved)) throw new TypeError(`unresolvable projected import in ${source.path}: ${specifier}`);
    } else if (!external.has(specifier)) throw new TypeError(`external reference is not declared: ${source.path}: ${specifier}`);
  }
}
function cliText(cli, operations) {
  const imports = operations.map((operation, index) => `import { ${operation.exportName} as operation${index} } from ${JSON.stringify(relative(cli.path, operation.module))};`);
  const schemas = operations.flatMap((operation, index) => {
    const result = [];
    if (Object.hasOwn(operation, "inputSchema")) result.push(`import operation${index}InputSchema from ${JSON.stringify(relative(cli.path, schemaPath(operation, "input")))} with { type: "json" };`);
    if (Object.hasOwn(operation, "outputSchema")) result.push(`import operation${index}OutputSchema from ${JSON.stringify(relative(cli.path, schemaPath(operation, "output")))} with { type: "json" };`);
    return result;
  });
  const definitions = operations.map((operation, index) => {
    const fields = [`name: ${JSON.stringify(operation.name)}`, `description: ${JSON.stringify(operation.description)}`, `operation: operation${index}`];
    if (Object.hasOwn(operation, "inputSchema")) fields.push(`inputSchema: operation${index}InputSchema`);
    if (Object.hasOwn(operation, "outputSchema")) fields.push(`outputSchema: operation${index}OutputSchema`);
    return `    ${JSON.stringify(operation.name)}: { ${fields.join(", ")} },`;
  }).join("\n");
  // The catalog is a declaration, not a program: the code layer's runJavascriptNodeOperationModule creates and runs its operations.
  return `${imports.concat(schemas).join("\n")}\n\nexport const catalog = Object.freeze({\n  name: ${JSON.stringify(cli.name)},\n  description: ${JSON.stringify(cli.description)},\n  operations: {\n${definitions}\n  },\n});\n`;
}

/** Project source-free output paths from the same schema and module rules as emitted files. */
export function projectJsnodeModulePaths({ operations }) {
  const paths = [...new Set(operations.map(operation => operation.module))];
  for (const module of paths) confined(module, "src");
  for (const operation of operations) for (const side of ["input", "output"]) {
    if (Object.hasOwn(operation, `${side}Schema`) && !Object.hasOwn(operation, `${side}SchemaPath`)) {
      const target = schemaPath(operation, side);
      confined(target, "data");
      if (paths.includes(target)) throw new TypeError(`projected path is duplicated: ${target}`);
      paths.push(target);
    }
  }
  return Object.freeze(paths.sort((left, right) => left.localeCompare(right)));
}

/** Projects shared ESM source carriers, their explicit schemas, and one optional catalog declaration that the code layer runs. */
export function projectJsnodeModules(specification) {
  const validation = specificationContract.validate(specification);
  if (!validation.valid) rejectIssues(validation.issues);
  const sourceByPath = new Map();
  for (const source of specification.sources) {
    confined(source.path, "src");
    if (sourceByPath.has(source.path)) throw new TypeError(`duplicate source path: ${source.path}`);
    sourceByPath.set(source.path, source);
  }
  validateSourceImports(specification.sources, specification.externalReferences);
  const operationNames = new Set();
  for (const operation of specification.operations) {
    confined(operation.module, "src");
    if (operationNames.has(operation.name)) throw new TypeError(`duplicate operation command: ${operation.name}`);
    operationNames.add(operation.name);
    if (Object.hasOwn(operation, "inputSchemaPath")) confined(operation.inputSchemaPath, "data");
    if (Object.hasOwn(operation, "outputSchemaPath")) confined(operation.outputSchemaPath, "data");
    if (Object.hasOwn(operation, "inputSchema")) validateOperationSchema(operation.inputSchema, operation, "input");
    if (Object.hasOwn(operation, "outputSchema")) validateOperationSchema(operation.outputSchema, operation, "output");
    if (Object.hasOwn(operation, "inputSchemaPath") && !Object.hasOwn(operation, "inputSchema")) throw new TypeError(`input schema path has no schema: ${operation.name}`);
    if (Object.hasOwn(operation, "outputSchemaPath") && !Object.hasOwn(operation, "outputSchema")) throw new TypeError(`output schema path has no schema: ${operation.name}`);
    const source = sourceByPath.get(operation.module);
    if (!source) throw new TypeError(`operation module is not a projected source: ${operation.module}`);
    if (!namedExports(source.text, source.path).has(operation.exportName)) throw new TypeError(`operation export is not present: ${operation.module}#${operation.exportName}`);
  }
  if (specification.cli) confined(specification.cli.path, "apps");
  const outputPaths = new Set(projectJsnodeModulePaths(specification));
  const files = [...specification.sources.map((source) => textFile(source.path, source.text))];
  for (const operation of specification.operations) {
    if (Object.hasOwn(operation, "inputSchema") && !Object.hasOwn(operation, "inputSchemaPath") && outputPaths.has(schemaPath(operation, "input"))) files.push(textFile(schemaPath(operation, "input"), json(operation.inputSchema)));
    if (Object.hasOwn(operation, "outputSchema") && !Object.hasOwn(operation, "outputSchemaPath") && outputPaths.has(schemaPath(operation, "output"))) files.push(textFile(schemaPath(operation, "output"), json(operation.outputSchema)));
  }
  if (specification.cli) files.push(textFile(specification.cli.path, cliText(specification.cli, specification.operations)));
  const paths = new Set();
  for (const file of files) {
    if (paths.has(file.path)) throw new TypeError(`projected path is duplicated: ${file.path}`);
    paths.add(file.path);
  }
  return Object.freeze(files.sort((left, right) => left.path.localeCompare(right.path)));
}
