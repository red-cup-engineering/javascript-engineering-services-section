/**
 * @packageDocumentation
 *
 * admission/workspace-declaration - package-phase pnpm-workspace.yaml admission.
 *
 * Reads a host mark already supplied as YAML text and either admits it as a
 * workspace-declaration admission record or returns a carried failure. Discovering
 * `pnpm-workspace.yaml` on disk stays in services; this module only reads the
 * text once it has already crossed the host boundary.
 */
import { decodeYaml } from "@red-cup-engineering/yaml-frontmatter-codec-service";
import {
  admissionFailureContract,
  workspaceDeclarationAdmissionContract,

} from "./schemas/admission.mjs";

function workspaceDeclarationAdmissionFailure(source, reason) {
  return admissionFailureContract.assert({
    kind: "metroplat.admission.failure",
    source,
    reason,
  }, "workspace declaration admission failure");
}

/**
 * Admit a `pnpm-workspace.yaml` host mark. `mark` is YAML text. Total over
 * host input: an unreadable document or a missing/invalid `packages` list
 * returns an admission failure record rather than throwing.
 */
export function admitWorkspaceDeclaration(mark, source = "pnpm-workspace.yaml") {
  let value;
  try {
    value = decodeYaml(mark);
  } catch (error) {
    return workspaceDeclarationAdmissionFailure(source, error instanceof Error ? error.message : "unreadable workspace declaration");
  }

  const packages = value["packages"];
  if (!Array.isArray(packages) || packages.length === 0 || !packages.every((entry) => typeof entry === "string" && entry.length > 0)) {
    return workspaceDeclarationAdmissionFailure(source, "workspace declaration requires a non-empty packages: list of strings");
  }

  try {
    return workspaceDeclarationAdmissionContract.assert({
      kind: "metroplat.admission.workspace-declaration",
      source,
      packages,
      ...(typeof value["linkWorkspacePackages"] === "boolean" ? { linkWorkspacePackages: value["linkWorkspacePackages"] } : {}),
      ...(typeof value["preferWorkspacePackages"] === "boolean" ? { preferWorkspacePackages: value["preferWorkspacePackages"] } : {}),
    }, "workspace declaration admission");
  } catch (error) {
    return workspaceDeclarationAdmissionFailure(source, error instanceof Error ? error.message : "invalid workspace declaration admission");
  }
}

/** Admit a workspace declaration or throw with the carried failure reason. */
export function requireWorkspaceDeclaration(mark, source = "pnpm-workspace.yaml") {
  const admitted = admitWorkspaceDeclaration(mark, source);
  if (admitted.kind === "metroplat.admission.failure") throw new TypeError(`${source}: ${admitted.reason}`);
  return admitted;
}
