#!/usr/bin/env node
import {readFile} from "node:fs/promises";
import {fabricateMarkdownJsnodeOperationPackage} from "../scripts/fabricate-markdown-jsnode-operation-package.mjs";

if (import.meta.main) {
  const [sourcePath, destination, registry, publicationFlag] = process.argv.slice(2);
  if (!sourcePath || !destination || !registry || (process.argv.length !== 5 && !(process.argv.length === 6 && publicationFlag === "--publish"))) throw new Error("usage: fabricate-markdown-jsnode-operation-package <work-order.md> <absolute-destination> <registry-url> [--publish]");
  const bytes = await readFile(sourcePath);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const receipt = await fabricateMarkdownJsnodeOperationPackage({ type: "MarkdownJsnodeOperationPackageFabricationRequest", version: 1, source: { type: "MarkdownDocumentSource", path: sourcePath, text }, destination, registry, publish: publicationFlag === "--publish" });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}
