import { freezeJson } from "@red-cup-engineering/json-services-section";
import { serializeLines } from "@red-cup-engineering/jsonl-services-section";
import { admitTextFileCreationProjectionSet } from "@red-cup-engineering/computer-file-engineering-services-section/admit-text-file-creation-projection-set";
import { projectJsnodeOperationPackageReadme } from "./project-jsnode-operation-package-readme.mjs";
import { projectJsnodeOperationTests } from "./project-jsnode-operation-tests.mjs";
import { projectJsnodeModules } from "./project-jsnode-modules.mjs";
import { sha256Digest } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

/** Projects an admitted operation specification without npm packaging or installation. */
export function projectJsnodeOperationModules(specification) {
  if (specification?.type !== "JsnodeOperationPackageSpecification" || specification.version !== 2) {
    throw new TypeError("an admitted module-based package specification is required");
  }
  const operations = specification.operations.map((operation) => ({
    name: operation.commandName, module: operation.path, exportName: operation.exportName,
    description: operation.documentation.description,
    ...(operation.arguments.inputSchema == null ? {} : { inputSchema: operation.arguments.inputSchema }),
    ...(operation.arguments.outputSchema == null ? {} : { outputSchema: operation.arguments.outputSchema }),
  }));
  return projectJsnodeModules({
    sources: specification.sources.map(({ path, text }) => ({ path, text })), operations,
    ...(specification.app === null ? {} : { cli: { path: specification.app.path, name: specification.app.commandName, description: specification.topic + " operations" } }),
  });
}

/** Optional npm packaging of the same source-module projection used without packages. */
export function projectJsnodeOperationPackage(specification) {
  const files = projectJsnodeOperationModules(specification);
  const operations = specification.operations.map((operation) => ({ name: operation.commandName, module: operation.path }));
  const manifest = {
    name: specification.packageName, version: specification.packageVersion, type: "module", license: specification.license,
    exports: Object.fromEntries(operations.map((operation) => ["./" + operation.name, "./" + operation.module])),
    // No bin: the catalog is a declaration, run by javascript-node's run-javascript-node-operation-module.
    files: ["src", "apps", "data/records/schema", "README.md", "package.json"],
    dependencies: specification.dependencies, devDependencies: specification.devDependencies,
    scripts: { check: files.filter((file) => file.path.endsWith(".mjs")).map((file) => "node --check " + "'" + file.path.replaceAll("'", "'\"'\"'") + "'").join(" && "), test: "node --test test/*.test.mjs" },
    engines: { node: ">=24.2.0" },
  };
  const file = (path, text) => ({ type: "TextFileCreationProjection", version: 1, path, text, mode: 0o644 });
  const projected = [
    file("package.json", JSON.stringify(manifest, null, 2) + "\n"), ...files,
    ...projectJsnodeOperationTests(specification),
    projectJsnodeOperationPackageReadme(specification),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const filesDigest = sha256Digest(serializeLines(projected));
  const admitted = admitTextFileCreationProjectionSet({ type: "TextFileCreationProjectionSet", version: 1, files: projected, filesDigest });
  if (admitted.type !== "TextFileCreationProjectionSet") throw new TypeError(admitted.message);
  return freezeJson({ type: "JsnodeOperationPackageProjection", version: 2, packageName: specification.packageName, packageVersion: specification.packageVersion, files: admitted.files, filesDigest: admitted.filesDigest });
}
