#!/usr/bin/env node
import { runJavascriptNodeOperationModule } from "@red-cup-engineering/javascript-node-services-section/operation";
import { findServicesSectionRepositoryRoot, readServicesSectionLaw } from "../../../scripts/read-services-section-law.mjs";
import { readServiceSection, operationDefinition as readServiceSectionOperation } from "../../../scripts/read-service-section.mjs";
import { readServicesSectionTree, operationDefinition as readServicesSectionTreeOperation } from "../../../scripts/read-services-section-tree.mjs";
import { foldDirectoryEntriesIntoServicesSectionForm, operationDefinition as foldOperation } from "../../../scripts/fold-directory-entries-into-services-section-form.mjs";
import { checkServicesSectionFormConformance, operationDefinition as checkOperation } from "../../../scripts/check-services-section-form-conformance.mjs";
import { measureServicesSectionFitness, operationDefinition as measureOperation } from "../../../scripts/measure-services-section-fitness.mjs";
import { answerServicesSectionPlacement, operationDefinition as deriveOperation } from "../../../scripts/derive-services-section-path.mjs";
import { foundServicesSection, operationDefinition as foundOperation } from "../../../scripts/found-services-section.mjs";
import { planServicesSectionNormalizationAt, operationDefinition as planOperation } from "../../../scripts/plan-services-section-normalization.mjs";
import { applyServicesSectionNormalization, operationDefinition as applyOperation } from "../../../scripts/apply-services-section-normalization.mjs";

// The law of the forest the engine runs in, read once and only by the verbs that judge against it.
let law;
const forestLaw = () => (law ??= findServicesSectionRepositoryRoot(process.cwd()).then(readServicesSectionLaw));

/**
 * One command over the section's operations: observe a section (read, fold, read the tree), judge it (check,
 * measure), place it (derive), and fabricate or align it (found, plan, apply). Each verb is its script's own
 * definition; the engine binds the forest's law where a script takes it explicitly.
 */
export const catalog = Object.freeze({
  name: "agentic-organization-services-section-engine",
  description: "Observes, measures, places, founds and aligns 561 Group services sections against the Group's section law.",
  operations: Object.freeze({
    "read-service-section": { ...readServiceSectionOperation, operation: readServiceSection },
    "read-services-section-tree": { ...readServicesSectionTreeOperation, operation: readServicesSectionTree },
    "fold-directory-entries-into-services-section-form": {
      ...foldOperation,
      operation: async (request) => foldDirectoryEntriesIntoServicesSectionForm(request, (await forestLaw()).contentTaxonomy),
    },
    "check-services-section-form-conformance": {
      ...checkOperation,
      operation: async (form) => checkServicesSectionFormConformance(form, (await forestLaw()).schema),
    },
    "measure-services-section-fitness": { ...measureOperation, operation: measureServicesSectionFitness },
    "derive-services-section-path": { ...deriveOperation, operation: answerServicesSectionPlacement },
    "found-services-section": { ...foundOperation, operation: foundServicesSection },
    "plan-services-section-normalization": { ...planOperation, operation: planServicesSectionNormalizationAt },
    "apply-services-section-normalization": { ...applyOperation, operation: applyServicesSectionNormalization },
  }),
});

if (import.meta.main) {
  process.exitCode = (await runJavascriptNodeOperationModule({ catalog }, {
    arguments: process.argv.slice(2),
    standardInput: process.stdin,
    standardOutput: process.stdout,
    standardError: process.stderr,
  })).exitCode;
}
