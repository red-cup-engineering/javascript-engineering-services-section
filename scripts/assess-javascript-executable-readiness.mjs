#!/usr/bin/env node
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";
function text(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} must be non-empty text`);
  return value.trim();
}

function texts(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return Object.freeze([...new Set(value.map((item, index) => text(item, `${label}[${index}]`)))]);
}

function admitCriterion(candidate, index) {
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new TypeError(`criteria[${index}] must be an object`);
  }
  const required = texts(candidate.required, `criteria[${index}].required`);
  if (required.length === 0) throw new TypeError(`criteria[${index}].required must not be empty`);
  return Object.freeze({
    id: text(candidate.id, `criteria[${index}].id`),
    title: text(candidate.title, `criteria[${index}].title`),
    required,
    sourceIds: texts(candidate.sourceIds ?? [], `criteria[${index}].sourceIds`),
    claim: text(candidate.claim, `criteria[${index}].claim`),
    next: text(candidate.next, `criteria[${index}].next`),
  });
}

/**
 * Measure a supplied JavaScript executable catalog against explicit readiness
 * criteria. This transformation performs no package or filesystem discovery.
 */
export function assessJavascriptExecutableReadiness(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError("input must be an object");
  const packageName = text(input.packageName, "packageName");
  const executableNames = Object.freeze([...texts(input.executableNames, "executableNames")].sort());
  const criteria = (input.criteria ?? []).map(admitCriterion);
  if (criteria.length === 0) throw new TypeError("criteria must not be empty");
  const available = new Set(executableNames);
  const readings = criteria.map((criterion) => {
    const found = criterion.required.filter((name) => available.has(name));
    const missing = criterion.required.filter((name) => !available.has(name));
    const score = Math.round((found.length / criterion.required.length) * 100);
    return Object.freeze({
      ...criterion,
      status: missing.length === 0 ? "present" : found.length === 0 ? "missing" : "partial",
      score,
      found: Object.freeze(found),
      missing: Object.freeze(missing),
      reading: `${criterion.claim} Found ${found.length} of ${criterion.required.length}: ${found.join(", ") || "none"}.`,
    });
  });
  const present = readings.filter(({ status }) => status === "present").length;
  const partial = readings.filter(({ status }) => status === "partial").length;
  const missing = readings.filter(({ status }) => status === "missing").length;
  return Object.freeze({
    kind: "javascript-executable-readiness",
    generatedAt: text(input.generatedAt ?? new Date().toISOString(), "generatedAt"),
    package: packageName,
    executableCount: executableNames.length,
    executables: Object.freeze(executableNames),
    summary: Object.freeze({
      score: Math.round(readings.reduce((sum, criterion) => sum + criterion.score, 0) / readings.length),
      present,
      partial,
      missing,
    }),
    criteria: Object.freeze(readings),
    nextWork: Object.freeze(readings
      .filter(({ status }) => status !== "present")
      .sort((left, right) => left.score - right.score || left.id.localeCompare(right.id))
      .slice(0, 5)
      .map(({ id, next }) => `${id}: ${next}`)),
  });
}


if (import.meta.main) {
  const result = await runJavascriptNodeOperation({
    name: "assess-javascript-executable-readiness",
    description: "Measure an explicit executable catalog against supplied criteria.",
    operation: assessJavascriptExecutableReadiness,
    inputSchema: {"type": "object", "required": ["packageName", "executableNames", "criteria"], "properties": {"packageName": {"type": "string"}, "executableNames": {"type": "array", "items": {"type": "string"}}, "criteria": {"type": "array", "minItems": 1}}},
    outputSchema: {"type": "object"},
  }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
