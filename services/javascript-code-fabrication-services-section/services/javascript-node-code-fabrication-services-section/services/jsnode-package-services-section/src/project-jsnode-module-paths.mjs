/** Shared pure output-path projection; no source inspection or host reads. */
export const schemaPath = (operation, side) => operation[`${side}SchemaPath`] ?? `data/records/schema/${operation.name}.${side}.schema.json`;

export function confined(pathname, prefix) {
  if (typeof pathname !== "string" || pathname.startsWith("/") || pathname.includes("\\")) throw new TypeError(`unsafe path: ${pathname}`);
  const parts = pathname.split("/");
  if (parts[0] !== prefix || parts.some((part) => part === "" || part === "." || part === "..")) throw new TypeError(`unsafe path: ${pathname}`);
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
  return Object.freeze(paths.sort());
}

