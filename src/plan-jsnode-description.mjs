import path from "node:path";

import { eachWorkspacePackageDir } from "@red-cup-engineering/jsnode-computer/workspace";

function textParam(params, ...names) {
  for (const name of names) {
    const value = params?.[name];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return undefined;
}

function aliases(repoRoot, pkg) {
  const relative = path.relative(repoRoot, pkg.dir).split(path.sep).join("/");
  return [pkg.name, relative, `./${relative}`, path.basename(relative)];
}

/** Plan one package-description update without changing its manifest. */
export function planWorkspacePackageDescription(repoRoot, params = {}) {
  const requested = textParam(params, "package", "name", "focus")?.trim() ?? "";
  const description = textParam(params, "description") ?? "";
  const pkg = [...eachWorkspacePackageDir(repoRoot)].find((candidate) => aliases(repoRoot, candidate).includes(requested));
  if (pkg === undefined) throw new Error(`jsnode package not found: ${requested}`);
  const rawHasLineBreak = /[\r\n]/u.test(description);
  const nextDescription = description.trim().replace(/\s+/gu, " ");
  const currentDescription = typeof pkg.manifest.description === "string" ? pkg.manifest.description : "";
  const obstructions = [];
  if (nextDescription === "") obstructions.push("description is empty");
  if (nextDescription.length > 220) obstructions.push("description is longer than 220 characters");
  if (rawHasLineBreak) obstructions.push("description must be a single line");
  const changed = currentDescription !== nextDescription;
  return Object.freeze({
    kind: "jsnode.package-description-update-plan",
    move: "jsnode.package.description.update",
    settlement: obstructions.length > 0 ? "blocked" : changed ? "admitted" : "noop",
    package: pkg.name,
    packageDir: pkg.dir,
    manifestPath: path.join(pkg.dir, "package.json"),
    currentDescription,
    nextDescription,
    changed,
    admissible: obstructions.length === 0 && changed,
    obstructions: Object.freeze(obstructions),
    previewManifest: Object.freeze({ ...pkg.manifest, description: nextDescription }),
  });
}
