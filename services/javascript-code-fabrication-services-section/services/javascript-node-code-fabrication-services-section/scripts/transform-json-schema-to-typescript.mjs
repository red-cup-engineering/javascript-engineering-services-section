/**
 * Project JSON Schema documents into TypeScript declarations.  The projection
 * intentionally omits constraints TypeScript cannot express; runtime
 * admission remains the schema consumer's responsibility.
 */

const isSchema = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function identifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(value)) throw new TypeError(`${label} must be a valid TypeScript identifier`);
  return value;
}
const quoted = (value) => JSON.stringify(value);
function renderTypeName(type) {
  switch (type) {
    case "string": return "string";
    case "integer":
    case "number": return "number";
    case "boolean": return "boolean";
    case "null": return "null";
    case "array": return "readonly unknown[]";
    case "object": return "Record<string, unknown>";
    default: return "unknown";
  }
}
function renderTuple(items, minimumItems, tail, root, references, base) {
  const required = Math.max(0, Math.min(items.length, Number.isInteger(minimumItems) ? minimumItems : 0));
  const member = (schema) => { const value = renderSchema(schema, root, references, base); return value.includes(" | ") || value.includes(" & ") ? `(${value})` : value; };
  const prefix = items.map((item, index) => `${member(item)}${index < required ? "" : "?"}`);
  const suffix = tail === false ? "" : `${prefix.length === 0 ? "" : ", "}...${member(tail ?? true)}[]`;
  return `readonly [${prefix.join(", ")}${suffix}]`;
}
function resolvedBase(schema, inheritedBase = "") {
  if (!isSchema(schema) || typeof schema.$id !== "string" || schema.$id === "") return inheritedBase;
  try { return new URL(schema.$id, inheritedBase).href; } catch { return schema.$id; }
}
function resolveReference(reference, root, references, base = resolvedBase(root)) {
  if (reference.startsWith("#")) return { schema: root, fragment: reference.slice(1), local: true };
  const marker = reference.indexOf("#");
  const id = marker === -1 ? reference : reference.slice(0, marker);
  const fragment = marker === -1 ? "" : reference.slice(marker + 1);
  let resolved = id;
  try { resolved = new URL(id, base).href; } catch {}
  const entry = references.find((candidate) => candidate.schema.$id === id || candidate.schema.$id === resolved || candidate.aliases.includes(id) || candidate.aliases.includes(resolved));
  return entry === undefined ? undefined : { schema: entry.schema, fragment: fragment === "" ? "" : `#${fragment}`, local: false, entry };
}
function atPointer(schema, fragment) {
  if (fragment === "") return schema;
  if (!fragment.startsWith("#/")) return undefined;
  return fragment.slice(2).split("/").reduce((value, token) => isSchema(value) ? value[token.replaceAll("~1", "/").replaceAll("~0", "~")] : undefined, schema);
}
function renderSchema(schema, root, references = [], inheritedBase = resolvedBase(root)) {
  if (schema === true) return "unknown";
  if (schema === false) return "never";
  if (!isSchema(schema)) return "unknown";
  const base = resolvedBase(schema, inheritedBase);
  if (Array.isArray(schema.allOf)) { const { allOf, ...local } = schema; return [local, ...allOf].map((part) => `(${renderSchema(part, root, references, base)})`).join(" & "); }
  if (typeof schema.$ref === "string") {
    const resolved = resolveReference(schema.$ref, root, references, base);
    const local = /^#\/\$defs\/([A-Za-z_$][A-Za-z0-9_$]*)$/u.exec(schema.$ref);
    if (local && resolved?.local && isSchema(root.$defs) && Object.hasOwn(root.$defs, local[1])) return local[1];
    const target = resolved === undefined ? undefined : atPointer(resolved.schema, resolved.fragment);
    if (target === undefined) return "unknown";
    if (resolved.fragment === "" && resolved.entry?.internal !== true) return resolved.entry.typeName;
    return renderSchema(target, resolved.schema, references, resolvedBase(resolved.schema));
  }
  if (Object.hasOwn(schema, "const")) return quoted(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map(quoted).join(" | ") || "never";
  for (const keyword of ["anyOf", "oneOf"]) if (Array.isArray(schema[keyword])) return schema[keyword].map((member) => renderSchema(member, root, references, base)).join(" | ") || "never";
  if (schema.type === "object") {
    if (!isSchema(schema.properties)) return "Record<string, unknown>";
    const required = new Set(Array.isArray(schema.required) ? schema.required.filter((key) => typeof key === "string") : []);
    const properties = Object.entries(schema.properties).map(([key, value]) => `readonly ${quoted(key)}${required.has(key) ? "" : "?"}: ${renderSchema(value, root, references, base)};`);
    return properties.length === 0 ? "{}" : `{ ${properties.join(" ")} }`;
  }
  if (schema.type === "array") {
    if (Array.isArray(schema.prefixItems)) return renderTuple(schema.prefixItems, schema.minItems, schema.items ?? true, root, references, base);
    if (Array.isArray(schema.items)) return renderTuple(schema.items, schema.minItems, schema.additionalItems ?? true, root, references, base);
    if (schema.items === false) return "readonly []";
    const item = renderSchema(schema.items ?? true, root, references, base);
    return `readonly ${item.includes(" | ") || item.includes(" & ") ? `(${item})` : item}[]`;
  }
  if (Array.isArray(schema.type)) return schema.type.map(renderTypeName).join(" | ") || "unknown";
  return renderTypeName(schema.type);
}

export function transformJsonSchemaToTypescript(schema, options = {}) {
  if (schema !== true && schema !== false && !isSchema(schema)) throw new TypeError("schema must be a JSON Schema object or boolean");
  if (!isSchema(options)) throw new TypeError("options must be an object");
  const typeName = identifier(options.typeName ?? (isSchema(schema) && typeof schema.title === "string" ? schema.title : "Schema"), "typeName");
  const references = Array.isArray(options.references) ? options.references : [];
  const definitions = isSchema(schema) && isSchema(schema.$defs) ? Object.entries(schema.$defs) : [];
  const aliases = definitions.map(([name, definition]) => `export type ${identifier(name, "$defs key")} = ${renderSchema(definition, schema, references)};`);
  return [...aliases, `export type ${typeName} = ${renderSchema(schema, schema, references)};`, ""].join("\n");
}

function schemaLiteralType(value) {
  if (Array.isArray(value)) return `readonly [${value.map(schemaLiteralType).join(", ")}]`;
  if (isSchema(value)) return `{ ${Object.entries(value).map(([key, item]) => `readonly ${quoted(key)}: ${schemaLiteralType(item)};`).join(" ")} }`;
  return quoted(value);
}

/** Derive runtime ESM and declarations from the same schema entries.
 * The default TypeScript module remains available for existing generation consumers. */
export function renderJsonSchemaModule(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) throw new TypeError("entries must be a nonempty array");
  if (!isSchema(options)) throw new TypeError("options must be an object");
  const format = options.format ?? "typescript";
  if (!["typescript", "javascript", "declaration"].includes(format)) throw new TypeError("format must be typescript, javascript, or declaration");
  const runtimeBinding = options.runtimeBinding === undefined ? undefined : options.runtimeBinding;
  if (runtimeBinding !== undefined && (!isSchema(runtimeBinding) || typeof runtimeBinding.from !== "string" || runtimeBinding.from === "" || typeof runtimeBinding.name !== "string" || runtimeBinding.name === "")) throw new TypeError("runtimeBinding must name an import");
  const names = new Set();
  const ordered = [...entries].map((entry) => {
    if (!isSchema(entry) || !isSchema(entry.schema)) throw new TypeError("each entry must contain a schema object");
    const exportName = identifier(entry.exportName, "exportName");
    if (names.has(exportName)) throw new TypeError(`duplicate exportName ${exportName}`);
    names.add(exportName);
    const runtimeName = entry.runtimeName === undefined ? undefined : identifier(entry.runtimeName, "runtimeName");
    const aliases = entry.aliases === undefined ? [] : entry.aliases;
    if (!Array.isArray(aliases) || !aliases.every((name) => typeof name === "string")) throw new TypeError("aliases must contain strings");
    if (runtimeName !== undefined && runtimeBinding === undefined) throw new TypeError("runtimeName requires runtimeBinding");
    return { exportName, typeName: identifier(entry.typeName, "typeName"), schema: entry.schema, runtimeName, aliases, internal: entry.internal === true };
  }).sort((left, right) => left.exportName.localeCompare(right.exportName));
  const runtimeReferences = (entry) => {
    const found = new Set();
    const visitedEntries = new Set();
    const visit = (value, root, inheritedBase) => {
      if (!isSchema(value)) return;
      const base = resolvedBase(value, inheritedBase);
      if (typeof value.$ref === "string") {
        const candidate = resolveReference(value.$ref, root, ordered, base)?.entry;
        if (candidate && candidate !== entry) {
          found.add(candidate.exportName);
          visitEntry(candidate);
        }
      }
      for (const key of ["additionalItems", "additionalProperties", "contains", "contentSchema", "else", "if", "items", "not", "propertyNames", "then", "unevaluatedItems", "unevaluatedProperties"]) visit(value[key], root, base);
      for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"]) if (Array.isArray(value[key])) for (const child of value[key]) visit(child, root, base);
      for (const key of ["$defs", "definitions", "dependentSchemas", "patternProperties", "properties"]) if (isSchema(value[key])) for (const child of Object.values(value[key])) visit(child, root, base);
      if (Array.isArray(value.items)) for (const child of value.items) visit(child, root, base);
      if (isSchema(value.dependencies)) for (const child of Object.values(value.dependencies)) visit(child, root, base);
    };
    const visitEntry = (candidate) => {
      if (visitedEntries.has(candidate)) return;
      visitedEntries.add(candidate);
      visit(candidate.schema, candidate.schema, resolvedBase(candidate.schema));
    };
    visitEntry(entry);
    return [...found].sort();
  };
  return [
    "/** Generated from specifications/*.schema.json. Do not edit. */",
    runtimeBinding === undefined ? undefined : `import ${format === "declaration" ? "type " : ""}{ ${runtimeBinding.name} } from ${quoted(runtimeBinding.from)};`,
    ...ordered.flatMap(({ exportName, typeName, schema, internal }) => [
      format === "javascript" ? undefined : transformJsonSchemaToTypescript(schema, { typeName, references: ordered }),
      format === "declaration"
        ? `${internal ? "" : "export "}declare const ${exportName}: ${schemaLiteralType(schema)};`
        : `${internal ? "const" : "export const"} ${exportName} = Object.freeze(${JSON.stringify(schema, null, 2)}${format === "typescript" ? " as const" : ""});`,
      "",
    ]),
    ...ordered.map((entry) => entry.runtimeName === undefined ? undefined : format === "declaration"
      ? `export declare const ${entry.runtimeName}: ReturnType<typeof ${runtimeBinding.name}${runtimeBinding.genericSchema === true ? `<typeof ${entry.exportName}>` : ""}>;`
      : `export const ${entry.runtimeName} = ${runtimeBinding.name}(${entry.exportName}${runtimeReferences(entry).length === 0 ? "" : `, [${runtimeReferences(entry).join(", ")}]`});`),
  ].filter((line) => line !== undefined).join("\n");
}
