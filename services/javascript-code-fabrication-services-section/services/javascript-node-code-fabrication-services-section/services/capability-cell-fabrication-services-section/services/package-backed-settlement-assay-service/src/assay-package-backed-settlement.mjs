export const OPERATION = "assay-package-backed-settlement";

function record(value, field) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${field} must be a plain record`);
  }
  return value;
}

export function assayPackageBackedSettlement(input) {
  record(input, "input");
  const specification = record(input.specification, "specification");
  const packageIdentity = record(specification.package, "specification.package");
  if (!Array.isArray(specification.materials)) {
    throw new TypeError("specification.materials must be an array");
  }

  const defects = [];
  const packageManifest = input.packageManifest;
  if (!packageManifest || Object.getPrototypeOf(packageManifest) !== Object.prototype) {
    defects.push("package-manifest:unobserved");
  } else if (packageManifest.name !== packageIdentity.name || packageManifest.version !== packageIdentity.version) {
    defects.push("package-manifest:identity-mismatch");
  } else {
    const admittedMaterials = new Set(specification.materials.map((material) => material?.package));
    for (const name of Object.keys(packageManifest.dependencies ?? {}).sort()) {
      if (!admittedMaterials.has(name)) defects.push(`dependency:${name}:unbound-effect`);
    }
  }

  return Object.freeze({
    type: "PackageBackedSettlementAssayReceipt",
    operation: OPERATION,
    settled: defects.length === 0,
    defects: Object.freeze(defects),
  });
}
