import { publicationFilesExclusionsOf } from './publication-files.mjs';
/**
 * @packageDocumentation
 *
 * publication-status - pure release artifact proof over an admitted package surface.
 *
 * The package surface names public commitments. This module does not read the
 * filesystem; callers supply artifact facts observed by a service boundary.
 */

import {
  publicationArtifactTargetContract,
  publicationReleasePolicyContract,
  publicationStatusProofContract,

} from "./schemas/publication-status.mjs";

function artifactFactMap(facts) {
  if ("get" in facts) return facts;
  return new Map(facts.map((fact) => [fact.target, fact]));
}

function withFact(
  target,
  facts,
) {
  const fact = facts.get(target.target);
  return publicationArtifactTargetContract.assert(Object.freeze({
    kind: "metroplat.publication-status.artifact-target",
    ...target,
    exists: fact?.exists ?? false,
    ...(fact?.executable === undefined ? {} : { executable: fact.executable }),
  }), "publication artifact target");
}

function surfaceExportEntries(surface) {
  const exportSurface = surface.exports;
  return exportSurface.entries;
}

function surfaceBinEntries(surface) {
  const binSurface = surface.bins;
  return binSurface.entries;
}

function exportTargets(surface, facts) {
  return Object.freeze(surfaceExportEntries(surface).flatMap((entry) => {
    const mode = entry.mode;
    const targets = [];
    if (entry.import !== undefined) {
      targets.push(withFact({
        face: "export",
        name: entry.specifier,
        obligation: "import",
        target: entry.import,
        mode,
      }, facts));
    }
    if (entry.types !== undefined) {
      targets.push(withFact({
        face: "export",
        name: entry.specifier,
        obligation: "types",
        target: entry.types,
        mode,
      }, facts));
    }
    return targets;
  }).sort((left, right) => `${left.name}:${left.obligation}`.localeCompare(`${right.name}:${right.obligation}`)));
}

function binTargets(surface, facts) {
  return Object.freeze(surfaceBinEntries(surface).map((entry) => withFact({
    face: "bin",
    name: entry.command,
    obligation: "bin",
    target: entry.target,
    mode: entry.mode,
  }, facts)).sort((left, right) => left.name.localeCompare(right.name)));
}

/**
 * Read the emitted artifact target paths named by one package surface.
 */
export function publicationArtifactTargetPathsOf(surface) {
  const targets = new Set();
  for (const entry of surfaceExportEntries(surface)) {
    if (entry.import !== undefined) targets.add(entry.import);
    if (entry.types !== undefined) targets.add(entry.types);
  }
  for (const entry of surfaceBinEntries(surface)) targets.add(entry.target);
  return Object.freeze([...targets].sort());
}

/**
 * Prove a package surface against supplied release artifact facts.
 */
export function publicationStatusProofOf(
  surface,
  facts,
) {
  const factMap = artifactFactMap(facts);
  const targets = Object.freeze([
    ...exportTargets(surface, factMap),
    ...binTargets(surface, factMap),
  ]);
  const missing = Object.freeze(targets.filter((target) => !target.exists).map((target) => target.target));
  const nonExecutableBins = Object.freeze(
    targets
      .filter((target) => target.obligation === "bin" && target.exists && target.executable !== true)
      .map((target) => target.target),
  );
  return publicationStatusProofContract.assert(Object.freeze({
    kind: "metroplat.publication-status.proof",
    source: surface.source,
    packageName: surface.packageName,
    surface,
    targets,
    missing,
    nonExecutableBins,
    ok: missing.length === 0 && nonExecutableBins.length === 0,
  }), "publication status proof");
}

function stringArrayField(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  return Object.freeze(value.filter((entry) => typeof entry === "string" && entry.length > 0));
}

function manifestScripts(admission) {
  const scripts = admission.manifest.scripts;
  if (scripts === undefined || scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) return Object.freeze([]);
  return Object.freeze(Object.keys(scripts).sort());
}

function manifestFiles(admission) {
  return stringArrayField((admission.manifest)["files"]);
}

function proofTargets(proof) {
  return proof.targets;
}

function excludedPublicationTargets(admission, proof) {
  return publicationFilesExclusionsOf(admission.manifest, proofTargets(proof).map(target => target.target));
}

function isTypeScriptRuntimeTarget(target) {
  return /\.(?:[cm]?ts|tsx)$/u.test(target);
}

function unsupportedNodeRuntimeTargets(proof) {
  return Object.freeze([
    ...new Set(
      proofTargets(proof)
        .filter((target) => target.obligation === "import" || target.obligation === "bin")
        .map((target) => target.target)
        .filter(isTypeScriptRuntimeTarget),
    ),
  ].sort());
}

function releasePolicyObligations(admission, proof) {
  const obligations = [];
  const excludedTargets = excludedPublicationTargets(admission, proof);
  const unsupportedTargets = unsupportedNodeRuntimeTargets(proof);
  if (!proof.ok) obligations.push("Repair missing or non-executable emitted artifact targets before any release artifact can be used.");
  if (admission.manifest.private === true) obligations.push("Package manifest is private; do not publish to the public npm registry.");
  if (excludedTargets.length > 0) obligations.push(`Package files allowlist excludes public artifact targets: ${excludedTargets.join(", ")}.`);
  if (unsupportedTargets.length > 0) obligations.push(`Installed Node.js packages cannot execute TypeScript runtime targets: ${unsupportedTargets.join(", ")}.`);
  return Object.freeze(obligations);
}

/**
 * Read an admitted manifest plus artifact proof as an explicit release policy.
 */
export function publicationReleasePolicyOf(
  admission,
  proof,
) {
  if (admission.manifest.name !== proof.packageName) {
    throw new TypeError(`publicationReleasePolicyOf: package names differ: ${admission.manifest.name} and ${proof.packageName}`);
  }
  const includedFiles = manifestFiles(admission);
  const scripts = manifestScripts(admission);
  const localArtifactOk = proof.ok
    && excludedPublicationTargets(admission, proof).length === 0
    && unsupportedNodeRuntimeTargets(proof).length === 0;
  return publicationReleasePolicyContract.assert(Object.freeze({
    kind: "metroplat.publication-status.release-policy",
    source: admission.source,
    packageName: admission.manifest.name,
    private: admission.manifest.private === true,
    artifactProof: proof,
    includedFiles,
    scripts,
    localArtifactOk,
    npmPublishable: localArtifactOk && admission.manifest.private !== true,
    obligations: releasePolicyObligations(admission, proof),
    evidence: Object.freeze([
      admission.source,
      "src/workspace/publication-status:publicationStatusProofOf",
      "src/workspace/publication-status:publicationReleasePolicyOf",
    ]),
  }), "publication release policy");
}
