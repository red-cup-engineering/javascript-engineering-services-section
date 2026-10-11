import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requestHierarchicalCircuitEquivalence } from "@lenticule-science/hierarchical-circuit-equivalence-assay/client";
import { encodeRelationalValue } from "@red-cup-engineering/relation-model-notation-runtime/relational-value";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
import {
  CIRCUIT_ASSEMBLY_PROFILE,
  HIERARCHICAL_CIRCUIT_PROFILE,
  circuitAssemblyId,
  hierarchicalCircuitId,
  normalizeHierarchicalCircuit,
  verifyCircuitAssembly,
} from "@red-cup-engineering/relation-model-notation-runtime/hierarchical-circuit";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const ACCOUNT_BINDING = resolve(ROOT, "content/evm/accounts/eip155-31337.json");
const PROFILE = "org.emsenn.software-program-synthesis.execution-manifold-circuit.v1";
const FOUR = Object.freeze([
  Object.freeze({ positiveEvidence: false, negativeEvidence: false }),
  Object.freeze({ positiveEvidence: true, negativeEvidence: false }),
  Object.freeze({ positiveEvidence: false, negativeEvidence: true }),
  Object.freeze({ positiveEvidence: true, negativeEvidence: true }),
]);
const PREDICATE = identityOf({ register: "software-program-synthesis", label: "admits completed causal work" });
const CARRIER = identityOf({ register: "software-program-synthesis", label: "FOUR execution evidence" });

function fail(message) { throw new Error(`execution manifold circuit refusal: ${message}`); }
function identityOf(value) {
  return identifyJsonSemanticContent({
    objectKind: "software-program-synthesis.execution-manifold-coordinate",
    value,
    witnessRoot: EMPTY_WITNESS_ROOT,
  }).token;
}
function exactKeys(value, keys) {
  return value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000");
}
function endpoint(instance, port) { return { instance, port }; }
function net(name, driver, sinks) { return { name, driver, sinks, mode: "tensor", chain: null, contract: null }; }
function port(name, direction) { return { name, direction, predicate: PREDICATE, carrier: CARRIER, mode: "tensor" }; }
function identityBehavior(input = "enter", output = "leave") {
  return {
    factors: [{
      inputs: [input],
      outputs: [output],
      rows: FOUR.map((value) => ({ input: [value], output: [value] })),
    }],
  };
}
function conjunctionBehavior() {
  return {
    factors: [{
      inputs: ["left", "right"],
      outputs: ["leave"],
      rows: FOUR.flatMap((left) => FOUR.map((right) => ({
        input: [left, right],
        output: [{
          positiveEvidence: left.positiveEvidence && right.positiveEvidence,
          negativeEvidence: left.negativeEvidence || right.negativeEvidence,
        }],
      }))),
    }],
  };
}
function membrane(profile) {
  return { account: profile.account, authority: profile.authority, custody: profile.custody, territory: profile.territory };
}
function account() {
  const binding = JSON.parse(readFileSync(ACCOUNT_BINDING, "utf8"));
  const value = binding?.account?.caip10;
  if (typeof value !== "string" || !value) fail("software program synthesis has no sovereign account binding");
  return value;
}

export function normalizeExecutionGeometry(source) {
  if (!exactKeys(source, ["causalEdges", "foldRule", "kind", "measures", "sheets", "spatialOverlapEdges", "spatialSeparationAdmitted", "vertices"])
      || source.kind !== "program-execution-geometry" || !Array.isArray(source.vertices) || !Array.isArray(source.causalEdges)
      || !Array.isArray(source.spatialOverlapEdges) || !Array.isArray(source.sheets)) fail("geometry has an unknown, absent, or legacy field");
  if (source.foldRule !== "causally-ready missions in plan order, folded into pairwise spatially-disjoint sheets" || typeof source.spatialSeparationAdmitted !== "boolean") fail("geometry declares an unknown fold law");
  const vertices = source.vertices.map((vertex) => {
    if (!exactKeys(vertex, ["missionId", "patches", "unbounded"]) || !Array.isArray(vertex.patches) || typeof vertex.unbounded !== "boolean") fail("mission vertex is malformed");
    if (vertex.patches.some((patch) => typeof patch !== "string" || !patch) || new Set(vertex.patches).size !== vertex.patches.length || JSON.stringify(vertex.patches) !== JSON.stringify([...vertex.patches].sort())) fail("mission patches must be a unique sorted sequence");
    return vertex;
  });
  const missionIds = vertices.map((vertex) => vertex.missionId);
  if (missionIds.some((id) => typeof id !== "string" || !id) || new Set(missionIds).size !== missionIds.length || missionIds.length === 0) fail("mission vertices must be a nonempty unique sequence");
  const known = new Set(missionIds), sheetOf = new Map(), sheets = source.sheets.map((sheet, index) => {
    if (!exactKeys(sheet, ["index", "missionIds"]) || sheet.index !== index || !Array.isArray(sheet.missionIds) || sheet.missionIds.length === 0) fail("sheets must be a nonempty contiguous ordered sequence");
    for (const missionId of sheet.missionIds) {
      if (!known.has(missionId) || sheetOf.has(missionId)) fail("sheets must place every known mission at most once");
      sheetOf.set(missionId, index);
    }
    return { index, missionIds: [...sheet.missionIds] };
  });
  if (sheetOf.size !== missionIds.length) fail("sheets must place every mission exactly once");
  const expectedOverlapEdges = [];
  for (let leftIndex = 0; leftIndex < vertices.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < vertices.length; rightIndex += 1) {
    const left = vertices[leftIndex], right = vertices[rightIndex], boundaries = [];
    if (left.unbounded || right.unbounded) boundaries.push("*");
    else for (const leftPath of left.patches) for (const rightPath of right.patches) {
      if (leftPath === "." || rightPath === "." || leftPath === rightPath || leftPath.startsWith(`${rightPath}/`) || rightPath.startsWith(`${leftPath}/`)) boundaries.push(`${leftPath}::${rightPath}`);
    }
    if (boundaries.length) expectedOverlapEdges.push({ left: left.missionId, right: right.missionId, boundaries });
  }
  if (JSON.stringify(source.spatialOverlapEdges) !== JSON.stringify(expectedOverlapEdges)) fail("spatial overlap incidence does not equal the patch cover");
  const overlapPairs = new Set();
  for (const edge of source.spatialOverlapEdges) {
    if (!exactKeys(edge, ["boundaries", "left", "right"])) fail("spatial overlap incidence is malformed");
    if (!known.has(edge?.left) || !known.has(edge?.right) || edge.left === edge.right || !Array.isArray(edge.boundaries) || edge.boundaries.length === 0) fail("spatial overlap incidence is malformed");
    if (sheetOf.get(edge.left) === sheetOf.get(edge.right)) fail("spatially overlapping missions inhabit one execution sheet");
    overlapPairs.add([edge.left, edge.right].sort().join("\u0000"));
  }
  const causalPairs = new Set();
  for (const edge of source.causalEdges) {
    if (!exactKeys(edge, ["from", "to"])) fail("causal incidence is malformed");
    if (!known.has(edge?.from) || !known.has(edge?.to) || edge.from === edge.to) fail("causal incidence is malformed");
    if (sheetOf.get(edge.from) >= sheetOf.get(edge.to)) fail("causal incidence does not point forward in sheet time");
    const key = `${edge.from}\u0000${edge.to}`;
    if (causalPairs.has(key)) fail("causal incidence is repeated");
    causalPairs.add(key);
  }
  for (const sheet of sheets) for (let left = 0; left < sheet.missionIds.length; left += 1) {
    for (let right = left + 1; right < sheet.missionIds.length; right += 1) {
      if (overlapPairs.has([sheet.missionIds[left], sheet.missionIds[right]].sort().join("\u0000"))) fail("one execution sheet contains an overlap edge");
    }
  }
  const position = new Map(missionIds.map((missionId, index) => [missionId, index]));
  const dependencies = new Map(missionIds.map((missionId) => [missionId, new Set()]));
  for (const edge of source.causalEdges) dependencies.get(edge.to).add(edge.from);
  const unscheduled = new Set(missionIds), expectedSheets = [];
  while (unscheduled.size) {
    const ready = [...unscheduled].filter((missionId) => dependencies.get(missionId).size === 0).sort((left, right) => position.get(left) - position.get(right));
    if (!ready.length) fail("causal incidence is cyclic");
    const selected = [];
    for (const missionId of ready) if (!selected.some((other) => overlapPairs.has([missionId, other].sort().join("\u0000")))) selected.push(missionId);
    expectedSheets.push({ index: expectedSheets.length, missionIds: selected });
    for (const missionId of selected) {
      unscheduled.delete(missionId);
      for (const remaining of dependencies.values()) remaining.delete(missionId);
    }
  }
  if (JSON.stringify(sheets) !== JSON.stringify(expectedSheets)) fail("sheets do not equal the deterministic causal-spatial fold");
  const expected = {
    serialMissionSlots: missionIds.length,
    executionSheetCount: sheets.length,
    maximumConcurrentMissions: Math.max(...sheets.map(({ missionIds: ids }) => ids.length)),
    parallelOpportunitySlots: missionIds.length - sheets.length,
    parallelCompression: { numerator: missionIds.length, denominator: sheets.length },
  };
  if (!exactKeys(source.measures, Object.keys(expected)) || !exactKeys(source.measures.parallelCompression, ["denominator", "numerator"])
      || source.measures.serialMissionSlots !== expected.serialMissionSlots
      || source.measures.executionSheetCount !== expected.executionSheetCount
      || source.measures.maximumConcurrentMissions !== expected.maximumConcurrentMissions
      || source.measures.parallelOpportunitySlots !== expected.parallelOpportunitySlots
      || source.measures.parallelCompression.numerator !== expected.parallelCompression.numerator
      || source.measures.parallelCompression.denominator !== expected.parallelCompression.denominator) fail("resource measures do not equal the admitted sheet partition");
  return source;
}

function missionLeaf(vertex) {
  return normalizeHierarchicalCircuit({
    profile: HIERARCHICAL_CIRCUIT_PROFILE,
    law: identityOf({ kind: "SoftwareProgramMissionDieLaw", mission: vertex }),
    ports: [port("enter", "input"), port("leave", "output")],
    instances: [], nets: [], behavior: identityBehavior(),
  });
}

function joinLeaf() {
  return normalizeHierarchicalCircuit({
    profile: HIERARCHICAL_CIRCUIT_PROFILE,
    law: identityOf({ kind: "SoftwareProgramSheetJoinLaw", operation: "FOUR conjunction" }),
    ports: [port("left", "input"), port("right", "input"), port("leave", "output")],
    instances: [], nets: [], behavior: conjunctionBehavior(),
  });
}

export function projectExecutionGeometryCircuit(source, { programId, territory, producer = account() } = {}) {
  const geometry = normalizeExecutionGeometry(source);
  if (typeof programId !== "string" || !programId || typeof territory !== "string" || !territory) fail("programId and territory are required projection coordinates");
  const authority = identityOf({ kind: "SoftwareProgramExecutionAuthority", programId });
  const custody = identityOf({ kind: "SoftwareProgramExecutionCustody", producer });
  const territoryId = identityOf({ kind: "SoftwareProgramExecutionTerritory", territory });
  const profile = { account: producer, authority, custody, territory: territoryId };
  const vertexById = new Map(geometry.vertices.map((vertex) => [vertex.missionId, vertex]));
  const join = joinLeaf(), joinId = hierarchicalCircuitId(join), components = new Map();
  const instances = [], nets = [], placements = [{ address: [], membrane: membrane(profile) }], missionAddresses = {};
  let incoming = endpoint(null, "enter"), joinNumber = 0;
  for (const sheet of geometry.sheets) {
    const drivers = [];
    const missionSinks = [];
    for (const missionId of sheet.missionIds) {
      const component = missionLeaf(vertexById.get(missionId)), componentId = hierarchicalCircuitId(component);
      components.set(componentId, component);
      const name = `mission-${sheet.index}-${drivers.length}`;
      instances.push({ name, component: componentId });
      missionSinks.push(endpoint(name, "enter"));
      drivers.push(endpoint(name, "leave"));
      missionAddresses[missionId] = [name];
      placements.push({ address: [name], membrane: membrane(profile) });
    }
    nets.push(net(`sheet-${sheet.index}-admission`, incoming, missionSinks));
    let frontier = drivers;
    while (frontier.length > 1) {
      const next = [];
      for (let index = 0; index < frontier.length; index += 2) {
        if (index + 1 === frontier.length) { next.push(frontier[index]); continue; }
        const name = `join-${joinNumber++}`;
        components.set(joinId, join);
        instances.push({ name, component: joinId });
        nets.push(net(`${name}-left`, frontier[index], [endpoint(name, "left")]));
        nets.push(net(`${name}-right`, frontier[index + 1], [endpoint(name, "right")]));
        placements.push({ address: [name], membrane: membrane(profile) });
        next.push(endpoint(name, "leave"));
      }
      frontier = next;
    }
    incoming = frontier[0];
  }
  nets.push(net("program-completion", incoming, [endpoint(null, "leave")]));
  const circuit = normalizeHierarchicalCircuit({
    profile: HIERARCHICAL_CIRCUIT_PROFILE,
    law: identityOf({ kind: "SoftwareProgramExecutionManifoldLaw", profile: PROFILE, programId, territory, geometry }),
    ports: [port("enter", "input"), port("leave", "output")],
    instances, nets, behavior: identityBehavior(),
  });
  const circuitId = hierarchicalCircuitId(circuit);
  const assembly = { profile: CIRCUIT_ASSEMBLY_PROFILE, circuit: circuitId, placements };
  const library = [...components.values()], verified = verifyCircuitAssembly(assembly, circuit, library);
  const projection = {
    kind: "SoftwareProgramExecutionManifoldCircuitProjection",
    profile: PROFILE,
    producer,
    programId,
    geometry: identityOf(geometry),
    circuit: circuitId,
    assembly: circuitAssemblyId(verified.assembly),
    missionAddresses,
  };
  return { projection, projectionId: identityOf(projection), circuit, components: library, assembly: verified.assembly };
}

export async function assayExecutionGeometryCircuit(source, options = {}) {
  const projected = projectExecutionGeometryCircuit(source, options);
  const agentUrl = options.agentUrl ?? process.env.UNION_HIERARCHICAL_CIRCUIT_EQUIVALENCE_AGENT_CARD_URL;
  if (!agentUrl) fail("an explicit hierarchical-circuit equivalence Agent Card URL is required");
  const result = await (options.requestAssay ?? requestHierarchicalCircuitEquivalence)({
    agentUrl,
    circuit: projected.circuit,
    components: projected.components,
    assembly: projected.assembly,
    signal: options.signal,
  });
  if (result?.receipt?.equivalent !== true || result.receipt.circuit !== projected.projection.circuit || result.receipt.assembly !== projected.projection.assembly) fail("typed equivalence judgment did not bind the exact projected family and assembly");
  return { ...projected, assay: { provider: result.receipt.provider, receipt: result.receiptNi, equivalent: true } };
}

export function measureExecutionEconomy(outcomes) {
  if (!Array.isArray(outcomes)) fail("outcomes must be a sequence");
  const charges = [], providers = new Set();
  let directInteractiveModelCalls = 0;
  for (const outcome of outcomes) {
    const result = outcome?.result ?? outcome;
    const phases = Array.isArray(result?.phases) && result.phases.length ? result.phases.map(({ result: phase }) => phase) : [result];
    for (const phase of phases) {
      directInteractiveModelCalls += Number(phase?.metrics?.directInteractiveModelCalls) || 0;
      for (const charge of phase?.metrics?.expectedConsideration ?? []) {
        if (!Number.isSafeInteger(charge?.amount) || typeof charge?.unit !== "string") fail("settled consideration is malformed");
        charges.push({ provider: charge.provider ?? null, amount: charge.amount, unit: charge.unit });
        if (charge.provider) providers.add(charge.provider);
      }
    }
  }
  const totals = new Map();
  for (const charge of charges) totals.set(charge.unit, (totals.get(charge.unit) ?? 0) + charge.amount);
  return {
    kind: "SoftwareProgramExecutionEconomicMeasure",
    purchasedInferenceLots: charges.length,
    providers: [...providers].sort(),
    consideration: [...totals].sort(([left], [right]) => left.localeCompare(right)).map(([unit, amount]) => ({ amount, unit })),
    directInteractiveModelCalls,
  };
}
