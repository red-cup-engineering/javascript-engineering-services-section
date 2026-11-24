import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditNodePackageCapabilities, internalScopesFromNpmrc } from "./audit-node-package-capabilities.mjs";

async function writeManifest(root, directory, manifest, lockfile = null) {
  const packageDirectory = join(root, directory);
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(join(packageDirectory, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  if (lockfile) await writeFile(join(packageDirectory, lockfile), "lockfileVersion: '9.0'\n");
}

test("audits release-first workspace findings without treating source-version disagreement as an error", async () => {
  const root = await mkdtemp(join(tmpdir(), "node-package-audit-"));
  try {
    await writeFile(join(root, "pnpm-workspace.yaml"), "packages:\n  - packages/**\n");
    await writeFile(join(root, ".npmrc"), "registry=https://registry.npmjs.org/\n@example:registry=http://registry.example.test/\n");
    await writeManifest(root, "packages/provider", {
      name: "@example/provider", version: "2.0.0", private: false,
      description: "Provider", license: "MIT", repository: "https://example.test/provider",
    });
    await writeManifest(root, "packages/consumer", {
      name: "@example/consumer", version: "1.0.0", private: false,
      description: "Consumer", license: "MIT", repository: "https://example.test/consumer",
      dependencies: { "@example/provider": "workspace:^" },
    });
    await writeManifest(root, "packages/coordinated", {
      name: "@example/coordinated", version: "1.0.0", private: false,
      description: "Coordinated", license: "MIT", repository: "https://example.test/coordinated",
      releasePlan: {
        kind: "coordinated", id: "2026-08-release",
        packages: ["@example/coordinated", "@example/provider"],
        dependencyBindings: { "@example/provider": "2.0.0" },
      },
      dependencies: { "@example/provider": "workspace:^" },
    });
    await writeManifest(root, "packages/broken", {
      name: "@example/broken", version: "1.0.0", private: true,
      dependencies: { "@example/missing": "workspace:*" },
    });
    await writeManifest(root, "packages/verifier", {
      name: "@example/verifier", version: "1.0.0", private: true,
      dependencies: { "@example/provider": "1.0.0", "@example/missing-exact": "1.0.0" },
    });
    await writeManifest(root, "packages/incomplete", {
      name: "@example/incomplete", version: "1.0.0", private: false,
      description: "Incomplete coordinated plan", license: "MIT", repository: "https://example.test/incomplete",
      releasePlan: { kind: "coordinated", id: "2026-08-release", packages: ["@example/incomplete"] },
      dependencies: { "@example/provider": "workspace:^" },
    });
    await writeManifest(root, "packages/leaf", {
      name: "@example/leaf", version: "1.0.0", private: true,
      scripts: { deploy: "example deploy" },
    }, "package-lock.json");

    const result = await auditNodePackageCapabilities(root);

    assert.equal(result.policy, "release-first");
    assert.equal(result.lockAuthority.finding, "missing-authoritative-root-pnpm-lock");
    assert.deepEqual(result.internalScopes, ["@example"]);
    assert.deepEqual(result.missingInternalProviders.map((edge) => edge.dependency), ["@example/missing", "@example/missing-exact"]);
    assert.deepEqual(result.releaseBlockedWorkspaceEdges.map((edge) => edge.consumerName), ["@example/broken", "@example/consumer", "@example/incomplete"]);
    assert.equal(result.releaseBlockedWorkspaceEdges.find((edge) => edge.consumerName === "@example/broken").consumerPublishable, false);
    assert.deepEqual(result.releaseBlockedWorkspaceEdges.find((edge) => edge.consumerName === "@example/incomplete").coordinatedReleasePlan.reasons,
      ["provider-not-release-plan-participant", "missing-dependency-binding"]);
    assert.deepEqual(result.registryVerificationNeeded.map((finding) => finding.dependency), ["@example/provider"]);
    assert.equal(result.leafPackageLocks.length, 1);
    assert.equal(result.leafPackageLocks[0].locks[0], "package-lock.json");
    assert.ok(result.missingPackageLocks.some((finding) => finding.path.endsWith("packages/consumer/package.json")));
    assert.equal(result.inventory.find((record) => record.name === "@example/leaf").classification.deployable, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("extracts internal scopes only from npm scope registry declarations", () => {
  assert.deepEqual(internalScopesFromNpmrc("# @ignored:registry=x\n@union:registry=https://registry.test/\n@union:always-auth=true\n@other:registry = https://registry.test/\n"),
    ["@other", "@union"]);
});

test("uses explicit release classes to report registry eligibility and private contradictions", async () => {
  const root = await mkdtemp(join(tmpdir(), "node-package-audit-release-class-"));
  const publishMetadata = {
    version: "1.0.0", description: "Release artifact", license: "MIT",
    files: ["src", "package.json"], engines: { node: ">=22" }, publishConfig: { access: "public", provenance: true },
  };
  try {
    await writeManifest(root, "library", {
      name: "@example/library", private: false, release: { class: "releasable-library" }, exports: "./src/index.mjs", ...publishMetadata,
    });
    await writeManifest(root, "cli", {
      name: "@example/cli", private: false, release: { class: "releasable-cli" }, bin: { example: "cli.mjs" }, ...publishMetadata,
    });
    await writeManifest(root, "application", {
      name: "@example/application", private: false, release: { class: "deployable-application" }, scripts: { start: "node src/server.mjs" }, ...publishMetadata,
    });
    await writeManifest(root, "structural", {
      name: "@example/structural", private: true, release: { class: "structural" }, version: "1.0.0",
    });
    await writeManifest(root, "private-executable", {
      name: "@example/private-executable", private: true, release: { class: "private-executable" }, bin: { internal: "cli.mjs" }, version: "1.0.0",
    });
    await writeManifest(root, "private-application", {
      name: "@example/private-application", private: true, release: { class: "private-application" }, version: "1.0.0",
    });
    await writeManifest(root, "missing-class", { name: "@example/missing-class", private: false, version: "1.0.0" });
    await writeManifest(root, "invalid-class", {
      name: "@example/invalid-class", private: false, version: "1.0.0", release: { class: "unsupported" },
    });
    await writeManifest(root, "wrong-private-structural", {
      name: "@example/wrong-private-structural", private: false, version: "1.0.0", release: { class: "structural" },
    });
    await writeManifest(root, "wrong-private-cli", {
      name: "@example/wrong-private-cli", private: true, release: { class: "releasable-cli" }, bin: { example: "cli.mjs" }, ...publishMetadata,
    });
    await writeManifest(root, "missing-metadata", {
      name: "@example/missing-metadata", private: false, version: "1.0.0", release: { class: "deployable-application" },
    });

    const result = await auditNodePackageCapabilities(root);

    assert.equal(result.summary.missingReleaseClasses, 1);
    assert.equal(result.summary.invalidReleaseClasses, 1);
    assert.equal(result.summary.releaseClassPrivateContradictions, 2);
    assert.equal(result.summary.registryArtifacts, 5);
    assert.equal(result.summary.eligibleRegistryArtifacts, 3);
    assert.equal(result.summary.registryArtifactsMissingPublishMetadata, 1);
    assert.deepEqual(result.releaseClassFindings.map((finding) => finding.finding), ["invalid-release-class", "missing-release-class"]);
    assert.deepEqual(result.releaseClassPrivateContradictions.map((finding) => finding.name).sort(),
      ["@example/wrong-private-cli", "@example/wrong-private-structural"]);
    assert.deepEqual(result.registryArtifactEligibility
      .filter((finding) => ["@example/structural", "@example/private-executable", "@example/private-application"].includes(finding.name))
      .map(({ registryArtifact, eligible }) => ({ registryArtifact, eligible })), [
        { registryArtifact: false, eligible: true },
        { registryArtifact: false, eligible: true },
        { registryArtifact: false, eligible: true },
      ]);
    assert.deepEqual(result.registryArtifactEligibility.find((finding) => finding.name === "@example/missing-metadata").missingPublishMetadata,
      [
        "missing-description",
        "missing-license",
        "missing-files-allowlist",
        "missing-engines-node",
        "missing-publish-config-access",
        "missing-publish-config-provenance",
        "missing-deployable-surface",
      ]);
    assert.deepEqual(result.registryArtifactEligibility.find((finding) => finding.name === "@example/wrong-private-cli").reasons,
      ["release-class-requires-private-false"]);
    assert.deepEqual(result.publishablePackagesMissingReleaseMetadata.map((finding) => finding.name), ["@example/missing-metadata"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
