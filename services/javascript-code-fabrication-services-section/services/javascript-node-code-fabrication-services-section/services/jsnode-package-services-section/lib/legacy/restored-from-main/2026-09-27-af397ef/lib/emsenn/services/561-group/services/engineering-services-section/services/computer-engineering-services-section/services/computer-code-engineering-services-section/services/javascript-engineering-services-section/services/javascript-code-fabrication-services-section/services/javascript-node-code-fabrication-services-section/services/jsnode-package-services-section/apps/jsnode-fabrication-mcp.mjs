#!/usr/bin/env node
// The fabrication line as an MCP surface: translate a Markdown work order,
// fabricate the operation package it specifies, and list the receipts the
// tree already holds. Composes the section's scripts; owns no law of its own.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { createMcpServer } from "@red-cup-engineering/mcp-engineering-services-section/server";
import { fabricateMarkdownJsnodeOperationPackage } from "../src/fabricate-markdown-jsnode-operation-package.mjs";
import { translateMarkdownJsnodeOperationPackageSpecification } from "../src/translate-markdown-jsnode-operation-package-specification.mjs";

const DEFAULT_REGISTRY = "https://registry.561.group";
const SKIP = new Set(["node_modules", ".git", "dist"]);
const serverInfo = { name: "jsnode-fabrication", version: "0.1.0" };
const instructions = "The jsnode fabrication line. Code is born from a Markdown work order (translate_work_order shows what it admits), fabricate_jsnode_operation_package builds a development topic package; publication requires publish:true and activation is separate, and list_fabrication_records shows every work order and receipt the tree holds. Write no script by hand that this line can fabricate. fabricate_jsnode_operation_package refuses a destination whose parent already holds sibling single-function packages (org-layering.md's \"A services-section IS the package\") — the fix is a new script inside an existing or new <topic>-services-section package, never another sibling package there.";

function fabricationMcpTools(registry) {
  return [
  {
    name: "translate_work_order",
    title: "Translate a Markdown work order",
    description: "Translates one closed Markdown work order into its language-neutral artifact-fabrication candidate and its JSNode operation-package specification, without admitting or writing anything. Refusals come back as the translation record's own datums.",
    inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string", minLength: 1 } }, additionalProperties: false },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false, readOnlyHint: true },
  },
  {
    name: "fabricate_jsnode_operation_package",
    title: "Fabricate an operation package from a work order",
    description: "Runs the whole circuit: translate, admit the artifact specification, admit the JSNode specification, birth the package at an absent destination, run its assays, publish through the full release gate only when publish is true, and return the fabrication receipt or a phase-named refusal. Three effects: the package directory, the registry publication, and its publish receipt. Refuses (DESTINATION_FRAGMENTS_EXISTING_PACKAGE_FAMILY) a destination whose parent directory already holds sibling single-function packages and carries no package.json of its own — consolidate into one <topic>-services-section package instead of birthing another sibling there.",
    inputSchema: { type: "object", required: ["path", "destination"], properties: { path: { type: "string", minLength: 1 }, destination: { type: "string", minLength: 1 }, registry: { type: "string", format: "uri", default: registry }, publish: { type: "boolean", default: false } }, additionalProperties: false },
    annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true, readOnlyHint: false },
  },
  {
    name: "list_fabrication_records",
    title: "List work orders and fabrication receipts",
    description: "Walks the repository for Markdown work orders under specifications/ directories and fabrication receipts under data/records/, returning each with its digests and the package it birthed.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 1000, default: 200 } }, additionalProperties: false },
    annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: false, readOnlyHint: true },
  },
  ];
}

/** Walks a root for fabrication receipts and work orders, bounded by depth and count. */
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
        const first = readFileSync(path, "utf8").split("\n").find((line) => line.startsWith("# "));
        workOrders.push({ path, artifactId: first ? first.slice(2).trim() : null, bytes: statSync(path).size });
      }
    }
  };
  walk(resolve(root), 0);
  return { kind: "jsnode.fabrication-records", root: resolve(root), receipts, workOrders };
}

function fabricationMcpOptions({ root, registry = DEFAULT_REGISTRY }) {
  if (typeof root !== "string" || root.length === 0) throw new TypeError("a fixed repository root is required");
  async function dispatch(name, args) {
    if (name === "translate_work_order") {
      const absolute = resolve(root, args.path);
      const text = readFileSync(absolute, "utf8");
      return translateMarkdownJsnodeOperationPackageSpecification({ type: "MarkdownJsnodeOperationPackageSpecificationTranslationRequest", version: 1, source: { type: "MarkdownDocumentSource", path: absolute, text } });
    }
    if (name === "fabricate_jsnode_operation_package") {
      const absolute = resolve(root, args.path);
      const text = readFileSync(absolute, "utf8");
      return fabricateMarkdownJsnodeOperationPackage({
        type: "MarkdownJsnodeOperationPackageFabricationRequest",
        version: 1,
        source: { type: "MarkdownDocumentSource", path: absolute, text },
        destination: resolve(root, args.destination),
        registry: args.registry ?? registry,
        publish: args.publish ?? false,
      });
    }
    if (name === "list_fabrication_records") return listFabricationRecords(root, { limit: args.limit ?? 200 });
    throw new Error(`unregistered fabrication MCP tool: ${name}`);
  }
  return {
    name: serverInfo.name,
    version: serverInfo.version,
    instructions,
    tools: fabricationMcpTools(registry).map((tool) => ({ ...tool, handler: (args) => dispatch(tool.name, args) })),
  };
}

export function createFabricationMcpServer(options) {
  return createMcpServer(fabricationMcpOptions(options));
}

export async function serveFabricationMcp({ root = process.env.INFO_REPOSITORY_ROOT, registry } = {}) {
  return createFabricationMcpServer({ root, registry }).serveStdio();
}

if (import.meta.main) await serveFabricationMcp();
