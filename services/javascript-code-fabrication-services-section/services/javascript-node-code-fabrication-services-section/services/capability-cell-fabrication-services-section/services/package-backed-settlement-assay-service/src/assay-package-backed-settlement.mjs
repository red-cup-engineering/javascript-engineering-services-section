export const OPERATION = "assay-package-backed-settlement";

const plainRecord = (value) => value !== null && typeof value === "object"
  && Object.getPrototypeOf(value) === Object.prototype;

function record(value, field) {
  if (!plainRecord(value)) throw new TypeError(field + " must be a plain record");
  return value;
}

// SDK callers must not execute getter-backed evidence during admission.
// An HTTP JSON body naturally has own data properties only.
function ownData(value, key) {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor === undefined ? {present: false} :
    Object.hasOwn(descriptor, "value")
      ? {present: true, value: descriptor.value}
      : {present: true, accessor: true};
}

function sourceMaterials(specification, defects) {
  const required = new Set();
  for (const [i, material] of specification.materials.entries()) {
    if (!plainRecord(material) || typeof material.package !== "string"
      || material.package.length === 0) {
      defects.push("material:" + i + ":invalid");
      continue;
    }
    const name = material.package;
    if (required.has(name)) defects.push("material:" + name + ":duplicate");
    required.add(name);
    if (material.authority !== "none")
      defects.push("material:" + name + ":effectful");
    if (typeof material.semanticId !== "string" || material.semanticId.length === 0)
      defects.push("material:" + name + ":identity-unobserved");
  }
  return required;
}

function runtimeDependencies(packageManifest, required, defects) {
  const field = ownData(packageManifest, "dependencies");
  if (field.accessor) {
    defects.push("dependencies:unreadable");
    return;
  }
  if (field.present && !plainRecord(field.value)) {
    defects.push("dependencies:invalid");
    return;
  }
  const dependencies = field.present ? field.value : {};
  for (const name of Object.keys(dependencies).sort()) {
    if (!required.has(name)) defects.push("dependency:" + name + ":unbound-effect");
    const declaration = ownData(dependencies, name);
    if (declaration.accessor || typeof declaration.value !== "string" || declaration.value.length === 0)
      defects.push("dependency:" + name + ":declaration-invalid");
  }
  for (const name of [...required].sort()) {
    if (!Object.hasOwn(dependencies, name))
      defects.push("material:" + name + ":not-in-dependencies");
  }
}

function unexaminedRuntimeInputs(packageManifest, defects) {
  // Other npm dependency projections can introduce runtime code. They cannot
  // be admitted by a check of only the plain direct dependency family.
  for (const name of ["optionalDependencies", "peerDependencies", "bundledDependencies", "bundleDependencies"]) {
    const field = ownData(packageManifest, name);
    if (!field.present) continue;
    if (field.accessor || !plainRecord(field.value) || Object.keys(field.value).length > 0)
      defects.push("dependency-group:" + name + ":unassayed");
  }
  const scriptsField = ownData(packageManifest, "scripts");
  if (!scriptsField.present) return;
  if (scriptsField.accessor || !plainRecord(scriptsField.value)) {
    defects.push("package-manifest:scripts-unreadable");
    return;
  }
  for (const name of ["preinstall", "install", "postinstall", "prepack", "prepare", "postpack"]) {
    const script = ownData(scriptsField.value, name);
    if (script.present) defects.push("package-lifecycle:" + name + ":unassayed");
  }
}

export function assayPackageBackedSettlement(input) {
  record(input, "input");
  const specification = record(input.specification, "specification");
  const packageIdentity = record(specification.package, "specification.package");
  if (!Array.isArray(specification.materials))
    throw new TypeError("specification.materials must be an array");

  const defects = [];
  const required = sourceMaterials(specification, defects);
  const packageManifest = input.packageManifest;
  if (!plainRecord(packageManifest)) {
    defects.push("package-manifest:unobserved");
  } else if (typeof packageIdentity.name !== "string" || typeof packageIdentity.version !== "string"
    || !packageIdentity.name || !packageIdentity.version
    || packageManifest.name !== packageIdentity.name || packageManifest.version !== packageIdentity.version) {
    defects.push("package-manifest:identity-mismatch");
  } else {
    runtimeDependencies(packageManifest, required, defects);
    unexaminedRuntimeInputs(packageManifest, defects);
  }

  return Object.freeze({
    type: "PackageBackedSettlementAssayReceipt",
    operation: OPERATION,
    // This checks declared material/dependency cover only. It does NOT attest
    // installed bytes, material semantic identities, or provider authority.
    scope: "declared-direct-runtime-dependencies",
    settled: defects.length === 0,
    defects: Object.freeze(defects),
  });
}
