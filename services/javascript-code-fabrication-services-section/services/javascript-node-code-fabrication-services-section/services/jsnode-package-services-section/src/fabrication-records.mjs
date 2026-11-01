/** Translatable JSNode work-order specifications and the receipts their fabrication left. */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { translateMarkdownJsnodeOperationPackageSpecification } from "./translate-markdown-jsnode-operation-package-specification.mjs";

const SKIP = new Set(["node_modules", ".git", "dist"]);

/** Walk a root for fabrication receipts and translator-accepted JSNode work orders, bounded by depth and count. */
export function listFabricationRecords(root, { maxDepth = 48, limit = 200 } = {}) {
  const receipts = [];
  const workOrders = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth || receipts.length + workOrders.length >= limit) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name) && !(entry.name === "legacy" && dir.endsWith("/lib"))) walk(path, depth + 1);
        continue;
      }
      if (entry.name.endsWith("fabrication-receipt.json") && path.includes("/data/records/")) {
        try {
          const receipt = JSON.parse(readFileSync(path, "utf8"));
          const creation = receipt.jsnodeOperationPackageCreationReceipt ?? {};
          receipts.push({ path, sourceDigest: receipt.sourceDigest, specificationDigest: receipt.specificationDigest, packageName: creation.packageName, packageVersion: creation.packageVersion, destination: creation.destination });
        } catch { receipts.push({ path, unreadable: true }); }
      } else if (entry.name.endsWith(".md") && path.includes("/specifications/")) {
        const text = readFileSync(path, "utf8");
        const translation = translateMarkdownJsnodeOperationPackageSpecification({
          type: "MarkdownJsnodeOperationPackageSpecificationTranslationRequest",
          version: 1,
          source: { type: "MarkdownDocumentSource", path, text },
        });
        if (translation.type === "MarkdownJsnodeOperationPackageSpecificationTranslationRefusal") continue;
        const provenance = translation.artifactSpecificationCandidate.source.provenance;
        workOrders.push({
          path,
          artifactId: translation.artifactSpecificationCandidate.source.identity.id,
          specificationDigest: provenance.digest,
          bytes: Buffer.byteLength(text, "utf8"),
          translationType: translation.type,
        });
      }
    }
  };
  walk(resolve(root), 0);
  return { kind: "jsnode.fabrication-records", root: resolve(root), receipts, workOrders };
}
