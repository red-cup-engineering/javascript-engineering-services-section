export const OPERATION = "fabricate-package-backed-capcell";

async function invoke(action, input, fetchImpl) {
  const response = await fetchImpl(action, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(input)});
  const value = await response.json();
  if (!response.ok) throw new Error(`${action} refused: ${value.reason ?? response.status}`);
  return value;
}

export async function fabricatePackageBackedCapCell(input, bindings = {}, fetchImpl = fetch) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype) throw new TypeError("input must be a plain record");
  const fabricateAction = bindings.fabricateAction;
  const assayAction = bindings.assayAction;
  if (!fabricateAction || !assayAction) throw new TypeError("both provider actions must be bound");
  const [fabrication, packageSettlement] = await Promise.all([
    invoke(fabricateAction, {specification: input.specification, evidence: input.evidence ?? {}}, fetchImpl),
    invoke(assayAction, {specification: input.specification, packageManifest: input.packageManifest}, fetchImpl),
  ]);
  return Object.freeze({
    type: "PackageBackedCapCellFabricationReceipt",
    operation: OPERATION,
    fabrication,
    packageSettlement,
    settled: fabrication.manifest?.state === "realized" && packageSettlement.settled === true,
  });
}
