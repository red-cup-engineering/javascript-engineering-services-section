#!/usr/bin/env node
import { runJavascriptNodeOperation } from "@red-cup-engineering/javascript-node-services-section/operation";
import { findServicesSectionRepositoryRoot, readServicesSectionLaw } from "./read-services-section-law.mjs";
import { readServicesSectionTree } from "./read-services-section-tree.mjs";
import { checkServicesSectionFormConformance } from "./check-services-section-form-conformance.mjs";

export const operationDefinition = Object.freeze({
  name: "measureServicesSectionFitness",
  description: "Measures every services section under a root against the Group's section law through the directory lens: each law location a section's form violates is one misfit.",
  inputSchema: {
    type: "object",
    required: ["root"],
    properties: { root: { type: "string", minLength: 1 } },
  },
  outputSchema: {
    type: "object",
    required: ["type", "version", "root", "lens", "sections", "fitting", "misfits", "misfitting"],
    properties: {
      type: { const: "ServicesSectionFitness" },
      version: { const: 1 },
      lens: { const: "directory" },
      sections: { type: "integer", minimum: 0 },
      fitting: { type: "integer", minimum: 0 },
      misfits: { type: "object", additionalProperties: { type: "integer", minimum: 1 } },
      misfitting: { type: "array", items: { type: "object", required: ["path", "misfits"] } },
    },
  },
});

/** The law location an obstruction violates: its form path without the array position, and the violated keyword. */
const lawOf = (obstruction) => `${obstruction.path.replace(/\/\d+(?=\/|$)/gu, "")} ${obstruction.keyword}`;

/** The value at a JSON pointer into the form: what the law judged there. */
const valueAt = (form, pointer) => pointer.split("/").slice(1).reduce((value, key) => value?.[key.replaceAll("~1", "/").replaceAll("~0", "~")], form);

/**
 * Measures every services section under a root against the Group's section law. A section's misfits are the law
 * locations its directory form violates, each counted once however many entries violate it; a section with none
 * fits. Fitness is relative to the lens: the directory lens sees names, placement and manifests, not semantics.
 * @param {{root: string}} request The directory to measure, inside a qualified forest.
 * @returns {Promise<object>} A ServicesSectionFitness: how many sections were seen and fit, how many sections
 *   violate each law location, and each misfitting section's path and misfits, each misfit its exact location
 *   (`at`), the law's message and, for a scalar, the judged `value`.
 * @throws {TypeError} When root is not a non-empty string.
 */
export async function measureServicesSectionFitness(request) {
  if (typeof request?.root !== "string" || request.root.length === 0) throw new TypeError("root is required");
  const [{ schema }, tree] = await Promise.all([
    findServicesSectionRepositoryRoot(request.root).then(readServicesSectionLaw),
    readServicesSectionTree({ root: request.root }),
  ]);
  const misfits = {};
  const misfitting = [];
  for (const { form } of tree.sections) {
    const { obstructions } = checkServicesSectionFormConformance(form, schema);
    if (obstructions.length === 0) continue;
    const laws = new Map();
    for (const obstruction of obstructions) {
      const law = lawOf(obstruction);
      const misfit = { at: obstruction.path, message: obstruction.message };
      const value = valueAt(form, obstruction.path);
      laws.set(law, [...(laws.get(law) ?? []), Object.freeze(value !== null && typeof value === "object" ? misfit : { ...misfit, value })]);
    }
    for (const law of laws.keys()) misfits[law] = (misfits[law] ?? 0) + 1;
    misfitting.push(Object.freeze({ path: form.path, misfits: Object.freeze(Object.fromEntries(laws)) }));
  }
  return Object.freeze({
    type: "ServicesSectionFitness",
    version: 1,
    root: tree.root,
    lens: "directory",
    sections: tree.sections.length,
    fitting: tree.sections.length - misfitting.length,
    misfits: Object.freeze(misfits),
    misfitting: Object.freeze(misfitting),
  });
}

if (import.meta.main) {
  process.exitCode = (await runJavascriptNodeOperation(
    { ...operationDefinition, operation: measureServicesSectionFitness },
    { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout },
  )).exitCode;
}
