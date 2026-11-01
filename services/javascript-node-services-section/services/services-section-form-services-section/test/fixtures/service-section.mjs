import { cell } from "@red-cup-engineering/signcraft/cell";
import {
  SERVICE_SECTION_KIND,
  SERVICE_SECTION_VOCABULARY as vocabulary,
} from "../../src/service-section.mjs";

// A deliberately hypothetical service. These witnesses are test authorship,
// not evidence that a company service ran, delivered value, or was accepted.
export const subjects = Object.freeze({
  section: "urn:example:service-section:temperature-summary",
  template: "urn:example:service-section:measurement-template",
  offer: "urn:example:offer:temperature-summary",
  program: "urn:example:program:temperature-summary",
  kernel: "urn:example:kernel:measurement-maintenance",
  calibration: "urn:example:calibration:measurement-tolerance",
});

export const purpose = Object.freeze({
  kind: "hypothetical-purpose",
  description: "Summarize a supplied, bounded temperature observation.",
});

export function hypotheticalServiceSection() {
  const witness = { kind: "test-fixture-authorship", resource: "urn:example:fixture:service-section", revision: "1" };
  const told = (subject, predicate, object) => cell(subject, predicate, object, { for: [witness] });
  const { section, template, offer, program, kernel, calibration } = subjects;
  return {
    kind: SERVICE_SECTION_KIND,
    subject: section,
    source: { resource: "urn:example:fixture:service-section", revision: "1" },
    cells: [
      told(section, "specializes", template),
      told(template, vocabulary.purpose, purpose),
      told(section, vocabulary.type, vocabulary.ServiceSection),
      told(section, vocabulary.context, "urn:example:context:bounded-observation"),
      told(section, vocabulary.sourceCustody, "urn:example:repository:fixture-only"),
      told(section, vocabulary.offers, offer),
      told(section, vocabulary.kernel, kernel),
      told(offer, vocabulary.provider, "urn:example:role:observation-provider"),
      told(offer, vocabulary.user, "urn:example:role:observation-consumer"),
      told(offer, vocabulary.outcome, "urn:example:outcome:bounded-temperature-summary"),
      told(offer, vocabulary.valueMeasure, { measure: "accepted summaries", unit: "count" }),
      told(offer, vocabulary.valueAllocation, "urn:example:allocation:provider-and-user-agreement"),
      told(offer, vocabulary.program, program),
      told(program, vocabulary.precondition, "urn:example:assertion:observation-in-domain"),
      told(program, vocabulary.move, "urn:example:move:derive-summary"),
      told(program, vocabulary.postcondition, "urn:example:assertion:summary-with-observation-lineage"),
      told(program, vocabulary.preservationObligation, "urn:example:obligation:retain-source-and-bound"),
      told(kernel, vocabulary.purpose, "urn:example:purpose:maintain-bounded-interpretation"),
      told(kernel, vocabulary.invariant, "urn:example:invariant:retain-observation-uncertainty"),
      told(kernel, vocabulary.program, program),
      told(kernel, vocabulary.governs, program),
      told(kernel, vocabulary.calibration, calibration),
      told(calibration, vocabulary.axis, { quantity: "temperature", unit: "degree Celsius" }),
      told(calibration, vocabulary.admissibleRegion, { lower: -20, upper: 50, unit: "degree Celsius" }),
      told(calibration, vocabulary.setting, { tolerance: 0.5, unit: "degree Celsius" }),
      told(calibration, vocabulary.revisit, "urn:example:trigger:source-calibration-change"),
    ],
  };
}
