/**
 * decommissioned-imports — live packages reaching packages marked for removal.
 *
 * The package lifecycle is read from manifest keywords by the JSNode package
 * carrier. The source consumption index then resolves import specifiers to
 * workspace package names. This audit joins those two reads: a package that is
 * not itself decommissioned must not import from a package that is.
 */
import type { JSNodeWorkspace, PackageLifecycle } from "../../packages/carrier.mts";
import type { ConsumptionIndex, RawConsumption } from "../consumption.mjs";

export interface DecommissionedImportViolation {
  readonly consumer: string;
  readonly consumerLifecycle: PackageLifecycle;
  readonly provider: string;
  readonly providerLifecycle: PackageLifecycle;
  readonly file: string;
  readonly specifier: string;
  readonly mode: RawConsumption["mode"];
  readonly typeOnly: boolean;
  readonly name?: string;
}

export interface WorkspaceDecommissionedImportAudit {
  readonly kind: "jsnode.decommissioned-import-audit";
  readonly packageCount: number;
  readonly decommissionedPackages: readonly string[];
  readonly violatingConsumers: readonly string[];
  readonly violationCount: number;
  readonly violations: readonly DecommissionedImportViolation[];
}

export function packageIsDecommissioned(pkg: { readonly lifecycle: PackageLifecycle; readonly tags?: readonly string[] }): boolean {
  return pkg.lifecycle === "decommissioned" ||
    (pkg.tags ?? []).some((tag) => tag.toLowerCase() === "decommissioned");
}

export function workspaceDecommissionedImportAudit(
  workspace: JSNodeWorkspace,
  consumption: ConsumptionIndex,
): WorkspaceDecommissionedImportAudit {
  const packageByName = new Map(workspace.packages.map((pkg) => [pkg.name, pkg]));
  const decommissioned = workspace.packages
    .filter(packageIsDecommissioned)
    .map((pkg) => pkg.name)
    .sort((a, b) => a.localeCompare(b));
  const decommissionedSet = new Set(decommissioned);
  const violations: DecommissionedImportViolation[] = [];
  const seen = new Set<string>();

  for (const edge of consumption.edges) {
    if (!decommissionedSet.has(edge.provider)) continue;
    const consumer = packageByName.get(edge.consumer);
    const provider = packageByName.get(edge.provider);
    if (consumer === undefined || provider === undefined) continue;
    if (packageIsDecommissioned(consumer)) continue;
    const key = [
      edge.consumer,
      edge.provider,
      edge.file,
      edge.specifier,
      edge.mode,
      String(edge.typeOnly),
      edge.name ?? "",
    ].join("\0");
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push(Object.freeze({
      consumer: consumer.name,
      consumerLifecycle: consumer.lifecycle,
      provider: provider.name,
      providerLifecycle: provider.lifecycle,
      file: edge.file,
      specifier: edge.specifier,
      mode: edge.mode,
      typeOnly: edge.typeOnly,
      ...(edge.name === undefined ? {} : { name: edge.name }),
    }));
  }

  violations.sort((a, b) =>
    a.consumer.localeCompare(b.consumer) ||
    a.provider.localeCompare(b.provider) ||
    a.file.localeCompare(b.file) ||
    a.specifier.localeCompare(b.specifier) ||
    (a.name ?? "").localeCompare(b.name ?? "")
  );

  return Object.freeze({
    kind: "jsnode.decommissioned-import-audit" as const,
    packageCount: workspace.packages.length,
    decommissionedPackages: Object.freeze(decommissioned),
    violatingConsumers: Object.freeze([...new Set(violations.map((item) => item.consumer))].sort((a, b) => a.localeCompare(b))),
    violationCount: violations.length,
    violations: Object.freeze(violations),
  });
}
