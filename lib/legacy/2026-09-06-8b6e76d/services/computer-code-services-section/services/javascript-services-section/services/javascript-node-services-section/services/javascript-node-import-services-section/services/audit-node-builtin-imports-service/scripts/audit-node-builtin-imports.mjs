#!/usr/bin/env node
// The house services that own what each Node built-in module does; an import of one outside a test file is a finding.
const HOUSE_OWNERS = Object.freeze({
  "node:fs": "@red-cup-engineering/file-services",
  "node:fs/promises": "@red-cup-engineering/file-services",
  "node:path": "@red-cup-engineering/filepath-services-section",
  "node:url": "@red-cup-engineering/project-file-url-filepath-service",
  "node:child_process": "@red-cup-engineering/execute-javascript-node-command-service",
});

/**
 * Audits one JavaScript source text for single-line imports of Node built-in modules that a house service owns, exempting the owner itself.
 * @param {object} request A record with the source path, its text, and optionally the name of the package it belongs to.
 * @returns {object} A NodeBuiltinImportAudit record.
 * @throws {TypeError} When path or text is not a string.
 */
export function auditNodeBuiltinImports(request) {
  if (typeof request?.path !== "string" || typeof request?.text !== "string") throw new TypeError("path and text are required");
  const findings = [];
  const lines = request.text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*import\b[^;]*?\bfrom\s+["'](node:[a-z_/]+)["']/u.exec(lines[index])
      ?? /^\s*import\s+["'](node:[a-z_/]+)["']/u.exec(lines[index]);
    if (match === null) continue;
    const houseService = HOUSE_OWNERS[match[1]];
    if (houseService === undefined || houseService === request.packageName) continue;
    findings.push({ line: index + 1, builtin: match[1], houseService });
  }
  return { type: "NodeBuiltinImportAudit", path: request.path, findings, count: findings.length };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("auditNodeBuiltinImports — Audits one JavaScript source text for single-line imports of Node built-in modules that a house service owns, exempting the owner itself.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.length > 0) process.stdout.write(`${JSON.stringify(auditNodeBuiltinImports(JSON.parse(line)))}\n`);
    }
  }
}
