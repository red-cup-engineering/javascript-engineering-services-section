/** Shared pure output-path projection; no source inspection or host reads. */
export const schemaPath = (operation, side) => operation[`${side}SchemaPath`] ?? `data/records/schema/${operation.name}.${side}.schema.json`;

export function confined(pathname, prefix) {
  if (typeof pathname !== "string" || pathname.startsWith("/") || pathname.includes("\\")) throw new TypeError(`unsafe path: ${pathname}`);
  const parts = pathname.split("/");
  if (parts[0] !== prefix || parts.some((part) => part === "" || part === "." || part === "..")) throw new TypeError(`unsafe path: ${pathname}`);
}

/** Project source-free output paths from the same schema and module rules as emitted files. */
export function projectJsnodeModulePaths({ operations, sources = [], dataModules = [], cli }) {
  const paths = [], sourcePaths = new Set(), dataPaths = new Set();
  if (!Array.isArray(operations) || !Array.isArray(sources) || !Array.isArray(dataModules))
    throw new TypeError("operations, sources and dataModules must be arrays");
  for (const source of sources) {
    confined(source.path, "src");
    if (sourcePaths.has(source.path)) throw new TypeError(`duplicate source path: ${source.path}`);
    sourcePaths.add(source.path); paths.push(source.path);
  }
  for (const module of dataModules) {
    confined(module.path, "src");
    if (!module.path.endsWith(".mjs") || module.path.split("/").includes("node_modules"))
      throw new TypeError("data module path must name a confined ESM source file");
    if (sourcePaths.has(module.path) || dataPaths.has(module.path))
      throw new TypeError(`projected data module path is duplicated: ${module.path}`);
    dataPaths.add(module.path); paths.push(module.path);
  }
  for (const operation of operations) {
    confined(operation.module, "src");
    if (dataPaths.has(operation.module))
      throw new TypeError("a data module export cannot acquire a callable operation or CLI face");
    if (!paths.includes(operation.module)) paths.push(operation.module);
  }
  for (const operation of operations) for (const side of ["input", "output"]) {
    if (Object.hasOwn(operation, `${side}Schema`) && !Object.hasOwn(operation, `${side}SchemaPath`)) {
      const target = schemaPath(operation, side);
      confined(target, "data");
      if (paths.includes(target)) throw new TypeError(`projected path is duplicated: ${target}`);
      paths.push(target);
    }
  }
  if (cli) {
    confined(cli.path, "apps");
    if (paths.includes(cli.path)) throw new TypeError(`projected path is duplicated: ${cli.path}`);
    paths.push(cli.path);
  }
  return Object.freeze(paths.sort());
}

