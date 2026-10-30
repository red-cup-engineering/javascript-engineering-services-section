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
  // A package wrapper cannot launder an unread v2 SAS/HLD/LLD into a
  // settled capability merely because a provider reports state=realized.
  const profile = input.specification?.profile;
  const requiresLineage = profile === "org.red-cup-engineering.capcell.v2";
  const lineageDefects = [];
  if (requiresLineage) {
    const manifest = fabrication.manifest;
    if (manifest?.profile !== profile) lineageDefects.push("lineage:profile-mismatch");
    if (manifest?.lineageIntegrity !== "digest-verified") {
      lineageDefects.push("lineage:source-digests-unverified");
    }
    if (!Array.isArray(manifest?.missing) || manifest.missing.length > 0 ||
        typeof manifest.specification !== "string" ||
        !/^ni:\/\/\/sha-256;[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u.test(manifest.specification)) {
      lineageDefects.push("lineage:fabrication-closure-unverified");
    }
    if (!input.specification?.package?.name ||
        input.specification.package.name !== input.packageManifest?.name ||
        input.specification.package.version !== input.packageManifest?.version) {
      lineageDefects.push("lineage:package-identity-unverified");
    }
    if (packageSettlement?.type !== "PackageBackedSettlementAssayReceipt" ||
        !Array.isArray(packageSettlement.defects) || packageSettlement.defects.length > 0) {
      lineageDefects.push("lineage:package-assay-unverified");
    }
    for (const kind of ["sas", "hld", "lld"]) {
      const expected = input.specification?.lineage?.[kind];
      const observed = manifest?.lineage?.[kind];
      if (!expected || !observed ||
        ["uri", "revision", "sha256"].some((field) => expected[field] !== observed[field])) {
        lineageDefects.push(`lineage:${kind}:source-pin-mismatch`);
      }
    }
    // HTTP JSON with digest-verified or settled flags is only a *provider
    // assertion*. Unlike an in-process verified CapCell bundle, it carries no
    // unforgeable source-read authority. The consuming workflow supplies two
    // distinct externally authenticated checks, each bound to the EXACT
    // returned provider evidence and caller's required specification/package.
    const independentlyVerified = async (verify, evidence) => {
      if (typeof verify !== "function") return false;
      try { return (await verify(evidence)) === true; } catch { return false; }
    };
    const fabricationVerified = await independentlyVerified(bindings.verifyFabricationReceipt, {
      specification: input.specification,
      expectedLineage: input.specification?.lineage,
      manifest: fabrication.manifest,
      fabrication,
    });
    if (!fabricationVerified) lineageDefects.push("lineage:fabrication-provider-unverified");
    const settlementVerified = await independentlyVerified(bindings.verifyPackageSettlementReceipt, {
      specification: input.specification,
      packageManifest: input.packageManifest,
      fabrication,
      packageSettlement,
    });
    if (!settlementVerified) lineageDefects.push("lineage:settlement-provider-unverified");
  }
  return Object.freeze({
    type: "PackageBackedCapCellFabricationReceipt",
    operation: OPERATION,
    fabrication,
    packageSettlement,
    ...(requiresLineage ? {lineageDefects: Object.freeze(lineageDefects)} : {}),
    settled: fabrication.manifest?.state === "realized"
      && packageSettlement.settled === true && lineageDefects.length === 0,
  });
}
