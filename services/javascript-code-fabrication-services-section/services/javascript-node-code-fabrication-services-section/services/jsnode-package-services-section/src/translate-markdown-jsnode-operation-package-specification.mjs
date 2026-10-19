#!/usr/bin/env node
import { sha256Digest, sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";
import { DEFINITIONALLY_EXACT_PARAMETERS } from "@red-cup-engineering/computer-data-engineering-services-section/artifact-fabrication";

class TranslationRefusal extends Error {
  constructor(code, message, sourceSpan = null) {
    super(message);
    this.code = code;
    this.sourceSpan = sourceSpan;
  }
}

function refuse(code, message, sourceSpan = null) {
  throw new TranslationRefusal(code, message, sourceSpan);
}

function frozen(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

function span(startLine, endLine = startLine) {
  return { type: "ArtifactFabricationSourceSpan", startLine, endLine };
}

function slug(value, context, line) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(value)) {
    refuse("INVALID_STABLE_ID", `${context} must be a lowercase hyphenated stable ID`, span(line));
  }
  return value;
}

function nonempty(value, context, line) {
  if (typeof value !== "string" || value.length === 0 || /[\r\n]/u.test(value)) {
    refuse("INVALID_TEXT", `${context} must be nonempty single-line text`, span(line));
  }
  return value;
}

function exactKeys(record, keys, context, line) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) refuse("INVALID_JSON_RECORD", `${context} must be a JSON object`, span(line));
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    refuse("UNEXPECTED_FIELDS", `${context} must carry exactly: ${expected.join(", ")}`, span(line));
  }
}

function json(value, context, line) {
  try { return JSON.parse(value); } catch { refuse("INVALID_JSON", `${context} must contain exactly one JSON value`, span(line)); }
}

function parsedFence(lines, index, label) {
  const opener = /^```([a-z0-9]+)(?: (.+))?$/u.exec(lines[index]);
  if (!opener) refuse("EXPECTED_FENCE", `${label} must begin with a fenced source block`, span(index + 1));
  const end = lines.indexOf("```", index + 1);
  if (end === -1) refuse("UNTERMINATED_FENCE", `${label} source fence is not terminated`, span(index + 1));
  if (end === index + 1) refuse("EMPTY_FENCE", `${label} source fence must not be empty`, span(index + 1, end + 1));
  return { language: opener[1], attributes: opener[2] ?? "", text: lines.slice(index + 1, end).join("\n") + "\n", startLine: index + 1, endLine: end + 1, next: end + 1 };
}

function clauseLines(lines, start, end, type, claimed = false) {
  const clauses = [];
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (line.length === 0) continue;
    const match = /^- `([a-z][a-z0-9]*(?:-[a-z0-9]+)*)`: (.+)$/u.exec(line);
    if (!match) refuse("INVALID_CLAUSE", `${type} clauses must use - \`stable-id\`: statement`, span(index + 1));
    const [ , id, statement ] = match;
    slug(id, `${type} ID`, index + 1);
    nonempty(statement, `${type} statement`, index + 1);
    const suffix = claimed ? /^(.*?) \[claims: ([a-z0-9, -]+)\]$/u.exec(statement) : null;
    clauses.push({ id, statement: suffix ? suffix[1] : statement, claimIds: suffix ? suffix[2].split(", ") : [], sourceSpan: span(index + 1) });
  }
  if (clauses.length === 0) refuse("MISSING_CLAUSES", `${type} must contain at least one clause`, span(start + 1));
  return clauses;
}

function constraints(lines, start, end, kind, claimed = false) {
  const values = [];
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (line.length === 0) continue;
    const match = /^- `([a-z][a-z0-9]*(?:-[a-z0-9]+)*)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \| (.+)$/u.exec(line);
    if (!match) refuse("INVALID_CONSTRAINT", `${kind} constraints must use - \`stable-id\` | authority | revision | locator | applicability | statement`, span(index + 1));
    values.push({ type: "ArtifactFabricationConstraint", version: claimed ? 2 : 1, id: slug(match[1], `${kind} constraint ID`, index + 1), kind, authority: nonempty(match[2], `${kind} authority`, index + 1), revision: nonempty(match[3], `${kind} revision`, index + 1), locator: nonempty(match[4], `${kind} locator`, index + 1), applicability: nonempty(match[5], `${kind} applicability`, index + 1), statement: nonempty(match[6], `${kind} statement`, index + 1), ...(claimed ? { parameters: [], claimIds: [] } : {}), sourceSpan: span(index + 1) });
  }
  if (values.length === 0) refuse("MISSING_CONSTRAINT", `${kind} must contain at least one settled constraint`, span(start + 1));
  return values;
}

function questions(lines, start, end, claimed = false) {
  if (end === start + 1 && lines[start] === "none") return [];
  const values = [];
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (line.length === 0) continue;
    const match = /^- `([a-z][a-z0-9]*(?:-[a-z0-9]+)*)` \[(blocking|nonblocking)\]: (.+)$/u.exec(line);
    const about = claimed ? /^(.*?) \[claim: ([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\]$/u.exec(match?.[3] ?? "") : null;
    if (!match) refuse("INVALID_OPEN_QUESTION", "Open questions must use - `stable-id` [blocking|nonblocking]: question, or exactly `none`", span(index + 1));
    values.push({ type: "ArtifactFabricationOpenQuestion", version: claimed ? 2 : 1, id: slug(match[1], "open-question ID", index + 1), question: nonempty(about ? about[1] : match[3], "open question", index + 1), blocking: match[2] === "blocking", ...(claimed ? { claimId: about ? about[2] : null } : {}), sourceSpan: span(index + 1) });
  }
  return values;
}

function traceability(lines, start, end, coveredIds, constraintIds) {
  const values = [];
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (line.length === 0) continue;
    const match = /^- `([a-z][a-z0-9]*(?:-[a-z0-9]+)*)` -> projection `([a-z][a-z0-9]*(?:-[a-z0-9]+)*)`; acceptance `([a-z][a-z0-9]*(?:-[a-z0-9]+)*)`; constraints ((?:`[a-z][a-z0-9]*(?:-[a-z0-9]+)*`)(?:, `(?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*)`)*)$/u.exec(line);
    if (!match) refuse("INVALID_TRACE", "Traceability must use - `requirement-id` -> projection `projection-id`; acceptance `obligation-id`; constraints `constraint-id`, ...", span(index + 1));
    if (!coveredIds.has(match[1])) refuse("UNKNOWN_TRACE_SUBJECT", `traceability refers to unknown requirement or prohibition: ${match[1]}`, span(index + 1));
    const tracedConstraintIds = [...match[4].matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9]+)*)`/gu)].map((item) => item[1]);
    if (tracedConstraintIds.some((id) => !constraintIds.has(id))) refuse("UNKNOWN_TRACE_CONSTRAINT", "traceability must name settled law or standard constraints", span(index + 1));
    values.push({ type: "ArtifactFabricationTrace", version: 1, requirementId: match[1], projectionIds: [match[2]], acceptanceObligationIds: [match[3]], constraintIds: tracedConstraintIds });
  }
  if (values.length !== coveredIds.size || new Set(values.map((value) => value.requirementId)).size !== coveredIds.size) {
    refuse("INCOMPLETE_TRACEABILITY", "every requirement and prohibition must have exactly one traceability entry", span(start + 1));
  }
  return values;
}

// A work order without Sources or Tests is a meaning-closure (computer-code-fabrication science,
// 2026-09-04 "Code fabrication from a specification"): it states what is made, its operations'
// input and output schemas and admitted examples, and leaves the source and tests to the
// fabricator to derive. Its schemas are its argument places, so an operation without both is not
// meaning-closed and is refused here.
const CLOSURE_HEADINGS = ["# ", "## Requirements", "## Prohibitions", "## Laws", "## Standards", "## Open questions", "## Package", "## Operations", "## Examples", "## Traceability"];


// The epistemic layer (candidate version 2). A work order with a `## Claims` section states, for every
// claim its clauses rest on, its status and basis; its numbers are `{{claim-id}}` placeholders (or
// `{{exact-constant}}` names from Data's definitionally exact set), and each dependency it names is a
// measured dependency claim. The Data admission refuses what the law refuses; this layer only parses.
//   - `id` | measured | kind | statement | quantity | locator | digest | derivation
//   - `id` | derived | kind | statement | quantity | kind:ref; kind:ref | derivation
//   - `id` | conjectured | kind | statement | quantity | hypothesis | observable | instrument | decision rule | estimate derivation
// quantity is `none` or `<number> <unit>`; a clause ends with `[claims: id, id]`; a question with `[claim: id]`.
function withClaims(claimed, headings) {
  return claimed ? headings.flatMap((heading) => heading === "## Open questions" ? [heading, "## Claims"] : [heading]) : headings;
}

function claimQuantity(token, line) {
  if (token === "none") return null;
  const match = /^(-?[0-9]+(?:\.[0-9]+)?(?:e-?[0-9]+)?) (\S.*)$/u.exec(token);
  if (!match) refuse("INVALID_CLAIM", "a claim quantity is `none` or `<number> <unit>`", span(line));
  return { type: "ArtifactFabricationQuantity", value: Number(match[1]), unit: match[2] };
}

function claimsFrom(lines, [start, end]) {
  const claims = [];
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    if (line.length === 0) continue;
    const match = /^- `([a-z][a-z0-9]*(?:-[a-z0-9]+)*)` \| (measured|derived|conjectured) \| ([a-z]+) \| (.+)$/u.exec(line);
    if (!match) refuse("INVALID_CLAIM", "claims must use - `stable-id` | measured|derived|conjectured | kind | statement | quantity | basis...", span(index + 1));
    const [, id, status, kind, rest] = match;
    const parts = rest.split(" | ");
    const arity = { measured: 5, derived: 4, conjectured: 7 }[status];
    if (parts.length !== arity) refuse("INVALID_CLAIM", `a ${status} claim carries statement and quantity then ${arity - 2} basis fields, separated by ' | '`, span(index + 1));
    const [statement, quantity, ...basis] = parts;
    const base = { type: "ArtifactFabricationClaim", version: 1, id: slug(id, "claim ID", index + 1), kind, statement: nonempty(statement, "claim statement", index + 1), status, quantity: claimQuantity(quantity, index + 1), sourceSpan: span(index + 1) };
    if (status === "measured") claims.push({ ...base, basis: { type: "ArtifactFabricationMeasuredBasis", locator: basis[0], digest: basis[1], derivation: basis[2] } });
    else if (status === "derived") {
      const premises = basis[0] === "" ? [] : basis[0].split("; ").map((item) => { const at = item.indexOf(":"); return { type: "ArtifactFabricationPremise", kind: item.slice(0, at), ref: item.slice(at + 1) }; });
      claims.push({ ...base, basis: { type: "ArtifactFabricationDerivedBasis", premises, derivation: basis[1] } });
    } else claims.push({ ...base, basis: { type: "ArtifactFabricationConjecturedBasis", hypothesis: basis[0], measurementPlan: { type: "ArtifactFabricationMeasurementPlan", observable: basis[1], instrument: basis[2], decisionRule: basis[3] }, estimateDerivation: basis[4] } });
  }
  return claims;
}

function clausesOf(type, clauses, claims) {
  if (claims === null) return clauses.map(({ id, statement, sourceSpan }) => ({ type, version: 1, id, statement, sourceSpan }));
  return clauses.map(({ id, statement, claimIds, sourceSpan }) => {
    const placed = [...new Set([...statement.matchAll(/\{\{([^{}]*)\}\}/gu)].map((item) => item[1]))];
    const parameters = placed.map((name) => {
      const claim = claims.find((item) => item.id === name);
      if (claim?.quantity) return { type: "ArtifactFabricationParameter", version: 1, name, value: claim.quantity.value, unit: claim.quantity.unit, claimId: name, exact: null };
      const exact = DEFINITIONALLY_EXACT_PARAMETERS[name];
      if (!claim && exact) return { type: "ArtifactFabricationParameter", version: 1, name, value: exact.value, unit: exact.unit, claimId: null, exact: name };
      refuse("UNKNOWN_PARAMETER_PLACEHOLDER", `{{${name}}} names no claim with a quantity and no definitionally exact constant`, sourceSpan);
    });
    return { type, version: 2, id, statement, parameters, claimIds: [...new Set([...claimIds, ...parameters.map((item) => item.claimId).filter((item) => item !== null)])].sort(), sourceSpan };
  });
}

function conjecturedIds(claims) {
  return claims.filter(({ status }) => status === "conjectured").map(({ id }) => id).sort();
}

// A dependency named by a claimed work order is backed by an observed artifact: a measured dependency
// claim whose statement names it as name@version (the registry response is the claim's evidence).
function measuredDependencies(claims, dependencies, line) {
  const entries = Array.isArray(dependencies) ? dependencies.map((item) => [item?.name, item?.version]) : Object.entries(dependencies ?? {});
  for (const [name, version] of entries) {
    if (!claims.some((claim) => claim.kind === "dependency" && claim.status === "measured" && claim.statement.includes(`${name}@${version}`))) {
      refuse("DEPENDENCY_WITHOUT_MEASURED_CLAIM", `dependency ${name}@${version} needs a measured dependency claim naming it`, span(line));
    }
  }
}

function translateV2(source, lines) {
  if (!lines.includes("## Claims")) refuse("MISSING_CLAIMS", "a work order states the claims its clauses rest on in a ## Claims section (candidate version 1 is retired)", span(1));
  const modules = lines.includes("## Modules");
  const closure = !lines.includes("## Sources") && !lines.includes("## Tests");
  const claimed = lines.includes("## Claims");
  const headings = withClaims(claimed, modules ? ["# ", "## Requirements", "## Prohibitions", "## Laws", "## Standards", "## Open questions", "## Modules", "## Acceptance obligations", "## Traceability"] : closure ? CLOSURE_HEADINGS : ["# ", "## Requirements", "## Prohibitions", "## Laws", "## Standards", "## Open questions", "## Package", "## Sources", "## Operations", "## Tests", "## Examples", "## Traceability"]);
  const atxHeadings = lines.map((line, index) => ({ line, index })).filter(({ line }) => /^#{1,6} /u.test(line));
  if (atxHeadings.length !== headings.length || atxHeadings[0].index !== 0 || atxHeadings.slice(1).some(({ line }, index) => line !== headings[index + 1])) {
    refuse("UNKNOWN_STRUCTURE", `v2 ${closure ? "closure " : ""}document must have exactly one title and exactly one of each required level-two heading: ${headings.slice(1).join(", ")}`, span(1));
  }
  const indexes = headings.map((heading, position) => position === 0 ? 0 : lines.indexOf(heading));
  if (indexes.some((value) => value < 0) || indexes.some((value, index) => index > 0 && value <= indexes[index - 1])) refuse("INVALID_STRUCTURE", "v2 document headings must occur in order", span(1));
  const sections = Object.fromEntries(headings.slice(1).map((heading, index) => [heading, [indexes[index + 1] + 1, indexes[index + 2] ?? lines.length]]));
  const artifactId = slug(lines[0].slice(2).trim(), "title / artifact ID", 1);
  const claimList = claimed ? claimsFrom(lines, sections["## Claims"]) : null;
  const requirementClauses = clauseLines(lines, ...sections["## Requirements"], "requirements", claimed);
  const prohibitionClauses = clauseLines(lines, ...sections["## Prohibitions"], "prohibitions", claimed);
  const requirements = clausesOf("ArtifactFabricationRequirement", requirementClauses, claimList);
  const prohibitions = clausesOf("ArtifactFabricationProhibition", prohibitionClauses, claimList);
  const constraintsValue = [...constraints(lines, ...sections["## Laws"], "law", claimed), ...constraints(lines, ...sections["## Standards"], "standard", claimed)];
  const openQuestions = questions(lines, ...sections["## Open questions"], claimed);
  if (modules) {
    const recordSection = (heading) => {
      const fence = parsedFence(lines, sections[heading][0], heading.slice(3));
      if (fence.language !== "json" || fence.attributes || fence.next !== sections[heading][1]) refuse("INVALID_MODULE_SECTION", `${heading} must contain exactly one JSON fence`, span(fence.startLine, fence.endLine));
      return { value: json(fence.text, heading, fence.startLine), sourceSpan: span(fence.startLine, fence.endLine) };
    };
    const moduleRecord = recordSection("## Modules");
    exactKeys(moduleRecord.value, ["operations", "examples", "dependencies"], "Modules", moduleRecord.sourceSpan.startLine);
    if (claimed) measuredDependencies(claimList, moduleRecord.value.dependencies, moduleRecord.sourceSpan.startLine);
    const acceptance = recordSection("## Acceptance obligations");
    if (!Array.isArray(acceptance.value) || acceptance.value.length === 0) refuse("MISSING_ACCEPTANCE_OBLIGATIONS", "a module order must state its receiving obligations", acceptance.sourceSpan);
    const acceptanceObligations = acceptance.value.map(value => {
      exactKeys(value, Object.hasOwn(value, "claimIds") ? ["id", "kind", "statement", "claimIds"] : ["id", "kind", "statement"], "acceptance obligation", acceptance.sourceSpan.startLine);
      return { type: "ArtifactFabricationAcceptanceObligation", version: claimed ? 2 : 1, ...(claimed ? { parameters: [], claimIds: value.claimIds ?? [] } : {}), id: slug(value.id, "acceptance obligation ID", acceptance.sourceSpan.startLine), kind: nonempty(value.kind, "acceptance obligation kind", acceptance.sourceSpan.startLine), statement: nonempty(value.statement, "acceptance obligation statement", acceptance.sourceSpan.startLine), sourceSpan: acceptance.sourceSpan };
    });
    const coveredIds = new Set([...requirements, ...prohibitions].map(value => value.id));
    const constraintIds = new Set(constraintsValue.map(value => value.id));
    const traceabilityValue = traceability(lines, ...sections["## Traceability"], coveredIds, constraintIds);
    if (openQuestions.some(question => question.blocking)) refuse("BLOCKING_OPEN_QUESTION", "a module meaning closure cannot carry a blocking open question", span(sections["## Open questions"][0]));
    const digest = sha256Digest(source.text);
    const artifactSpecificationCandidate = {
      type: "ArtifactFabricationSpecificationCandidate", version: claimed ? 2 : 1,
      source: { type: "ArtifactFabricationSource", version: 1, identity: { type: "ArtifactFabricationSourceIdentity", id: artifactId }, provenance: { type: "ArtifactFabricationSourceProvenance", locator: source.path, digest, sourceSpan: span(1, lines.length) } },
      artifact: { type: "FabricatedArtifactIdentity", version: 1, id: artifactId, kind: "jsnode-modules" },
      ...(claimed ? { claims: claimList } : {}), requirements, prohibitions, openQuestions, constraints: constraintsValue,
      projections: [{ type: "ArtifactFabricationProjection", version: 1, id: "jsnode-modules", target: "@red-cup-engineering/jsnode-package-services-section/derive-jsnode-package-from-closure", configuration: moduleRecord.value, sourceSpan: moduleRecord.sourceSpan }],
      acceptanceObligations, traceability: traceabilityValue,
    };
    return frozen({ type: "MarkdownJsnodeModuleSpecificationTranslation", version: 1, artifactSpecificationCandidate });
  }
  const packageFence = parsedFence(lines, sections["## Package"][0], "Package");
  if (packageFence.language !== "json" || packageFence.next !== sections["## Package"][1]) refuse("INVALID_PACKAGE_SECTION", "Package must contain exactly one JSON fence", span(packageFence.startLine, packageFence.endLine));
  const metadata = json(packageFence.text, "Package", packageFence.startLine);
  exactKeys(metadata, ["version", "topic", "packageName", "packageVersion", "license", "dependencies", "devDependencies", ...(Object.hasOwn(metadata, "cli") ? ["cli"] : [])], "Package", packageFence.startLine);
  if (metadata.version !== 2 || typeof metadata.topic !== "string") refuse("INVALID_PACKAGE_SECTION", "Package must carry version 2 and topic", span(packageFence.startLine, packageFence.endLine));
  if (claimed) { measuredDependencies(claimList, metadata.dependencies, packageFence.startLine); measuredDependencies(claimList, metadata.devDependencies, packageFence.startLine); }
  const readFences = (section, language, pattern, type) => {
    const values = [];
    for (let index = sections[section][0]; index < sections[section][1];) {
      const fence = parsedFence(lines, index, section.slice(3));
      const attribute = pattern.exec(fence.attributes);
      if (fence.language !== language || !attribute) refuse(`INVALID_${type}_SECTION`, `${section} fence is malformed`, span(fence.startLine, fence.endLine));
      values.push([fence, attribute]); index = fence.next;
    }
    return values;
  };
  const sources = closure ? [] : readFences("## Sources", "mjs", /^path=(src\/(?:[a-z][a-z0-9-]*\/)*[a-z][a-z0-9-]*\.mjs)$/u, "SOURCE").map(([fence, attribute]) => ({ type: "JavascriptNodePackageSource", path: attribute[1], text: fence.text }));
  const operationFences = readFences("## Operations", "json", /^$/u, "OPERATION");
  const operations = operationFences.map(([fence]) => {
    const operation = json(fence.text, "operation", fence.startLine);
    if (operation?.type !== "JsnodeOperationArguments" && !(typeof operation?.name === "string" && typeof operation?.module === "string" && typeof operation?.exportName === "string")) refuse("INVALID_OPERATION_SECTION", "Operations JSON must bind a named module export", span(fence.startLine, fence.endLine));
    if (closure && (operation.inputSchema === undefined || operation.outputSchema === undefined || typeof operation.inputSchema !== "object" || typeof operation.outputSchema !== "object")) {
      refuse("OPEN_SCHEMAS", `a closure's operation ${operation.name ?? "?"} states its input and output schemas: they are what the fabricator saturates and the assays check`, span(fence.startLine, fence.endLine));
    }
    return operation;
  });
  const tests = closure ? [] : readFences("## Tests", "mjs", /^path=(test\/[a-z][a-z0-9-]*\.test\.mjs)$/u, "TEST").map(([fence, attribute]) => ({ type: "JavascriptNodeOperationTestSource", path: attribute[1], text: fence.text }));
  const examples = readFences("## Examples", "json", /^name="([^"\r\n]+)" operation=((?:scripts\/[a-z][a-z0-9-]*\.mjs)|(?:[a-z][a-z0-9-]*))$/u, "EXAMPLE").map(([fence, attribute]) => {
    const value = json(fence.text, "example", fence.startLine); exactKeys(value, ["input", "output"], "example", fence.startLine);
    return { type: "JsnodeOperationPackageExample", name: attribute[1], operation: attribute[2], input: value.input, output: value.output };
  });
  const candidate = { type: "JsnodeOperationPackageSpecificationCandidate", version: 2, packageName: metadata.packageName, packageVersion: metadata.packageVersion, license: metadata.license, topic: metadata.topic, ...(Object.hasOwn(metadata, "cli") ? { cli: metadata.cli } : {}), sources, operations, tests, examples, dependencies: metadata.dependencies, devDependencies: metadata.devDependencies };
  const projection = { type: "ArtifactFabricationProjection", version: 1, id: "jsnode-operation-package", target: "@red-cup-engineering/jsnode-package-services-section/admit-jsnode-operation-package-specification", configuration: candidate, sourceSpan: span(packageFence.startLine, sections["## Examples"][1]) };
  const obligation = { type: "ArtifactFabricationAcceptanceObligation", version: claimed ? 2 : 1, ...(claimed ? { parameters: [], claimIds: conjecturedIds(claimList) } : {}), id: "jsnode-package-assays", kind: "assay", statement: closure
    ? "The derived JSNode package must pass the package-birth pipeline: its examples typed by their schemas, tests derived from the examples before the source, and its import and command faces giving the admitted outputs."
    : "The existing JSNode package-birth pipeline must admit, stage, test, pack, install, and assay the projected package.", sourceSpan: span(sections[closure ? "## Examples" : "## Tests"][0] + 1, sections["## Examples"][1]) };
  const coveredIds = new Set([...requirements, ...prohibitions].map((value) => value.id));
  const constraintIds = new Set(constraintsValue.map((value) => value.id));
  const traceabilityValue = traceability(lines, ...sections["## Traceability"], coveredIds, constraintIds);
  if (closure && openQuestions.some((question) => question.blocking)) refuse("BLOCKING_OPEN_QUESTION", `a closure with a blocking open question is not closed: ${openQuestions.filter((question) => question.blocking).map((question) => question.id).join(", ")}`, span(sections["## Open questions"][0]));
  const digest = sha256Digest(source.text);
  const artifactSpecificationCandidate = { type: "ArtifactFabricationSpecificationCandidate", version: claimed ? 2 : 1, source: { type: "ArtifactFabricationSource", version: 1, identity: { type: "ArtifactFabricationSourceIdentity", id: artifactId }, provenance: { type: "ArtifactFabricationSourceProvenance", locator: source.path, digest, sourceSpan: span(1, lines.length) } }, artifact: { type: "FabricatedArtifactIdentity", version: 1, id: artifactId, kind: "jsnode-operation-package" }, ...(claimed ? { claims: claimList } : {}), requirements, prohibitions, openQuestions, constraints: constraintsValue, projections: [projection], acceptanceObligations: [obligation], traceability: traceabilityValue };
  if (closure) return frozen({ type: "MarkdownJsnodeOperationPackageClosureTranslation", version: 1, artifactSpecificationCandidate, closure: { ...candidate, requirements, prohibitions, constraints: constraintsValue, openQuestions } });
  return frozen({ type: "MarkdownJsnodeOperationPackageSpecificationTranslation", version: 1, artifactSpecificationCandidate, jsnodeOperationPackageSpecificationCandidate: candidate });
}

/**
 * A closure's translation completed by what a fabricator derived from it: the derived sources and
 * tests take their places in the JSNode candidate, and the artifact specification's projection
 * carries the completed candidate. The specification still binds the closure's own source digest.
 * @param {object} translation A MarkdownJsnodeOperationPackageClosureTranslation.
 * @param {{sources: object[], tests: object[]}} derived The derived JavascriptNodePackageSource and test source records.
 * @returns {object} A MarkdownJsnodeOperationPackageSpecificationTranslation.
 */
export function completeClosureTranslation(translation, { sources, tests }) {
  const { requirements: _requirements, prohibitions: _prohibitions, constraints: _constraints, openQuestions: _questions, ...candidate } = translation.closure;
  const completed = { ...candidate, sources, tests };
  const artifactSpecificationCandidate = { ...translation.artifactSpecificationCandidate, projections: translation.artifactSpecificationCandidate.projections.map((projection) => ({ ...projection, configuration: completed })) };
  return frozen({ type: "MarkdownJsnodeOperationPackageSpecificationTranslation", version: 1, artifactSpecificationCandidate, jsnodeOperationPackageSpecificationCandidate: completed });
}

/**
 * Translates one closed Markdown work order into language-neutral and JSNode package candidates without admitting or writing either artifact.
 * @summary Translates a closed Markdown work order into artifact and JSNode package candidates.
 * @param {object} request A MarkdownJsnodeOperationPackageSpecificationTranslationRequest record.
 * @returns {object} A MarkdownJsnodeOperationPackageSpecificationTranslation or a MarkdownJsnodeOperationPackageSpecificationTranslationRefusal.
 */
export function translateMarkdownJsnodeOperationPackageSpecification(request) {
  try {
    exactKeys(request, ["type", "version", "source"], "request", 1);
    if (request.type !== "MarkdownJsnodeOperationPackageSpecificationTranslationRequest" || request.version !== 1) refuse("INVALID_REQUEST", "request must be MarkdownJsnodeOperationPackageSpecificationTranslationRequest@1", span(1));
    exactKeys(request.source, ["type", "path", "text"], "source", 1);
    if (request.source.type !== "MarkdownDocumentSource" || typeof request.source.path !== "string" || request.source.path.length === 0 || typeof request.source.text !== "string") refuse("INVALID_SOURCE", "source must be a MarkdownDocumentSource with path and text", span(1));
    const source = request.source;
    const lines = source.text.replace(/\r\n/gu, "\n").split("\n");
    if (lines.at(-1) === "") lines.pop();
    if (lines.includes("## Modules") || lines.includes("## Sources") || lines.includes("## Operations")) return translateV2(source, lines);
    if (!lines.includes("## Claims")) refuse("MISSING_CLAIMS", "a work order states the claims its clauses rest on in a ## Claims section (candidate version 1 is retired)", span(1));
    const claimed = true;
    const headings = withClaims(claimed, ["# ", "## Requirements", "## Prohibitions", "## Laws", "## Standards", "## Open questions", "## Package", "## Operation", "## Tests", "## Examples", "## Traceability"]);
    if (!lines[0]?.startsWith("# ")) refuse("MISSING_TITLE", "line 1 must be the Markdown title", span(1));
    const atxHeadings = lines.map((line, index) => ({ line, index })).filter(({ line }) => /^#{1,6} /u.test(line));
    if (atxHeadings.length !== headings.length || atxHeadings[0].index !== 0 || atxHeadings.slice(1).some(({ line }, index) => line !== headings[index + 1])) {
      refuse("UNKNOWN_STRUCTURE", "document must have exactly one title and exactly one of each required level-two heading", span(1));
    }
    const indexes = headings.map((heading, position) => position === 0 ? 0 : lines.indexOf(heading));
    if (indexes.some((value) => value < 0) || indexes.some((value, index) => index > 0 && value <= indexes[index - 1])) refuse("INVALID_STRUCTURE", `document headings must occur once and in this order: ${headings.join(", ")}`, span(1));
    const artifactId = slug(lines[0].slice(2).trim(), "title / artifact ID", 1);
    const sections = Object.fromEntries(headings.slice(1).map((heading, index) => [heading, [indexes[index + 1] + 1, indexes[index + 2] ?? lines.length]]));
    const claimList = claimed ? claimsFrom(lines, sections["## Claims"]) : null;
    const requirementClauses = clauseLines(lines, ...sections["## Requirements"], "requirements", claimed);
    const prohibitionClauses = clauseLines(lines, ...sections["## Prohibitions"], "prohibitions", claimed);
    const requirements = clausesOf("ArtifactFabricationRequirement", requirementClauses, claimList);
    const prohibitions = clausesOf("ArtifactFabricationProhibition", prohibitionClauses, claimList);
    const constraintsValue = [...constraints(lines, ...sections["## Laws"], "law", claimed), ...constraints(lines, ...sections["## Standards"], "standard", claimed)];
    const openQuestions = questions(lines, ...sections["## Open questions"], claimed);
    const packageFence = parsedFence(lines, sections["## Package"][0], "Package");
    if (packageFence.language !== "json" || packageFence.next !== sections["## Package"][1]) refuse("INVALID_PACKAGE_SECTION", "Package must contain exactly one JSON fence", span(packageFence.startLine, packageFence.endLine));
    const metadata = json(packageFence.text, "Package", packageFence.startLine);
    exactKeys(metadata, ["packageName", "packageVersion", "license", "dependencies", "devDependencies"], "Package", packageFence.startLine);
    if (claimed) { measuredDependencies(claimList, metadata.dependencies, packageFence.startLine); measuredDependencies(claimList, metadata.devDependencies, packageFence.startLine); }
    const operationFence = parsedFence(lines, sections["## Operation"][0], "Operation");
    const operationAttribute = /^path=(scripts\/[a-z][a-z0-9-]*\.mjs)$/u.exec(operationFence.attributes);
    if (operationFence.language !== "mjs" || !operationAttribute || operationFence.next !== sections["## Operation"][1]) refuse("INVALID_OPERATION_SECTION", "Operation must contain exactly one mjs fence with path=scripts/<command>.mjs", span(operationFence.startLine, operationFence.endLine));
    const tests = [];
    for (let index = sections["## Tests"][0]; index < sections["## Tests"][1];) {
      const fence = parsedFence(lines, index, "Tests");
      const attribute = /^path=(test\/[a-z][a-z0-9-]*\.test\.mjs)$/u.exec(fence.attributes);
      if (fence.language !== "mjs" || !attribute) refuse("INVALID_TEST_SECTION", "each test must be an mjs fence with path=test/<name>.test.mjs", span(fence.startLine, fence.endLine));
      tests.push({ type: "JavascriptNodeOperationTestSource", path: attribute[1], text: fence.text });
      index = fence.next;
    }
    if (tests.length === 0) refuse("MISSING_TESTS", "Tests must contain at least one complete test source fence", span(sections["## Tests"][0] + 1));
    const examples = [];
    for (let index = sections["## Examples"][0]; index < sections["## Examples"][1];) {
      const fence = parsedFence(lines, index, "Examples");
      const attribute = /^name="([^"\r\n]+)"$/u.exec(fence.attributes);
      if (fence.language !== "json" || !attribute) refuse("INVALID_EXAMPLE_SECTION", "each example must be a json fence with name=\"...\"", span(fence.startLine, fence.endLine));
      const example = json(fence.text, "example", fence.startLine);
      exactKeys(example, ["input", "output"], "example", fence.startLine);
      examples.push({ type: "JavascriptNodeOperationExample", name: attribute[1], input: example.input, output: example.output });
      index = fence.next;
    }
    if (examples.length === 0) refuse("MISSING_EXAMPLES", "Examples must contain at least one JSON example", span(sections["## Examples"][0] + 1));
    const jsnodeOperationPackageSpecificationCandidate = { type: "JsnodeOperationPackageSpecificationCandidate", version: 1, packageName: metadata.packageName, packageVersion: metadata.packageVersion, license: metadata.license, operation: { type: "JavascriptNodeOperationSource", path: operationAttribute[1], text: operationFence.text }, tests, examples, dependencies: metadata.dependencies, devDependencies: metadata.devDependencies };
    const projection = { type: "ArtifactFabricationProjection", version: 1, id: "jsnode-operation-package", target: "@red-cup-engineering/jsnode-package-services-section/admit-jsnode-operation-package-specification", configuration: jsnodeOperationPackageSpecificationCandidate, sourceSpan: span(packageFence.startLine, sections["## Examples"][1]) };
    const obligation = { type: "ArtifactFabricationAcceptanceObligation", version: claimed ? 2 : 1, ...(claimed ? { parameters: [], claimIds: conjecturedIds(claimList) } : {}), id: "jsnode-package-assays", kind: "assay", statement: "The existing JSNode package-birth pipeline must admit, stage, test, pack, install, and assay the projected package.", sourceSpan: span(sections["## Tests"][0] + 1, sections["## Examples"][1]) };
    const coveredIds = new Set([...requirements, ...prohibitions].map((value) => value.id));
    if (coveredIds.size !== requirements.length + prohibitions.length) refuse("DUPLICATE_CLAUSE_ID", "requirement and prohibition IDs must be globally unique", span(1));
    const constraintIds = new Set(constraintsValue.map((value) => value.id));
    const traceabilityValue = traceability(lines, ...sections["## Traceability"], coveredIds, constraintIds);
    const digest = sha256Digest(source.text);
    const artifactSpecificationCandidate = { type: "ArtifactFabricationSpecificationCandidate", version: claimed ? 2 : 1, source: { type: "ArtifactFabricationSource", version: 1, identity: { type: "ArtifactFabricationSourceIdentity", id: artifactId }, provenance: { type: "ArtifactFabricationSourceProvenance", locator: source.path, digest, sourceSpan: span(1, lines.length) } }, artifact: { type: "FabricatedArtifactIdentity", version: 1, id: artifactId, kind: "jsnode-operation-package" }, ...(claimed ? { claims: claimList } : {}), requirements, prohibitions, openQuestions, constraints: constraintsValue, projections: [projection], acceptanceObligations: [obligation], traceability: traceabilityValue };
    return frozen({ type: "MarkdownJsnodeOperationPackageSpecificationTranslation", version: 1, artifactSpecificationCandidate, jsnodeOperationPackageSpecificationCandidate });
  } catch (error) {
    if (error instanceof TranslationRefusal) return frozen({ type: "MarkdownJsnodeOperationPackageSpecificationTranslationRefusal", version: 1, code: error.code, message: error.message, sourceSpan: error.sourceSpan });
    throw error;
  }
}
