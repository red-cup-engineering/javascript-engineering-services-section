import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const readManifest = (root) => {
  const path = join(root, "package.json");
  if (!existsSync(path)) return { kind: "missing", path };
  try {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    if (typeof manifest.name !== "string" || manifest.name === "") return { kind: "invalid", path, reason: "package must declare a name" };
    return { kind: "settlement", path, manifest };
  } catch (error) {
    return { kind: "invalid", path, reason: error instanceof Error ? error.message : String(error) };
  }
};

/** Discover only the direct child service membranes of this JSNode section. */
export function discoverJsnodeServices(sectionRoot) {
  if (typeof sectionRoot !== "string" || !sectionRoot) throw new TypeError("sectionRoot must be an explicit path");
  const root = resolve(sectionRoot), servicesRoot = join(root, "services");
  if (!existsSync(servicesRoot)) return { sectionRoot: root, services: [], refusals: [{ code: "missing-services-root" }] };
  const services = [], refusals = [];
  for (const entry of readdirSync(servicesRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === "node_modules") continue;
    const childRoot = join(servicesRoot, entry.name), result = readManifest(childRoot);
    if (result.kind === "settlement") services.push({ directory: entry.name, nodeId: entry.name, package: result.manifest.name, root: childRoot });
    else refusals.push({ directory: entry.name, ...result });
  }
  return { sectionRoot: root, services, refusals };
}
