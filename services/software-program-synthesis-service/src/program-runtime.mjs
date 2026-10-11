import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { repoFileList } from "@red-cup-engineering/coding-context-projection-service";
import { hireOfficerContextCompilation } from "@union-officer-academy/officer-context-compilation-service/client";
import { executeSoftwareMission as defaultExecuteSoftwareMission } from "@red-cup-engineering/software-mission-execution-service/client";
import { normalizeCausalWitnessJournal } from "@lenticule-science/witness-journal-rdf-projection-service/causal";
import { createSettlementStore, relationalWitnessJournalDocument } from "@lenticule-science/witness-journal-rdf-projection-service/client";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
import { runTestsCommand } from "@red-cup-engineering/sandbox-command-execution-service";
import {
  assayExecutionGeometryCircuit as defaultAssayExecutionGeometryCircuit,
  measureExecutionEconomy,
  projectExecutionGeometryCircuit as defaultProjectExecutionGeometryCircuit,
} from "./execution-manifold-circuit.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ACADEMY = resolve(process.env.UNION_OFFICER_ACADEMY_ROOT
  ?? fileURLToPath(new URL("../../../../../../union-officer-academy/", import.meta.url)));
const REPERTOIRE = join(ACADEMY, "lib/professional-repertoire/skills");
const OFFICES = join(ACADEMY, "content/professional-repertoire/offices");
const CHARACTER = join(ACADEMY, "content/characters/codex-interactive-session/character.json");
const NI_PATTERN = /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;

function semanticDocumentId(objectKind, value) {
  return identifyJsonSemanticContent({ objectKind, value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
}

const ENGINEERING_STAGES = Object.freeze([
  { role: "prior-art-synthesis", office: "configuration-manager", skill: "writing-a-note-about-research/SKILL.md" },
  { role: "system-operational-concept", office: "system-engineer", skill: "writing-a-system-operational-concept/SKILL.md", validator: "write-a-system-operational-concept.js" },
  { role: "software-requirements-specification", office: "requirements-analysis-team", skill: "writing-a-software-requirements-specification/SKILL.md", validator: "write-a-software-requirements-specification.js" },
  { role: "software-architecture-specification", office: "system-architect", skill: "writing-a-software-architecture-specification/SKILL.md", companion: "writing-an-ieee-42010-architecture-description/SKILL.md" },
  { role: "high-level-design", office: "module-lead", skill: "writing-a-high-level-design/SKILL.md", recordValidator: "write-a-high-level-design.js" },
  { role: "low-level-design", office: "module-developer", skill: "writing-a-low-level-design/SKILL.md", recordValidator: "write-a-low-level-design.js" },
  { role: "verification-and-validation-specification", office: "product-quality-assurance", skill: "writing-a-verification-and-validation-specification/SKILL.md", validator: "write-a-verification-and-validation-specification.js" },
]);

function requireMissionReceipt(result) {
  const receipt = result?.executionReceipt;
  if (typeof result?.executionProvider !== "string" || !result.executionProvider
      || !NI_PATTERN.test(receipt?.inputNi ?? "") || !NI_PATTERN.test(receipt?.outputNi ?? "")
      || receipt.agentCard === null || typeof receipt?.agentCard !== "object" || Array.isArray(receipt.agentCard)
      || receipt?.authentication?.agentCardSignatureVerified !== true || receipt.authentication.required !== true) {
    throw new Error("mission settlement omitted its exact signed A2A provider receipt");
  }
  return receipt;
}

function focusCovers(requiredPath, focusPaths) {
  const required = normalizeFocusPath(requiredPath);
  if (required === null) return false;
  return focusPaths.some((focusPath) => {
    const focus = normalizeFocusPath(focusPath);
    return focus !== null && (focus === "." || required === focus || required.startsWith(`${focus}/`));
  });
}

function normalizeFocusPath(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim().replaceAll("\\", "/");
  if (!raw || raw.startsWith("/")) return null;
  const parts = raw.split("/").filter((part) => part && part !== ".");
  if (parts.some((part) => part === "..")) return null;
  return parts.length ? parts.join("/") : ".";
}

function overlappingBoundaries(left, right) {
  if (left.unbounded || right.unbounded) return ["*"];
  const boundaries = [];
  for (const leftPath of left.patches) {
    for (const rightPath of right.patches) {
      if (leftPath === "." || rightPath === "." || leftPath === rightPath || leftPath.startsWith(`${rightPath}/`) || rightPath.startsWith(`${leftPath}/`)) {
        boundaries.push(`${leftPath}::${rightPath}`);
      }
    }
  }
  return boundaries;
}

export function deriveExecutionGeometry(plan, { admitSpatialSeparation = true } = {}) {
  const missions = Array.isArray(plan?.missions) ? plan.missions : [];
  const position = new Map(missions.map((mission, index) => [mission.id, index]));
  const vertices = missions.map((mission) => {
    const patches = [...new Set((mission.focusPaths || []).map(normalizeFocusPath).filter((path) => path !== null))].sort();
    return {
      missionId: mission.id,
      patches,
      unbounded: !admitSpatialSeparation || patches.length === 0 || patches.includes("."),
    };
  });
  const causalEdges = missions.flatMap((mission) => mission.dependsOn.map((dependency) => ({ from: dependency, to: mission.id })));
  const spatialOverlapEdges = [];
  for (let leftIndex = 0; leftIndex < vertices.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < vertices.length; rightIndex += 1) {
      const left = vertices[leftIndex], right = vertices[rightIndex];
      const boundaries = overlappingBoundaries(left, right);
      if (boundaries.length) spatialOverlapEdges.push({ left: left.missionId, right: right.missionId, boundaries });
    }
  }
  const conflicts = new Set(spatialOverlapEdges.map((edge) => [edge.left, edge.right].sort().join("\u0000")));
  const remainingDependencies = new Map(missions.map((mission) => [mission.id, new Set(mission.dependsOn)]));
  const unscheduled = new Set(missions.map((mission) => mission.id)), sheets = [];
  while (unscheduled.size) {
    const ready = [...unscheduled]
      .filter((missionId) => remainingDependencies.get(missionId).size === 0)
      .sort((left, right) => position.get(left) - position.get(right));
    if (!ready.length) throw new Error("cannot derive execution geometry for a cyclic mission graph");
    const missionIds = [];
    for (const missionId of ready) {
      const overlapsSheet = missionIds.some((otherId) => conflicts.has([missionId, otherId].sort().join("\u0000")));
      if (!overlapsSheet) missionIds.push(missionId);
    }
    sheets.push({ index: sheets.length, missionIds });
    for (const missionId of missionIds) {
      unscheduled.delete(missionId);
      for (const dependencies of remainingDependencies.values()) dependencies.delete(missionId);
    }
  }
  const serialMissionSlots = missions.length;
  const executionSheetCount = sheets.length;
  return {
    kind: "program-execution-geometry",
    foldRule: "causally-ready missions in plan order, folded into pairwise spatially-disjoint sheets",
    spatialSeparationAdmitted: admitSpatialSeparation,
    vertices,
    causalEdges,
    spatialOverlapEdges,
    sheets,
    measures: {
      serialMissionSlots,
      executionSheetCount,
      maximumConcurrentMissions: Math.max(0, ...sheets.map((sheet) => sheet.missionIds.length)),
      parallelOpportunitySlots: Math.max(0, serialMissionSlots - executionSheetCount),
      parallelCompression: { numerator: serialMissionSlots, denominator: executionSheetCount || 1 },
    },
  };
}

export function validatePlan(plan, { acceptanceKeys, requiredFocusPaths = [], requiredAcceptanceKeys = [], requiredMissionBundles = [] } = {}) {
  if (!plan || !Array.isArray(plan.missions) || plan.missions.length < 1) return { ok: false, reason: "a plan requires at least one mission" };
  const ids = plan.missions.map((m) => m.id);
  if (ids.some((id) => typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id)) || new Set(ids).size !== ids.length) return { ok: false, reason: "mission ids must be unique lowercase slugs" };
  const set = new Set(ids), incoming = new Map(ids.map((id) => [id, 0])), outgoing = new Map(ids.map((id) => [id, []]));
  for (const mission of plan.missions) {
    if (!acceptanceKeys.includes(mission.acceptanceKey)) return { ok: false, reason: `unknown acceptance key ${mission.acceptanceKey}` };
    if (!Array.isArray(mission.dependsOn) || mission.dependsOn.some((id) => !set.has(id) || id === mission.id)) return { ok: false, reason: `invalid dependency on ${mission.id}` };
    if (!Array.isArray(mission.focusPaths) || mission.focusPaths.some((path) => normalizeFocusPath(path) === null)) return { ok: false, reason: `invalid focus path on ${mission.id}` };
    for (const dependency of mission.dependsOn) { incoming.set(mission.id, incoming.get(mission.id) + 1); outgoing.get(dependency).push(mission.id); }
  }
  const admittedFocus = plan.missions.flatMap((mission) => Array.isArray(mission.focusPaths) ? mission.focusPaths : []);
  const uncovered = requiredFocusPaths.filter((path) => !focusCovers(path, admittedFocus));
  if (uncovered.length) return { ok: false, reason: `required focus paths are uncovered: ${uncovered.join(", ")}` };
  const usedAcceptanceKeys = new Set(plan.missions.map((mission) => mission.acceptanceKey));
  const missingAcceptanceKeys = requiredAcceptanceKeys.filter((key) => !usedAcceptanceKeys.has(key));
  if (missingAcceptanceKeys.length) return { ok: false, reason: `required acceptance keys are unused: ${missingAcceptanceKeys.join(", ")}` };
  for (const [index, bundle] of requiredMissionBundles.entries()) {
    if (!bundle || !acceptanceKeys.includes(bundle.acceptanceKey) || !Array.isArray(bundle.focusPaths) || bundle.focusPaths.length === 0) return { ok: false, reason: `required mission bundle ${index + 1} is invalid` };
    const jointlyCovered = plan.missions.some((mission) => mission.acceptanceKey === bundle.acceptanceKey
      && bundle.focusPaths.every((path) => focusCovers(path, Array.isArray(mission.focusPaths) ? mission.focusPaths : [])));
    if (!jointlyCovered) return { ok: false, reason: `no single mission jointly covers required bundle ${index + 1} (${bundle.acceptanceKey}: ${bundle.focusPaths.join(", ")})` };
  }
  const ready = ids.filter((id) => incoming.get(id) === 0), order = [];
  while (ready.length) {
    const id = ready.shift(); order.push(id);
    for (const next of outgoing.get(id)) { incoming.set(next, incoming.get(next) - 1); if (incoming.get(next) === 0) ready.push(next); }
  }
  return order.length === ids.length ? { ok: true, order, geometry: deriveExecutionGeometry(plan) } : { ok: false, reason: "mission dependency graph is cyclic" };
}

function bytesSource(path, extra = {}) {
  const bytes = readFileSync(path);
  const identified = identifyJsonSemanticContent({
    objectKind: "software-program-synthesis.source-artifact",
    value: { mediaType: "application/octet-stream", contentBase64: bytes.toString("base64") },
    witnessRoot: EMPTY_WITNESS_ROOT,
  });
  return {
    identity: path,
    semanticId: identified.token,
    bytesBase64: bytes.toString("base64"),
    ...extra,
  };
}

function valueSource(identity, value, extra = {}) {
  const bytes = Buffer.from(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  const identified = identifyJsonSemanticContent({
    objectKind: "software-program-synthesis.generated-value",
    value,
    witnessRoot: EMPTY_WITNESS_ROOT,
  });
  return {
    identity,
    semanticId: identified.token,
    bytesBase64: bytes.toString("base64"),
    ...extra,
  };
}

function validateEngineeringArtifact(stage, artifact, programId) {
  if (!stage.validator && !stage.recordValidator) return { ok: true, coverage: "skill-law-and-downstream-review" };
  const directory = mkdtempSync(join(tmpdir(), "union-engineering-artifact-"));
  try {
    if (stage.validator) {
      const path = join(directory, `${stage.role}.md`);
      writeFileSync(path, `${artifact.trim()}\n`);
      const result = spawnSync(process.execPath, [join(REPERTOIRE, stage.validator), path], { encoding: "utf8" });
      if (result.status === 0) return { ok: true, coverage: "canonical-genre-validator", witness: JSON.parse(result.stdout) };
      return { ok: false, reason: result.stdout.trim() || result.stderr.trim() || `validator exited ${result.status}` };
    }
    const id = `${stage.role}-${createHash("sha256").update(`${programId}\n${artifact}`).digest("hex").slice(0, 16)}`;
    const record = { id, name: stage.role, unit: programId.replaceAll(":", "-"), status: "draft", body: artifact };
    const result = spawnSync(process.execPath, [join(REPERTOIRE, stage.recordValidator), "--dry-run"], {
      input: JSON.stringify(record), encoding: "utf8",
    });
    if (result.status === 0) return { ok: true, coverage: "canonical-record-writer-dry-run", witness: JSON.parse(result.stdout), record };
    return { ok: false, reason: result.stdout.trim() || result.stderr.trim() || `record validator exited ${result.status}` };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function section(text, heading) {
  const lines = String(text).split("\n");
  const start = lines.findIndex((line) => /^#{1,6}\s+/u.test(line)
    && line.replace(/^#{1,6}\s+/u, "").trim().toLowerCase() === heading.toLowerCase());
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && /^#{1,6}\s+/u.test(line));
  return lines.slice(start + 1, end < 0 ? lines.length : end).join("\n");
}

export function deriveEngineeringExecutionContract(engineeringDesign) {
  const lld = engineeringDesign?.stages?.find(({ role }) => role === "low-level-design")?.artifact ?? "";
  const vnv = engineeringDesign?.stages?.find(({ role }) => role === "verification-and-validation-specification")?.artifact ?? "";
  const loci = section(lld, "Implementation Loci");
  const paths = [...loci.matchAll(/^\s*-\s+path:\s+`([^`]+)`\s*$/gimu)]
    .map((match) => normalizeFocusPath(match[1]))
    .filter((path) => path !== null && path !== ".");
  const checks = section(vnv, "Executable Acceptance");
  const command = /^\s*command:\s+`([^`]+)`\s*$/gimu.exec(checks)?.[1]?.trim() ?? "";
  if (paths.length === 0) throw new Error("accepted LLD omitted a nonempty ## Implementation Loci register of exact repository-relative paths");
  if (!command) throw new Error("accepted V&V specification omitted one command in ## Executable Acceptance");
  return Object.freeze({
    writablePaths: Object.freeze([...new Set(paths)].sort()),
    focusPaths: Object.freeze([...new Set(paths)].sort()),
    verifyCommand: command,
    acceptanceCommand: command,
    acceptanceCatalog: Object.freeze({
      delivery: Object.freeze({
        description: "The accepted V&V executable acceptance command settles successfully.",
        command,
        testVectors: Object.freeze([]),
      }),
    }),
  });
}

function officerPrompt(bundle) {
  const render = (source) => Buffer.from(source.bytesBase64, "base64").toString("utf8");
  return [
    `OFFICE\n${render(bundle.office.source)}`,
    `CHARACTER\n${render(bundle.character.source)}`,
    ...bundle.materials.map((material) => `MATERIAL ${material.identity}\n${render(material)}`),
    ...bundle.inferences.map((inference) => `PRIOR WORK ${inference.identity}\n${render(inference)}`),
    `AUTHORITY\n${JSON.stringify(bundle.authority)}`,
  ].join("\n\n");
}

export async function compileEngineeringDesign(input, { hireInquiry = defaultExecuteSoftwareMission, hireContext = hireOfficerContextCompilation, residue, signal } = {}) {
  const territory = input.territory ? resolve(input.territory) : null;
  const programId = input.id || "urn:ame:software-program-synthesis-service:program";
  const leader = valueSource(`${programId}:leader-question`, input.objective);
  const repository = valueSource(`${programId}:repository-observation`, {
    ...(territory ? { territory, files: repoFileList(territory) } : { source: input.source }),
    acceptanceCatalog: input.acceptanceCatalog,
    requiredFocusPaths: input.requiredFocusPaths ?? [],
    constraints: input.constraints ?? [],
  }, { owner: "urn:ame:coding-context-projection-service", purpose: "repository denominator", authorityClass: "current-practice" });
  const stages = [], accepted = [];
  for (const definition of ENGINEERING_STAGES) {
    let assayResidue = "";
    const attempts = [];
    for (let attempt = 1; ; attempt += 1) {
      signal?.throwIfAborted();
      const startedAt = new Date().toISOString();
      const officePath = join(OFFICES, `${definition.office}.json`);
      const skillPaths = [join(REPERTOIRE, definition.skill), ...(definition.companion ? [join(REPERTOIRE, definition.companion)] : [])];
      const request = {
        type: "OfficerContextCompilationRequest",
        requestId: `${programId}:${definition.role}:${attempt}`,
        requestedAt: new Date().toISOString(),
        purpose: `Produce the ${definition.role} for the admitted software question without implementing downstream work.`,
        leaderSource: [leader],
        office: { id: definition.office, epoch: "professional-repertoire-2026-07-26", source: bytesSource(officePath) },
        character: { id: "codex-interactive-session", epoch: "character-2026-07-17", source: bytesSource(CHARACTER), chronicle: [] },
        materials: [repository, ...skillPaths.map((path) => bytesSource(path, { owner: "urn:ame:union-officer-academy", purpose: definition.role, authorityClass: "current-practice" }))],
        inferences: accepted.map(({ role, artifact }) => valueSource(`${programId}:${role}`, artifact, { author: `urn:office:${role}` })),
        omissions: [],
        authority: {
          customer: "urn:ame:software-program-synthesis-service",
          office: definition.office,
          allowedActions: ["produce-bounded-work-product"],
          withheldActions: ["mutate-customer-territory", "claim-acceptance", "deploy", "spend-outside-this-work-lot"],
        },
      };
      const context = await hireContext(request, { signal });
      const objective = [
        officerPrompt(context.result.bundle),
        `Inspect the admitted repository and produce only the ${definition.role} owed by this office for the Leader's question.`,
        "Use list_files, search, and read until the work product is grounded in actual repository evidence. Finish with the complete native-text work product; do not serialize it as JSON.",
        definition.role === "low-level-design"
          ? "Include a ## Implementation Loci section containing every implementation and test artifact as exact `- path: `repo/relative/path`` entries. This is the capability-attenuated write set released to implementation."
          : "",
        definition.role === "verification-and-validation-specification"
          ? "Include a ## Executable Acceptance section containing exactly one `command: `machine command`` line that runs the accepted case register against the admitted repository."
          : "",
        residue ? `Prior program residue:\n${residue}` : "",
        assayResidue ? `The canonical genre pore rejected the previous candidate:\n${assayResidue}` : "",
      ].filter(Boolean).join("\n\n");
      const record = await hireInquiry({
        id: `${programId}:${definition.role}:${attempt}`,
        objective,
        ...(input.source ? { source: input.source } : { territory }),
        workType: "inquiry",
        inferenceWorkType: definition.role === "prior-art-synthesis" ? "research" : "software-engineering",
        readablePaths: input.engineeringReadablePaths ?? [],
        requiredCapabilities: [definition.role],
        inferenceRequiredCapabilities: [definition.role],
        constraints: input.constraints ?? [],
      }, { signal });
      if (record?.executionReceipt) requireMissionReceipt(record);
      const artifact = record?.outcome?.inquiryResult;
      const extracted = typeof artifact === "string" && artifact.trim()
        ? { ok: true, product: artifact.trim() }
        : { ok: false, reason: record?.outcome?.classification ?? "inquiry provider returned no work product" };
      const assay = extracted.ok ? validateEngineeringArtifact(definition, extracted.product, programId) : extracted;
      if (assay.ok && ["low-level-design", "verification-and-validation-specification"].includes(definition.role)) {
        try {
          deriveEngineeringExecutionContract({ stages: [...accepted, { role: definition.role, artifact: extracted.product }] });
        } catch (error) {
          if (definition.role === "low-level-design" && !/accepted V&V/u.test(error.message)) Object.assign(assay, { ok: false, reason: error.message });
          if (definition.role === "verification-and-validation-specification") Object.assign(assay, { ok: false, reason: error.message });
        }
      }
      const finishedAt = new Date().toISOString();
      const attemptRecord = {
        attempt,
        startedAt,
        finishedAt,
        provider: record.executionProvider ?? null,
        procurement: record.processNode?.procurements ?? [],
        candidate: extracted.ok ? valueSource(`${programId}:${definition.role}:candidate:${attempt}`, extracted.product).semanticId : null,
        assay,
      };
      attempts.push(attemptRecord);
      if (!assay.ok) { assayResidue = assay.reason; continue; }
      const settled = {
        role: definition.role,
        office: definition.office,
        artifact: extracted.product,
        artifactId: valueSource(`${programId}:${definition.role}`, extracted.product).semanticId,
        provider: record.executionProvider ?? null,
        procurement: record.processNode?.procurements ?? [],
        context: context.receipt,
        assay,
        attempts,
        attemptYield: { numerator: 1, denominator: attempts.length },
        kineticObservation: {
          startedAt: attempts[0].startedAt,
          finishedAt,
          observationWindow: input.engineeringObservationWindow ?? null,
          proofDeborahNumber: input.engineeringObservationWindow == null
            ? null
            : { relaxationMilliseconds: Date.parse(finishedAt) - Date.parse(attempts[0].startedAt), observationWindowMilliseconds: input.engineeringObservationWindow },
        },
        measure: record.metrics ?? { directInteractiveModelCalls: 0, expectedConsideration: [] },
      };
      stages.push(settled); accepted.push(settled); break;
    }
  }
  return { type: "StandardsDrivenEngineeringDesign", question: leader.semanticId, repository: repository.semanticId, stages };
}

function deterministicPlan(input, engineeringDesign) {
  const acceptanceKeys = Object.keys(input.acceptanceCatalog || {});
  const design = engineeringDesign.stages.map(({ role, artifactId, artifact }) => `## ${role} (${artifactId})\n${artifact}`).join("\n\n");
  const bundles = input.requiredMissionBundles?.length
    ? input.requiredMissionBundles
    : (input.requiredAcceptanceKeys?.length ? input.requiredAcceptanceKeys : acceptanceKeys).map((acceptanceKey) => ({ acceptanceKey, focusPaths: input.requiredFocusPaths ?? [] }));
  const selected = bundles.length ? bundles : [{ acceptanceKey: acceptanceKeys[0], focusPaths: input.requiredFocusPaths ?? [] }];
  return {
    strategy: "Realize the accepted standards-driven design through acceptance-derived software missions.",
    missions: selected.map((bundle, index) => ({
      id: `realize-${index + 1}`,
      objective: `${input.objective}\n\nImplement this accepted engineering design; do not re-plan it:\n\n${design}`,
      dependsOn: index === 0 ? [] : [`realize-${index}`],
      acceptanceKey: bundle.acceptanceKey,
      focusPaths: [...bundle.focusPaths],
    })),
  };
}

export async function compileProgram(input, { hireInquiry = defaultExecuteSoftwareMission, hireContext, residue = "", signal } = {}) {
  signal?.throwIfAborted();
  const territory = input.territory ? resolve(input.territory) : null;
  const acceptanceKeys = Object.keys(input.acceptanceCatalog || {});
  const immutableSource = input.source?.kind === "github-repository"
    && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(input.source.repository ?? "")
    && /^[0-9a-f]{40}$/u.test(input.source.commit ?? "");
  if (!input.objective || (!immutableSource && (!territory || !existsSync(territory))) || acceptanceKeys.length === 0) {
    throw new Error("program compilation requires an objective, an existing territory or immutable GitHub source, and a nonempty acceptanceCatalog");
  }
  const engineeringDesign = input.engineeringDesign ?? await compileEngineeringDesign(input, { hireInquiry, hireContext, residue, signal });
  const executionContract = deriveEngineeringExecutionContract(engineeringDesign);
  const requiredFocusPaths = input.requiredFocusPaths?.length ? input.requiredFocusPaths : executionContract.focusPaths;
  const requiredAcceptanceKeys = input.requiredAcceptanceKeys || [];
  const requiredMissionBundles = input.requiredMissionBundles?.length
    ? input.requiredMissionBundles
    : [{ acceptanceKey: acceptanceKeys[0], focusPaths: requiredFocusPaths }];
  const planningInput = { ...input, requiredFocusPaths, requiredMissionBundles };
  let plan;
  if (input.missionPlan !== undefined) {
    plan = input.missionPlan;
  } else {
    plan = deterministicPlan(planningInput, engineeringDesign);
  }
  const verdict = validatePlan(plan, { acceptanceKeys, requiredFocusPaths, requiredAcceptanceKeys, requiredMissionBundles });
  if (!verdict.ok) throw new Error(`acceptance-derived mission topology is inconsistent: ${verdict.reason}`);
  const selected = {
    plan,
    order: verdict.order,
    geometry: deriveExecutionGeometry(plan, { admitSpatialSeparation: input.enforcePlannerFocusWrites === true }),
    endpoint: engineeringDesign.stages.map(({ provider }) => provider),
    attempts: engineeringDesign.stages.length,
    planningMeasure: {
      directInteractiveModelCalls: 0,
      expectedConsideration: engineeringDesign.stages.flatMap(({ measure }) => measure?.expectedConsideration ?? []),
    },
    planningProcurement: engineeringDesign.stages.map(({ role, procurement }) => ({ role, procurement })),
  };
  return { selected, proposals: [selected], plannerJobs: engineeringDesign.stages.length, engineeringDesign, executionContract };
}

export async function runProgram(input, {
  runInquiry = defaultExecuteSoftwareMission,
  runMission,
  runMissionPipeline,
  witnessJournalAgentUrl = process.env.WITNESS_JOURNAL_RDF_AGENT,
  recordExecutionEvent,
  checkCommand = (territory, command) => runTestsCommand(territory, command),
  projectExecutionGeometryCircuit = defaultProjectExecutionGeometryCircuit,
  assayExecutionGeometryCircuit = defaultAssayExecutionGeometryCircuit,
  signal,
} = {}) {
  signal?.throwIfAborted();
  const id = input.id || `urn:ame:software-program-synthesis-service:program:${randomUUID()}`, territory = resolve(input.territory);
  const startedAt = new Date().toISOString(), cycles = [];
  const appendExecutionEvent = recordExecutionEvent ?? (() => {
    const store = createSettlementStore({ settlementRoot: ROOT, agentUrl: witnessJournalAgentUrl });
    return ({ category, recordedAt, record }) => store.record({ category, recordedAt, record });
  })();
  let acceptance = checkCommand(territory, input.acceptanceCommand);
  if (acceptance.passed) return { id, objective: input.objective, startedAt, finishedAt: new Date().toISOString(), status: "already-satisfied", cycles, acceptance };
  let residue = acceptance.output;
  for (let cycle = 1; ; cycle += 1) {
    signal?.throwIfAborted();
    const compilation = await compileProgram({ ...input, id: `${id}:cycle:${cycle}` }, { hireInquiry: runInquiry, residue, signal });
    const byId = new Map(compilation.selected.plan.missions.map((mission) => [mission.id, mission]));
    const executionGeometry = deriveExecutionGeometry(compilation.selected.plan, {
      admitSpatialSeparation: input.enforcePlannerFocusWrites === true,
    });
    const circuitCoordinates = { programId: `${id}:cycle:${cycle}`, territory };
    const circuitAssayUrl = input.executionCircuitAssayUrl ?? process.env.UNION_HIERARCHICAL_CIRCUIT_EQUIVALENCE_AGENT_CARD_URL;
    const circuitProjection = circuitAssayUrl
      ? await assayExecutionGeometryCircuit(executionGeometry, { ...circuitCoordinates, agentUrl: circuitAssayUrl })
      : projectExecutionGeometryCircuit(executionGeometry, circuitCoordinates);
    const executionCircuit = {
      projection: circuitProjection.projection,
      projectionId: circuitProjection.projectionId,
      assay: circuitProjection.assay ?? null,
    };
    const outcomes = [], blockedMissions = [], executionEvents = [], settled = new Map(), blocked = new Map(), running = new Map();
    const pending = new Set(compilation.selected.plan.missions.map(({ id: missionId }) => missionId));
    const conflicts = new Set(executionGeometry.spatialOverlapEdges.map(({ left, right }) => [left, right].sort().join("\u0000")));
    const conflictsWithRunning = (missionId) => [...running.keys()].some((otherId) => conflicts.has([missionId, otherId].sort().join("\u0000")));
    const recordEvent = async (mission, phase, disposition, result, causes, reason = null) => {
      const recordedAt = new Date().toISOString();
      const receipt = result?.executionReceipt ?? null;
      const body = {
        type: phase === "invocation" ? "SoftwareProgramMissionInvocationEvent" : "SoftwareProgramMissionSettlementEvent",
        graph: result?.semanticId ?? result?.executionReceipt?.outputNi ?? executionCircuit.projection.circuit,
        causes,
        program: id,
        cycle,
        mission: mission.id,
        phase,
        disposition,
        executionProvider: result?.executionProvider ?? null,
        executionInput: receipt?.inputNi ?? null,
        executionOutput: receipt?.outputNi ?? null,
        executionAgentCard: receipt?.agentCard ? semanticDocumentId("software-program-synthesis.execution-agent-card", receipt.agentCard) : null,
        executionAuthentication: receipt?.authentication ?? null,
        integrated: result?.outcome?.integrated === true,
        reason,
      };
      const event = { id: semanticDocumentId("software-program-synthesis.mission-event", body), ...body };
      normalizeCausalWitnessJournal([...executionEvents, event]);
      const projection = await appendExecutionEvent({
        category: "software-program.mission-settlement",
        recordedAt,
        record: event,
      });
      const recorded = { ...event, record: projection.documentNi, projection: projection.digest, request: projection.requestNi, response: projection.responseNi };
      executionEvents.push(recorded);
      return recorded;
    };
    const launch = (missionId) => {
      const mission = byId.get(missionId), acceptanceSpec = input.acceptanceCatalog[mission.acceptanceKey];
      const executeMission = runMissionPipeline ?? runMission ?? defaultExecuteSoftwareMission;
      const causes = mission.dependsOn.map((dependency) => settled.get(dependency)?.event.id).filter(Boolean).sort();
      pending.delete(missionId);
      running.set(missionId, (async () => {
        const invocation = await recordEvent(mission, "invocation", "admitted", null, causes);
        try {
          const result = await executeMission({
            id: `${id}:cycle:${cycle}:mission:${mission.id}`,
            objective: mission.objective,
            taskClass: input.taskClass || null,
            territory,
            verifyCommand: input.verifyCommand,
            acceptanceCommand: acceptanceSpec.command,
            testVectors: acceptanceSpec.testVectors || input.testVectors || [],
            constraints: [...(input.constraints || []), ...(mission.focusPaths?.length ? [`Prefer the admitted focus paths: ${mission.focusPaths.join(", ")}`] : [])],
            focusPaths: mission.focusPaths || [],
            writablePaths: input.enforcePlannerFocusWrites === true ? (mission.focusPaths || []) : [],
            commands: input.commands || {},
            workType: input.missionWorkType || "software-engineering",
            requiredCapabilities: input.missionRequiredCapabilities || ["software-engineering"],
            supplierExclusions: input.supplierExclusions || [],
            ...(typeof input.enforceProviderSchema === "boolean" ? { enforceProviderSchema: input.enforceProviderSchema } : {}),
            ...(input.missionDifficulty == null ? {} : { difficulty: input.missionDifficulty }),
            ...(input.missionConsiderationPolicy == null ? {} : { considerationPolicy: input.missionConsiderationPolicy }),
            ...(input.missionRoutingProfile == null ? {} : { routingProfile: input.missionRoutingProfile }),
            ...(input.missionExtendedRoutingRationale == null ? {} : { extendedRoutingRationale: input.missionExtendedRoutingRationale }),
            ...(typeof input.missionRequireStrongContext === "boolean" ? { requireStrongContext: input.missionRequireStrongContext } : {}),
          }, { signal });
          requireMissionReceipt(result);
          const event = await recordEvent(
            mission,
            "settlement",
            result.outcome?.verified === true && result.outcome?.proposal?.customerMutation === false
              ? "awaiting-receiver-induction"
              : "refused",
            result,
            [invocation.id],
          );
          return { missionId, result, event, invocation };
        } catch (error) {
          const result = {
            executionProvider: null,
            executionReceipt: null,
            semanticId: null,
            outcome: { verified: false, integrated: false, classification: "mission-transport-refusal", reason: error.message },
            metrics: { directInteractiveModelCalls: 0, expectedConsideration: [] },
            processNode: null,
          };
          const event = await recordEvent(mission, "settlement", "transport-refusal", null, [invocation.id], error.message);
          return { missionId, result, event, invocation };
        }
      })());
    };
    while (pending.size > 0 || running.size > 0) {
      let changed = true;
      while (changed) {
        changed = false;
        for (const missionId of [...pending]) {
          const mission = byId.get(missionId);
          const failedDependencies = mission.dependsOn.filter((dependency) => blocked.has(dependency) || settled.get(dependency)?.result.outcome?.integrated !== true && settled.has(dependency));
          if (failedDependencies.length === 0) continue;
          pending.delete(missionId);
          const causes = failedDependencies.map((dependency) => blocked.get(dependency)?.event.id ?? settled.get(dependency)?.event.id).filter(Boolean).sort();
          const event = await recordEvent(mission, "settlement", "causally-blocked", null, causes);
          const residue = { missionId, failedDependencies, event };
          blocked.set(missionId, residue); blockedMissions.push(residue); changed = true;
        }
      }
      for (const mission of compilation.selected.plan.missions) {
        if (!pending.has(mission.id) || conflictsWithRunning(mission.id)) continue;
        if (mission.dependsOn.every((dependency) => settled.get(dependency)?.result.outcome?.integrated === true)) launch(mission.id);
      }
      if (running.size === 0) {
        if (pending.size > 0) throw new Error("causal execution frontier cannot advance");
        break;
      }
      const completed = await Promise.race([...running.entries()].map(([missionId, promise]) => promise.then((value) => ({ missionId, value }))));
      running.delete(completed.missionId);
      settled.set(completed.missionId, completed.value);
      outcomes.push({ missionId: completed.value.missionId, result: completed.value.result });
    }
    const proposalsAwaitingInduction = outcomes.filter(({ result }) =>
      result.outcome?.verified === true
      && result.outcome?.proposal?.customerMutation === false
      && result.outcome?.integrated !== true);
    acceptance = proposalsAwaitingInduction.length
      ? {
          passed: false,
          output: "verified mission proposals await induction by the receiving settlement",
        }
      : checkCommand(territory, input.acceptanceCommand);
    const executionEconomy = measureExecutionEconomy([
      ...(compilation.plannerJobs ? [{ result: { metrics: compilation.selected.planningMeasure } }] : []),
      ...outcomes,
    ]);
    cycles.push({
      cycle,
      engineeringDesign: compilation.engineeringDesign,
      plan: compilation.selected.plan,
      plannerProcurement: compilation.selected.planningProcurement ?? null,
      executionGeometry,
      executionCircuit,
      executionEvents,
      blockedMissions,
      executionEconomy,
      plannerInferenceContacts: compilation.plannerJobs,
      admittedPlanCandidates: compilation.proposals.length,
      outcomes,
      acceptance,
    });
    if (proposalsAwaitingInduction.length) {
      return {
        id,
        objective: input.objective,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "awaiting-receiver-induction",
        cycles,
        acceptance,
      };
    }
    if (acceptance.passed) return { id, objective: input.objective, startedAt, finishedAt: new Date().toISOString(), status: "complete", cycles, acceptance };
    residue = JSON.stringify({ acceptance: acceptance.output, outcomes: outcomes.map((x) => ({ missionId: x.missionId, outcome: x.result.outcome })) });
  }
  return { id, objective: input.objective, startedAt, finishedAt: new Date().toISOString(), status: "unresolved", cycles, acceptance };
}
