/** Deterministic source fabrication for schema-admitted, immutable JSON data. */
import { types } from "node:util";
import { compileJsonSchema } from "@red-cup-engineering/json-schema-services-section/validation";
import { confined } from "./project-jsnode-module-paths.mjs";

const reserved = new Set([
  "await", "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "import", "in", "instanceof", "new",
  "null", "return", "super", "switch", "this", "throw", "true", "try",
  "typeof", "var", "void", "while", "with", "yield", "let", "static",
  "implements", "interface", "package", "private", "protected", "public",
  "arguments", "eval",
]);
const plain = value => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

/** Snapshot strict JSON without invoking accessors, toJSON, or proxy traps.
 * Repeated references are JSON values, not shared object identities; cycles
 * and values that JSON cannot represent are refused. Negative zero is retained.
 */
function snapshot(value) {
  const active = new Set();
  const copy = (item, location, depth) => {
    if (depth > 512) throw new TypeError(`JSON data exceeds 512 levels: ${location}`);
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item !== "object" || types.isProxy(item))
      throw new TypeError(`strict JSON data required at ${location}`);
    if (active.has(item)) throw new TypeError(`cyclic JSON data at ${location}`);
    const array = Array.isArray(item);
    if (array ? Object.getPrototypeOf(item) !== Array.prototype : !plain(item))
      throw new TypeError(`plain JSON data required at ${location}`);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== "string" || !("value" in descriptors[key]) ||
        (!(array && key === "length") && !descriptors[key].enumerable)))
      throw new TypeError(`JSON data cannot contain accessors, symbols or hidden members: ${location}`);
    active.add(item);
    let result;
    if (array) {
      const length = descriptors.length.value;
      if (keys.length !== length + 1 || keys.some(key => key !== "length" &&
          (!/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length)))
        throw new TypeError(`JSON arrays must be dense and have no extra members: ${location}`);
      result = Array.from({ length }, (_, index) => copy(descriptors[index].value, `${location}/${index}`, depth + 1));
    } else {
      result = Object.fromEntries(keys.sort(compare).map(key => [key, copy(descriptors[key].value, `${location}/${key}`, depth + 1)]));
    }
    active.delete(item);
    return Object.freeze(result);
  };
  return copy(value, "dataModules", 0);
}

// This fabrication profile is deliberately closed. The existing evaluator
// treats unknown words as annotations; a typo or unsupported assertion must
// not silently disappear while a producer claims to have admitted a design.
const annotations = new Set([
  "$schema", "$id", "$anchor", "$comment", "title", "description", "default",
  "examples", "deprecated", "readOnly", "writeOnly", "contentEncoding", "contentMediaType",
]);
const assertions = new Set([
  "$ref", "type", "enum", "const", "required", "minProperties", "maxProperties",
  "dependentRequired", "minItems", "maxItems", "minContains", "maxContains", "uniqueItems",
  "minLength", "maxLength", "pattern", "format", "minimum", "maximum",
  "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
]);
const schemaSingles = new Set([
  "additionalProperties", "propertyNames", "unevaluatedProperties", "items", "additionalItems",
  "contains", "unevaluatedItems", "not", "if", "then", "else",
]);
const schemaMaps = new Set(["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]);
const schemaLists = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
const formats = new Set([
  "date", "time", "date-time", "iso-time", "iso-date-time", "duration", "uri", "uri-reference",
  "uri-template", "url", "email", "hostname", "ipv4", "ipv6", "regex", "uuid", "json-pointer",
  "json-pointer-uri-fragment", "relative-json-pointer", "byte", "int32", "int64", "float", "double",
  "password", "binary",
]);
const draftSevenOnly = new Set(["dependencies", "additionalItems"]);
const draftModernOnly = new Set([
  "$anchor", "dependentRequired", "dependentSchemas", "prefixItems", "minContains", "maxContains",
  "unevaluatedItems", "unevaluatedProperties",
]);
const pointerToken = value => value.replaceAll("~", "~0").replaceAll("/", "~1");
function schemaDialect(value) {
  if (value === undefined || value === "https://json-schema.org/draft/2020-12/schema") return "2020-12";
  if (value === "http://json-schema.org/draft-07/schema#" || value === "https://json-schema.org/draft-07/schema#") return "draft-07";
  throw new TypeError(`unsupported data module schema dialect ${String(value)}`);
}
function admitStaticSchemaProfile(schema) {
  const dialect = schemaDialect(record(schema) ? schema.$schema : undefined);
  const locations = new Set(), references = [];
  const visit = (item, location) => {
    locations.add(location);
    if (typeof item === "boolean") return;
    if (!record(item)) throw new TypeError(`invalid data module schema at ${location}`);
    for (const [keyword, value] of Object.entries(item)) {
      if ((dialect === "2020-12" ? draftSevenOnly : draftModernOnly).has(keyword))
        throw new TypeError(`unsupported ${dialect} data module schema keyword ${keyword} at ${location}`);
      if (keyword === "$schema" && schemaDialect(value) !== dialect)
        throw new TypeError("data module schema cannot change dialect inside one document");
      if (keyword === "$id" && location !== "")
        throw new TypeError("data module schema does not support embedded resource identifiers");
      if (keyword === "$ref") references.push(value);
      if (keyword === "format" && !formats.has(value))
        throw new TypeError(`unsupported data module schema format ${String(value)} at ${location}`);
      if (annotations.has(keyword) || assertions.has(keyword)) continue;
      if (schemaSingles.has(keyword)) {
        if (keyword === "items" && Array.isArray(value)) value.forEach((child, index) => visit(child, `${location}/${keyword}/${index}`));
        else visit(value, `${location}/${keyword}`);
      } else if (schemaMaps.has(keyword)) {
        if (!record(value)) throw new TypeError(`invalid schema map at ${location}/${keyword}`);
        for (const [name, child] of Object.entries(value)) visit(child, `${location}/${keyword}/${pointerToken(name)}`);
      } else if (schemaLists.has(keyword)) {
        if (!Array.isArray(value)) throw new TypeError(`invalid schema list at ${location}/${keyword}`);
        value.forEach((child, index) => visit(child, `${location}/${keyword}/${index}`));
      } else if (keyword === "dependencies") {
        if (!record(value)) throw new TypeError(`invalid dependencies schema at ${location}`);
        for (const [name, child] of Object.entries(value)) if (!Array.isArray(child)) visit(child, `${location}/dependencies/${pointerToken(name)}`);
      } else throw new TypeError(`unsupported data module schema keyword ${keyword} at ${location}`);
    }
  };
  visit(schema, "");
  // This is an admission boundary, not another reference resolver. The
  // existing supplier resolves and evaluates each accepted pointer. Restrict
  // references to structural schema positions already checked above, so a
  // reference cannot promote an unchecked default/example/const into a schema.
  for (const reference of references) {
    if (typeof reference !== "string" || !reference.startsWith("#"))
      throw new TypeError("data module schema references must be document-local JSON Pointers");
    let fragment;
    try { fragment = decodeURIComponent(reference.slice(1)); }
    catch { throw new TypeError("data module schema reference has an invalid URI fragment"); }
    if (fragment !== "" && !fragment.startsWith("/") || /~(?:[^01]|$)/u.test(fragment))
      throw new TypeError("data module schema references must be valid JSON Pointers");
    const normalized = fragment === "" ? "" : "/" + fragment.slice(1).split("/")
      .map(token => pointerToken(token.replaceAll("~1", "/").replaceAll("~0", "~"))).join("/");
    if (!locations.has(normalized))
      throw new TypeError(`data module schema reference targets an unadmitted schema location: ${reference}`);
  }
}

function fields(value, expected, location) {
  if (!record(value) || Object.keys(value).sort(compare).join("\0") !== expected.slice().sort(compare).join("\0"))
    throw new TypeError(`${location} requires exactly ${expected.join(", ")}`);
}
function identifier(name) {
  if (typeof name !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(name) || reserved.has(name))
    throw new TypeError("data export name must be a non-reserved JavaScript binding");
}
// JSON.stringify deliberately rewrites -0 and orders integer-looking keys by
// their numeric value. Serialize the admitted value directly so every key uses
// the same code-unit order and every finite number retains its JSON meaning.
function json(value) {
  if (typeof value === "number" && Object.is(value, -0)) return "-0";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(json).join(",")}]`;
  return `{${Object.keys(value).sort(compare).map(key => `${JSON.stringify(key)}:${json(value[key])}`).join(",")}}`;
}
/** Project source-free schema-admitted data to standalone immutable ESM files.
 * @param {Array} dataModules Declarations containing path and named exports,
 * each export containing its name, JSON value and self-contained JSON schema.
 * @returns {ReadonlyArray} Deterministic TextFileCreationProjection records.
 * @throws {TypeError} For invalid JSON, schema, value, binding, or module paths.
 */
export function projectJsnodeDataModules(dataModules) {
  const declarations = snapshot(dataModules);
  if (!Array.isArray(declarations)) throw new TypeError("dataModules must be an array");
  const paths = new Set();
  const files = declarations.map(module => {
    fields(module, ["path", "exports"], "data module");
    confined(module.path, "src");
    if (!module.path.endsWith(".mjs") || module.path.split("/").includes("node_modules"))
      throw new TypeError("data module path must name a confined ESM source file");
    if (paths.has(module.path)) throw new TypeError(`duplicate data module path: ${module.path}`);
    paths.add(module.path);
    if (!Array.isArray(module.exports) || module.exports.length === 0)
      throw new TypeError("data module requires at least one export");
    const names = new Set();
    const exports = module.exports.map(entry => {
      fields(entry, ["name", "value", "schema"], "data export");
      identifier(entry.name);
      if (names.has(entry.name)) throw new TypeError(`duplicate data export: ${entry.name}`);
      names.add(entry.name);
      admitStaticSchemaProfile(entry.schema);
      const result = compileJsonSchema(entry.schema).validate(entry.value);
      if (!result.valid) throw new TypeError(`data export ${entry.name} fails its declared schema: ${result.issues.map(issue => `${issue.path || "/"} ${issue.message}`).join("; ")}`);
      return entry;
    }).sort((left, right) => compare(left.name, right.name));
    const text = [
      "/** Generated from schema-admitted dataModules. Do not edit. */",
      "function __freezeGeneratedData(value) {",
      "  if (value !== null && typeof value === \"object\") {",
      "    for (const child of Object.values(value)) __freezeGeneratedData(child);",
      "    Object.freeze(value);",
      "  }",
      "  return value;",
      "}",
      // Export aliases do not create local bindings. Data named Object, JSON,
      // or __freezeGeneratedData cannot shadow the generated implementation.
      ...exports.map((entry, index) => `const __data${index} = __freezeGeneratedData(JSON.parse(${JSON.stringify(json(entry.value))}));`),
      `export { ${exports.map((entry, index) => `__data${index} as ${entry.name}`).join(", ")} };`,
      "",
    ].join("\n");
    return Object.freeze({ type: "TextFileCreationProjection", version: 1, path: module.path, text, mode: 0o644 });
  });
  return Object.freeze(files.sort((left, right) => compare(left.path, right.path)));
}
