#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";

const ignoredDirectoryNames = new Set([".git", "legacy", "node_modules"]);
const dependencySections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
const lockfileNames = ["pnpm-lock.yaml", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock"];
const exactVersionPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const releaseClasses = new Set([
  "structural",
  "private-executable",
  "private-application",
  "releasable-library",
  "releasable-cli",
  "deployable-application",
]);
const registryArtifactClasses = new Set(["releasable-library", "releasable-cli", "deployable-application"]);
const privateClasses = new Set(["structural", "private-executable", "private-application"]);

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function packageFilesBelow(root) {
  const files = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name === "package.json") files.push(path);
    }
  }

  await walk(root);
  return files.sort();
}

function valuesFromBin(bin) {
  if (!bin) return [];
  if (typeof bin === "string") return ["."];
  if (typeof bin !== "object" || Array.isArray(bin)) return [];
  return Object.keys(bin).sort();
}

function declaredDependencies(manifest) {
  return dependencySections.flatMap((section) => Object.entries(manifest[section] ?? {})
    .filter(([, specifier]) => typeof specifier === "string")
    .map(([name, specifier]) => ({ name, section, specifier })));
}

function duplicateGroups(packages, select) {
  const grouped = new Map();
  for (const packageRecord of packages) {
    for (const value of select(packageRecord)) {
      const paths = grouped.get(value) ?? [];
      paths.push(packageRecord.path);
      grouped.set(value, paths);
    }
  }
  return [...grouped.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([value, paths]) => ({ value, count: paths.length, paths: paths.sort() }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
}

function hasCoordinatedReleasePlanDeclaration(manifest) {
  const plan = manifest.releasePlan;
  return Boolean(plan && typeof plan === "object" && !Array.isArray(plan)
    && plan.kind === "coordinated" && typeof plan.id === "string" && plan.id.length > 0);
}

export function internalScopesFromNpmrc(npmrc) {
  const scopes = new Set();
  for (const line of npmrc.split(/\r?\n/)) {
    const match = line.match(/^\s*(@[A-Za-z0-9._-]+):registry\s*=/);
    if (match) scopes.add(match[1]);
  }
  return [...scopes].sort();
}

async function internalScopesAt(root) {
  const npmrc = join(root, ".npmrc");
  if (!await exists(npmrc)) return [];
  return internalScopesFromNpmrc(await readFile(npmrc, "utf8"));
}

function packageScope(name) {
  return typeof name === "string" && name.startsWith("@") ? name.split("/", 1)[0] : null;
}

function coordinatedReleasePlanForEdge(manifest, consumer, provider, dependency) {
  const plan = manifest.releasePlan;
  const reasons = [];
  if (!hasCoordinatedReleasePlanDeclaration(manifest)) reasons.push("missing-coordinated-release-plan");
  const participants = Array.isArray(plan?.packages) ? plan.packages : [];
  if (!participants.includes(consumer.name)) reasons.push("consumer-not-release-plan-participant");
  if (!provider) reasons.push("provider-not-found");
  else if (!participants.includes(provider.name)) reasons.push("provider-not-release-plan-participant");
  const binding = plan?.dependencyBindings?.[dependency.name];
  if (typeof binding !== "string") reasons.push("missing-dependency-binding");
  else if (!exactVersionPattern.test(binding)) reasons.push("dependency-binding-is-not-exact-version");
  else if (provider?.version && binding !== provider.version) reasons.push("dependency-binding-does-not-match-provider-version");

  return {
    declared: hasCoordinatedReleasePlanDeclaration(manifest),
    valid: reasons.length === 0,
    reasons,
    id: hasCoordinatedReleasePlanDeclaration(manifest) ? plan.id : null,
    binding: typeof binding === "string" ? binding : null,
  };
}

function packageClassification(manifest, bins) {
  const scripts = manifest.scripts && typeof manifest.scripts === "object" && !Array.isArray(manifest.scripts)
    ? Object.keys(manifest.scripts).sort()
    : [];
  const deployScripts = scripts.filter((name) => /(^|:|-)deploy($|:|-)/i.test(name));
  const privateDeclared = typeof manifest.private === "boolean";
  const hasEntrypoint = ["main", "module", "exports", "types", "typings"].some((field) => field in manifest);

  const releaseClass = declaredReleaseClass(manifest);

  return {
    // Every discovered package.json is structural inventory, not evidence of a release.
    structural: true,
    private: privateDeclared ? manifest.private : null,
    executable: bins.length > 0 || scripts.length > 0,
    // Releasability is declared by release.class, never inferred from npm's
    // default publishability or from a bin/deploy-script observation.
    releasable: registryArtifactClasses.has(releaseClass.value),
    deployable: deployScripts.length > 0,
    declarations: {
      private: privateDeclared,
      executable: bins.length > 0 || scripts.length > 0,
      releasable: privateDeclared,
      deployable: deployScripts.length > 0,
      entrypoint: hasEntrypoint,
      releaseClass: releaseClass.value !== null,
      coordinatedReleasePlan: hasCoordinatedReleasePlanDeclaration(manifest),
    },
    releaseClass,
    deployScripts,
  };
}

function declaredReleaseClass(manifest) {
  const declaration = manifest.release;
  if (!declaration || typeof declaration !== "object" || Array.isArray(declaration)
    || typeof declaration.class !== "string") {
    return { value: null, finding: "missing-release-class" };
  }
  if (!releaseClasses.has(declaration.class)) {
    return { value: null, finding: "invalid-release-class", declared: declaration.class };
  }
  return { value: declaration.class, finding: null };
}

async function findWorkspaceRoot(root) {
  let candidate = resolve(root);
  while (true) {
    if (await exists(join(candidate, "pnpm-workspace.yaml"))) return candidate;
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

async function locksAt(directory) {
  const locks = [];
  for (const name of lockfileNames) if (await exists(join(directory, name))) locks.push(name);
  return locks;
}

function publishable(record) {
  // This is release policy eligibility, not npm's default behavior when private is
  // omitted. Only an explicit registry-artifact class may enter this path.
  return registryArtifactClasses.has(record.classification.releaseClass.value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasExportsSurface(exports) {
  if (nonEmptyString(exports)) return true;
  return Boolean(exports && typeof exports === "object" && !Array.isArray(exports) && Object.keys(exports).length > 0);
}

function hasBinSurface(bin) {
  if (nonEmptyString(bin)) return true;
  return Boolean(bin && typeof bin === "object" && !Array.isArray(bin) && Object.keys(bin).length > 0);
}

function hasDeployableSurface(manifest) {
  if (hasExportsSurface(manifest.exports) || hasBinSurface(manifest.bin)) return true;
  const scripts = manifest.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return false;
  return nonEmptyString(scripts.start)
    || Object.entries(scripts).some(([name, command]) => /(^|:|-)deploy($|:|-)/i.test(name) && nonEmptyString(command));
}

function publishMetadataFailures(manifest, releaseClass) {
  const failures = [];
  if (typeof manifest.version !== "string") failures.push("missing-version");
  else if (!exactVersionPattern.test(manifest.version)) failures.push("version-not-exact");
  if (!nonEmptyString(manifest.description)) failures.push("missing-description");
  if (!nonEmptyString(manifest.license)) failures.push("missing-license");
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) failures.push("missing-files-allowlist");
  if (!manifest.engines || typeof manifest.engines !== "object" || Array.isArray(manifest.engines)
    || !nonEmptyString(manifest.engines.node)) failures.push("missing-engines-node");
  if (!manifest.publishConfig || typeof manifest.publishConfig !== "object" || Array.isArray(manifest.publishConfig)
    || !nonEmptyString(manifest.publishConfig.access)) failures.push("missing-publish-config-access");
  if (!manifest.publishConfig || typeof manifest.publishConfig !== "object" || Array.isArray(manifest.publishConfig)
    || manifest.publishConfig.provenance !== true) failures.push("missing-publish-config-provenance");

  if (releaseClass === "releasable-library" && !hasExportsSurface(manifest.exports)) failures.push("missing-exports-surface");
  if (releaseClass === "releasable-cli" && !hasBinSurface(manifest.bin)) failures.push("missing-bin-surface");
  if (releaseClass === "deployable-application" && !hasDeployableSurface(manifest)) failures.push("missing-deployable-surface");
  return failures;
}

function releaseEligibility(record) {
  const { releaseClass } = record.classification;
  const reasons = [];

  if (releaseClass.finding) {
    reasons.push(releaseClass.finding);
    return {
      path: record.path,
      name: record.name,
      releaseClass: null,
      registryArtifact: false,
      eligible: false,
      reasons,
      missingPublishMetadata: [],
    };
  }

  const registryArtifact = registryArtifactClasses.has(releaseClass.value);
  const expectedPrivate = privateClasses.has(releaseClass.value);
  const missingPublishMetadata = registryArtifact ? publishMetadataFailures(record.manifest, releaseClass.value) : [];
  if (expectedPrivate && record.classification.private !== true) reasons.push("release-class-requires-private-true");
  if (registryArtifact && record.classification.private !== false) reasons.push("release-class-requires-private-false");
  reasons.push(...missingPublishMetadata);

  return {
    path: record.path,
    name: record.name,
    releaseClass: releaseClass.value,
    registryArtifact,
    eligible: reasons.length === 0,
    reasons,
    missingPublishMetadata,
  };
}

export async function auditNodePackageCapabilities(root) {
  const resolvedRoot = resolve(root);
  const packages = [];
  const invalidPackageJson = [];

  for (const path of await packageFilesBelow(resolvedRoot)) {
    try {
      const manifest = JSON.parse(await readFile(path, "utf8"));
      const bins = valuesFromBin(manifest.bin);
      packages.push({
        path,
        relativePath: relative(resolvedRoot, path),
        directory: dirname(path),
        name: typeof manifest.name === "string" ? manifest.name : null,
        version: typeof manifest.version === "string" ? manifest.version : null,
        bins,
        keywords: Array.isArray(manifest.keywords) ? manifest.keywords : [],
        manifest,
        dependencies: declaredDependencies(manifest),
        classification: packageClassification(manifest, bins),
      });
    } catch (error) {
      invalidPackageJson.push({ path, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const workspaceRoot = await findWorkspaceRoot(resolvedRoot);
  const canonicalRoot = workspaceRoot ?? resolvedRoot;
  const internalScopes = await internalScopesAt(canonicalRoot);
  const rootLocks = workspaceRoot ? await locksAt(workspaceRoot) : [];
  const hasAuthoritativeRootPnpmLock = rootLocks.includes("pnpm-lock.yaml");
  const providersByName = new Map(packages.filter((record) => record.name).map((record) => [record.name, record]));
  const duplicatePackageNames = duplicateGroups(packages, (record) => record.name ? [record.name] : []);
  const duplicateBinCommands = duplicateGroups(packages, (record) => record.bins);
  const packageLocks = await Promise.all(packages.map(async (record) => ({
    path: record.path,
    locks: await locksAt(record.directory),
  })));

  const workspaceEdges = [];
  const missingInternalProviders = [];
  const registryVerificationNeeded = [];
  for (const consumer of packages) {
    for (const dependency of consumer.dependencies) {
      const provider = providersByName.get(dependency.name);
      if (dependency.specifier.startsWith("workspace:")) {
        const coordinatedReleasePlan = coordinatedReleasePlanForEdge(consumer.manifest, consumer, provider, dependency);
        const edge = {
          consumer: consumer.path,
          consumerName: consumer.name,
          dependency: dependency.name,
          section: dependency.section,
          specifier: dependency.specifier,
          provider: provider?.path ?? null,
          coordinatedReleasePlan,
        };
        workspaceEdges.push(edge);
        if (!provider) missingInternalProviders.push({ ...edge, finding: "missing-internal-provider", reason: "workspace-edge" });
      } else if (!provider && internalScopes.includes(packageScope(dependency.name))
        && exactVersionPattern.test(dependency.specifier)) {
        missingInternalProviders.push({
          consumer: consumer.path,
          consumerName: consumer.name,
          dependency: dependency.name,
          section: dependency.section,
          specifier: dependency.specifier,
          provider: null,
          finding: "missing-internal-provider",
          reason: "missing-exact-internal-dependency",
        });
      }
      // A local source manifest is not the registry. Exact ranges can legitimately
      // target an already-published version, so report this for verification only.
      if (provider && !dependency.specifier.startsWith("workspace:")
        && exactVersionPattern.test(dependency.specifier)
        && provider.version && dependency.specifier !== provider.version) {
        registryVerificationNeeded.push({
          consumer: consumer.path,
          consumerName: consumer.name,
          dependency: dependency.name,
          section: dependency.section,
          requestedVersion: dependency.specifier,
          localSourceVersion: provider.version,
          provider: provider.path,
          finding: "registry-verification-needed",
        });
      }
    }
  }

  const releaseBlockedWorkspaceEdges = workspaceEdges.filter((edge) => {
    return !edge.coordinatedReleasePlan.valid;
  }).map((edge) => {
    const consumer = packages.find((record) => record.path === edge.consumer);
    return { ...edge, consumerPublishable: consumer ? publishable(consumer) : null };
  });
  const leafPackageLocks = packageLocks
    .filter((record) => record.locks.length > 0 && record.path !== join(workspaceRoot ?? "", "package.json"))
    .map((record) => ({ ...record, finding: "leaf-package-lock" }));
  const missingPackageLocks = packageLocks
    .filter((record) => record.locks.length === 0)
    .map((record) => ({ ...record, finding: "missing-package-lock" }));
  const releaseClassFindings = packages
    .filter((record) => record.classification.releaseClass.finding)
    .map((record) => ({
      path: record.path,
      name: record.name,
      finding: record.classification.releaseClass.finding,
      ...(record.classification.releaseClass.declared === undefined ? {} : { declared: record.classification.releaseClass.declared }),
    }));
  const releaseClassPrivateContradictions = packages
    .map(releaseEligibility)
    .filter((record) => record.reasons.includes("release-class-requires-private-true")
      || record.reasons.includes("release-class-requires-private-false"));
  const registryArtifactEligibility = packages.map(releaseEligibility);
  const publishablePackagesMissingReleaseMetadata = registryArtifactEligibility
    .filter((record) => record.missingPublishMetadata.length > 0)
    .map((record) => ({ path: record.path, name: record.name, missing: record.missingPublishMetadata }));

  const inventory = packages.map(({ manifest, dependencies, directory, ...record }) => ({
    ...record,
    dependencyCount: dependencies.length,
    publishable: publishable({ manifest, ...record }),
  }));

  return {
    type: "NodePackageCapabilityAudit",
    policy: "release-first",
    root: resolvedRoot,
    workspaceRoot,
    internalScopes,
    observedAt: new Date().toISOString(),
    summary: {
      activePackages: packages.length,
      invalidPackageJson: invalidPackageJson.length,
      packagesWithoutNames: packages.filter((record) => !record.name).length,
      packagesWithoutKeywords: packages.filter((record) => record.keywords.length === 0).length,
      packagesWithBins: packages.filter((record) => record.bins.length > 0).length,
      declaredBinCommands: packages.reduce((total, record) => total + record.bins.length, 0),
      duplicatePackageNames: duplicatePackageNames.length,
      duplicateBinCommands: duplicateBinCommands.length,
      workspaceEdges: workspaceEdges.length,
      releaseBlockedWorkspaceEdges: releaseBlockedWorkspaceEdges.length,
      missingInternalProviders: missingInternalProviders.length,
      missingPackageLocks: missingPackageLocks.length,
      leafPackageLocks: leafPackageLocks.length,
      publishablePackagesMissingReleaseMetadata: publishablePackagesMissingReleaseMetadata.length,
      registryVerificationNeeded: registryVerificationNeeded.length,
      missingReleaseClasses: releaseClassFindings.filter((finding) => finding.finding === "missing-release-class").length,
      invalidReleaseClasses: releaseClassFindings.filter((finding) => finding.finding === "invalid-release-class").length,
      releaseClassPrivateContradictions: releaseClassPrivateContradictions.length,
      registryArtifacts: registryArtifactEligibility.filter((record) => record.registryArtifact).length,
      eligibleRegistryArtifacts: registryArtifactEligibility.filter((record) => record.registryArtifact && record.eligible).length,
      registryArtifactsMissingPublishMetadata: registryArtifactEligibility
        .filter((record) => record.registryArtifact && record.missingPublishMetadata.length > 0).length,
    },
    inventory,
    lockAuthority: {
      workspaceRoot,
      authoritativeRootPnpmLock: hasAuthoritativeRootPnpmLock ? join(workspaceRoot, "pnpm-lock.yaml") : null,
      finding: hasAuthoritativeRootPnpmLock ? null : "missing-authoritative-root-pnpm-lock",
      rootLocks,
    },
    duplicatePackageNames,
    duplicateBinCommands,
    workspaceEdges,
    releaseBlockedWorkspaceEdges,
    missingInternalProviders,
    missingPackageLocks,
    leafPackageLocks,
    publishablePackagesMissingReleaseMetadata,
    registryVerificationNeeded,
    releaseClassFindings,
    releaseClassPrivateContradictions,
    registryArtifactEligibility,
    invalidPackageJson,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const root = resolve(argv[0] ?? "lib/emsenn/services/561-group");
  process.stdout.write(`${JSON.stringify(await auditNodePackageCapabilities(root), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  await main();
}
