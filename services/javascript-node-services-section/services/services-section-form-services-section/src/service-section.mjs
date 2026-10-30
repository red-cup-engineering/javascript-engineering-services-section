/**
 * Read one Service Section from its original witnessed SignCells.
 *
 * This is a pure consumer of SignCraft's source-told token sheaf. It does not
 * implement another graph, FOUR algebra, contract prover, or activation rule.
 * The specification's fields select the original query entries; they never
 * turn an attributed claim into permission or a successful execution receipt.
 */
import { KnowledgeBase } from "@red-cup-engineering/signcraft/knowledge-base";
import { cell, cellSet, coincidenceKey, coincides, retainedCarrier } from "@red-cup-engineering/signcraft/cell";

export const SERVICE_SECTION_KIND = "org.561.service-section.v1";
// Reading and path witnesses are capability-neutral in-memory admission brands.
// They prevent plain objects from masquerading as outputs of this exact reader,
// not forged or untrusted source witnesses from acquiring execution authority.
const admittedServiceReadings = new WeakSet();
const admittedServicePaths = new WeakSet();
const namespace = "https://561.group/ontology/service-section#";
const names = ["purpose", "context", "offers", "provider", "user", "outcome",
  "valueMeasure", "valueAllocation", "program", "precondition", "move",
  "postcondition", "preservationObligation", "evidence", "kernel", "governs", "invariant",
  "calibration", "axis", "admissibleRegion", "setting", "revisit"];

/** Authored service vocabulary; the existing custody class and relation keep their owner. */
export const SERVICE_SECTION_VOCABULARY = Object.freeze({
  ...Object.fromEntries(names.map(name => [name, namespace + name])),
  type: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
  ServiceSection: "https://561.group/ontology/service-section-custody#ServiceSection",
  sourceCustody: "https://561.group/ontology/service-section-custody#sourceCustody",
});

const vocabulary = SERVICE_SECTION_VOCABULARY;
const required = (name, object) => Object.freeze({
  name, predicate: vocabulary[name], required: true,
  ...(object === undefined ? {} : { object }),
});
const evidence = Object.freeze({ name: "evidence", predicate: vocabulary.evidence, required: false });

/**
 * The one executable declaration profile. Required means represented in this
 * source cut, not affirmed, unique, formally proved, or received by a user.
 * Every field is plural: alternatives and opposition must remain inspectable.
 */
export const SERVICE_SECTION_PROFILE = Object.freeze(Object.fromEntries(Object.entries({
  section: [required("type", vocabulary.ServiceSection), required("purpose"),
    required("context"), required("sourceCustody"), required("offers"), required("kernel"), evidence],
  offer: [required("provider"), required("user"), required("outcome"),
    required("valueMeasure"), required("valueAllocation"), required("program"), evidence],
  program: [required("precondition"), required("move"), required("postcondition"),
    required("preservationObligation"), evidence],
  kernel: [required("purpose"), required("invariant"), required("program"), required("governs"),
    required("calibration"), evidence],
  calibration: [required("axis"), required("admissibleRegion"), required("setting"),
    required("revisit"), evidence],
}).map(([role, fields]) => [role, Object.freeze(fields)])));

function plainRecord(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(label + " must be a data record");
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new TypeError(label + " must have a plain data prototype");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (keys.some(key => !Object.hasOwn(descriptors, key)) ||
      Reflect.ownKeys(descriptors).some(key => typeof key !== "string" ||
      !keys.includes(key) || !Object.hasOwn(descriptors[key], "value")))
    throw new TypeError(label + " requires its own declared data fields only");
}

function sourceDocument(document) {
  plainRecord(document, ["kind", "subject", "source", "cells"], "Service Section");
  if (document.kind !== SERVICE_SECTION_KIND || !Array.isArray(document.cells))
    throw new TypeError("Service Section requires its kind, subject and native cells");
  plainRecord(document.source, ["resource", "revision"], "Service Section source");
  if ([document.source.resource, document.source.revision].some(value =>
      typeof value !== "string" || value.length === 0))
    throw new TypeError("Service Section source requires resource and revision");
  return Object.freeze({
    kind: SERVICE_SECTION_KIND,
    subject: retainedCarrier(document.subject),
    source: Object.freeze({ resource: document.source.resource, revision: document.source.revision }),
    cells: cellSet(retainedCarrier(document.cells)),
  });
}

/**
 * Receive the shared input to a source-owned program projection, before the
 * downstream owner interprets its bindings. This admits source data only;
 * the binding's operation/contract semantics remain with that owner. Linked
 * programs may be supplied by the projection, so role reading occurs later.
 */
export function admitServiceSectionProjection(specification) {
  plainRecord(specification, ["document", "bindings"], "Service Section projection");
  const document = sourceDocument(specification.document);
  if (!Array.isArray(specification.bindings))
    throw new TypeError("Service Section projection bindings must be an array");
  return Object.freeze({ document, bindings: retainedCarrier(specification.bindings) });
}

/**
 * Project source-owned role declarations into the same native section.
 *
 * Each declaration is {role, subject, fields, witness}; fields contains only
 * profile names and each field is a plural array of original Marks. The
 * caller supplies its actual attribution/derivation witness. A positive
 * declaration says that this witness tells the field; it does not certify
 * the field's promised outcome or the truth of an embedded evidence record.
 *
 * Existing cells retain both evidence sides. No field is overwritten, no
 * missing hull/kernel declaration is fabricated, and no program is invoked.
 * The envelope retains the original declaration source; the native snapshot
 * identifies the augmented cut and every new telling retains its own witness.
 */
export function extendServiceSection(document, declarations) {
  const admitted = sourceDocument(document);
  if (!Array.isArray(declarations))
    throw new TypeError("Service Section declarations must be an array");
  const additions = [];
  // The original carrier owner admits data elements before iteration. This
  // also refuses nested indexed accessors instead of executing caller code.
  for (const declaration of retainedCarrier(declarations)) {
    plainRecord(declaration, ["role", "subject", "fields", "witness"], "Service Section declaration");
    if (typeof declaration.role !== "string" || !Object.hasOwn(SERVICE_SECTION_PROFILE, declaration.role))
      throw new TypeError("Service Section declaration requires a known role");
    const fields = declaration.fields;
    if (fields === null || typeof fields !== "object" || Array.isArray(fields))
      throw new TypeError("Service Section declaration fields must be a data record");
    const names = Object.keys(fields);
    plainRecord(fields, names, "Service Section declaration fields");
    const profile = SERVICE_SECTION_PROFILE[declaration.role];
    for (const name of names) {
      const field = profile.find(candidate => candidate.name === name);
      if (field === undefined || !Array.isArray(fields[name]))
        throw new TypeError("Service Section declaration requires plural fields from its role profile");
      for (const object of fields[name])
        additions.push(cell(declaration.subject, field.predicate, object, { for: [declaration.witness] }));
    }
  }
  return readServiceSection({
    kind: admitted.kind, subject: admitted.subject, source: admitted.source,
    cells: cellSet([...admitted.cells, ...additions]),
  });
}

/**
 * @param {object} document {kind, subject, source:{resource,revision}, cells}
 * @returns {object} The admitted source document, native paged section, hull,
 * kernels, required declarations absent from this cut, and native contests.
 *
 * Offers, programs, kernels and calibrations are links to represented subjects
 * in this same source cut. Missing targets retain SignCell's foreign-token
 * refusal instead of acquiring fabricated empty sections. No I/O is performed.
 */
export function readServiceSection(document) {
  const admitted = sourceDocument(document);
  const { cells, source } = admitted;
  const reader = KnowledgeBase.fromCells(cells);
  const readings = new Map();
  const roles = new Map();
  const missing = [];

  // Pages come from one immutable native frame. Keep each complete upstream
  // page as evidence, including the interpretation-bound snapshot identity.
  const readAt = subject => {
    const key = coincidenceKey(subject);
    if (readings.has(key)) return readings.get(key);
    const pages = [];
    let offset = 0;
    do {
      const page = reader.queryToldClaims({ token: subject }, { offset, limit: 128 });
      pages.push(page);
      offset = page.next;
    } while (offset !== null);
    const result = Object.freeze({
      subject: pages[0].selection.token,
      pages: Object.freeze(pages),
      entries: Object.freeze(pages.flatMap(page => page.entries)),
    });
    readings.set(key, result);
    return result;
  };

  const readRole = (role, subject) => {
    const key = role + ":" + coincidenceKey(subject);
    if (roles.has(key)) return roles.get(key);
    const section = readAt(subject);
    const fields = {};
    for (const field of SERVICE_SECTION_PROFILE[role]) {
      const entries = Object.freeze(section.entries.filter(entry =>
        coincides(entry.cell.predicate, field.predicate) &&
        (!Object.hasOwn(field, "object") || coincides(entry.cell.object, field.object))));
      fields[field.name] = entries;
      if (field.required && entries.length === 0) missing.push(Object.freeze({
        role, subject: section.subject, predicate: field.predicate,
        ...(Object.hasOwn(field, "object") ? { object: field.object } : {}),
      }));
    }
    const result = Object.freeze({ role, subject: section.subject, section, fields: Object.freeze(fields) });
    roles.set(key, result);
    return result;
  };
  const programsOf = facet => Object.freeze(facet.fields.program.map(link =>
    Object.freeze({ link, program: readRole("program", link.cell.object) })));

  const section = readRole("section", admitted.subject);
  const offers = Object.freeze(section.fields.offers.map(link => {
    const offer = readRole("offer", link.cell.object);
    return Object.freeze({ link, offer, programs: programsOf(offer) });
  }));
  const kernels = Object.freeze(section.fields.kernel.map(link => {
    const kernel = readRole("kernel", link.cell.object);
    const calibrations = Object.freeze(kernel.fields.calibration.map(calibrationLink =>
      Object.freeze({ link: calibrationLink, calibration: readRole("calibration", calibrationLink.cell.object) })));
    return Object.freeze({ link, kernel, programs: programsOf(kernel), calibrations });
  }));
  // The kernel's control program may differ from the programs it governs.
  // Retain the actual incoming governance claims, including unknown/denied/
  // contested ones; an empty binding is an explicit unresolved relationship.
  const governance = Object.freeze(offers.flatMap(({ offer, programs }) =>
    programs.map(({ program }) => Object.freeze({
      offer: offer.subject, program: program.subject,
      bindings: Object.freeze(kernels.flatMap(({ kernel }) =>
        kernel.fields.governs.filter(link => coincides(link.cell.object, program.subject))
          .map(link => Object.freeze({ kernel: kernel.subject, link })))),
    }))));
  const contests = Object.freeze([...readings.values()].flatMap(reading =>
    reading.entries.filter(entry => entry.contested !== null)));
  const first = section.section.pages[0];

  const result = Object.freeze({
    kind: "org.561.service-section-reading.v1",
    document: Object.freeze({ kind: SERVICE_SECTION_KIND, subject: section.subject, source, cells }),
    snapshot: first.snapshot,
    sourceCells: first.sourceCells,
    sourceSection: section.section,
    section,
    hull: Object.freeze({ offers }),
    kernels,
    governance,
    missing: Object.freeze(missing),
    contests,
  });
  admittedServiceReadings.add(result);
  return result;
}


/**
 * The free *syntactic* path category on original witnessed offer/program links.
 *
 * No caller acquires a program's authority, correctness proof, budget grant,
 * host execution or economic delivery by constructing an arrow or a path.
 * Interfaces are native SignCraft Marks; consumers must place shared residual
 * resources, jurisdiction and contract revisions in those interface Marks.
 * The original effect/contract owners must independently qualify each path.
 */
export const SERVICE_DECLARATION_PATH_KIND = "org.561.service-declaration-path.v1";

function servicePathRecord(value, label) {
  plainRecord(value, ["kind", "domain", "codomain", "steps", "standing"], label);
  if (!admittedServicePaths.has(value))
    throw new TypeError(label + " requires an original constructed path, not a copied or forged record");
  if (value.kind !== SERVICE_DECLARATION_PATH_KIND ||
      value.standing !== "syntactic-only" || !Array.isArray(value.steps))
    throw new TypeError(label + " requires an admitted syntactic path");
  let at = value.domain;
  for (const step of value.steps) {
    plainRecord(step, ["domain", "codomain", "program", "offer", "source", "snapshot",
      "offerLink", "programLink"], label + " step");
    if (!coincides(at, step.domain))
      throw new TypeError(label + " has a disconnected intermediate interface");
    at = step.codomain;
  }
  if (!coincides(at, value.codomain))
    throw new TypeError(label + " has a disconnected output interface");
  return value;
}

function pathOf(domain, codomain, steps) {
  const path = Object.freeze({
    kind: SERVICE_DECLARATION_PATH_KIND,
    domain: retainedCarrier(domain),
    codomain: retainedCarrier(codomain),
    steps: Object.freeze(steps),
    standing: "syntactic-only",
  });
  admittedServicePaths.add(path);
  return path;
}

/** The empty path is a mathematical identity, never a priced sale or effect. */
export function identityServiceDeclarationPath(boundary) {
  if (boundary === undefined)
    throw new TypeError("Service path identity requires an explicit interface Mark");
  return pathOf(boundary, boundary, []);
}

/**
 * Form one *source-declared generator* from the original v1 reader.
 *
 * The input selectors identify an actual linked offer and program in this
 * reading. The domain/codomain Marks come from the program's original typed
 * interface owner; this pure projection does not derive them from prose.
 * It retains the exact original offer/program links, their against witnesses
 * and the source snapshot. Representation is not program soundness.
 */
export function offerServiceDeclarationPath(reading, selector) {
  plainRecord(selector, ["offer", "program", "domain", "codomain"],
    "Service path generator selector");
  if (!admittedServiceReadings.has(reading) ||
      reading?.kind !== "org.561.service-section-reading.v1" ||
      !Array.isArray(reading.hull?.offers) || !reading.document?.source)
    throw new TypeError("Service path generator requires the original native section reading");
  if (selector.domain === undefined || selector.codomain === undefined)
    throw new TypeError("Service path generator requires two explicit interface Marks");
  const offered = reading.hull.offers.find(item =>
    coincides(item.offer.subject, selector.offer));
  const linked = offered?.programs.find(item =>
    coincides(item.program.subject, selector.program));
  if (!linked)
    throw new TypeError("Service path generator needs an existing offered-program link");
  if (offered.link.cell.for.length === 0 || linked.link.cell.for.length === 0)
    throw new TypeError("Service path generator needs witnessed positive source links");
  for (const field of ["precondition", "move", "postcondition", "preservationObligation"])
    if (!linked.program.fields[field].some(entry => entry.cell.for.length > 0))
      throw new TypeError("Service path generator lacks positively witnessed original program field " + field);
  const from = retainedCarrier(selector.domain);
  const to = retainedCarrier(selector.codomain);
  const step = Object.freeze({
    domain: from,
    codomain: to,
    program: retainedCarrier(linked.program.subject),
    offer: retainedCarrier(offered.offer.subject),
    source: retainedCarrier(reading.document.source),
    snapshot: retainedCarrier(reading.snapshot),
    offerLink: retainedCarrier(offered.link.cell),
    programLink: retainedCarrier(linked.link.cell),
  });
  return pathOf(from, to, [step]);
}

/**
 * Strict path concatenation, conditioned only on native interface coincidence.
 *
 * In particular, interface Marks that differ in remaining global budget,
 * rights, receiver or contract version DO NOT compose. A successful return
 * demonstrates syntax and preserved original evidence, not a Hoare proof,
 * legal authorization, shared-resource settlement or received user value.
 */
export function composeServiceDeclarationPaths(first, second) {
  servicePathRecord(first, "First Service path");
  servicePathRecord(second, "Second Service path");
  if (!coincides(first.codomain, second.domain))
    throw new TypeError("Service paths refuse mismatched intermediate interface or residual state");
  return pathOf(first.domain, second.codomain, [...first.steps, ...second.steps]);
}
