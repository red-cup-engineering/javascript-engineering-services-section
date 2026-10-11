import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { relationalWitnessJournalDocument } from "@lenticule-science/witness-journal-rdf-projection-service/client";
import { semanticId } from "@red-cup-engineering/relation-model-notation-runtime";
import { compileProgram, deriveExecutionGeometry, runProgram, validatePlan } from "../src/program-runtime.mjs";

const ni = (character) => `ni:///sha-256;${character.repeat(42)}A`;
const missionResult = () => ({
  semanticId: ni("A"),
  executionProvider: "urn:test:mission-provider",
  executionReceipt: { inputNi: ni("B"), outputNi: ni("C"), agentCard: { name: "Test Mission Provider" }, authentication: { agentCardSignatureVerified: true, required: true } },
  outcome: {
    verified: true,
    integrated: false,
    inductionRequired: true,
    classification: "awaiting-receiver-induction",
    proposal: { type: "SoftwareMissionChangeProposal", proposalOnly: true, customerMutation: false, changes: [] },
  },
  metrics: {},
  processNode: { id: "process-node", status: "verified" },
});
const recordExecutionEvent = async ({ recordedAt, record }) => ({
  documentNi: semanticId(relationalWitnessJournalDocument({ type: "TestProgramEventRecord", recordedAt, record })),
  digest: record.graph,
  requestNi: ni("D"),
  responseNi: ni("E"),
});

test("plan validator refuses dependency cycles", () => {
  const plan = { strategy: "a cyclic bad plan", missions: [
    { id: "alpha", objective: "Perform the first bounded repair action.", dependsOn: ["beta"], acceptanceKey: "unit", focusPaths: [] },
    { id: "beta", objective: "Perform the second bounded repair action.", dependsOn: ["alpha"], acceptanceKey: "unit", focusPaths: [] },
  ] };
  assert.equal(validatePlan(plan, { acceptanceKeys: ["unit"] }).ok, false);
});

test("plan validator refuses identifiers that the provider schema cannot express with pattern", () => {
  const plan = { strategy: "one invalidly named mission should be refused", missions: [
    { id: "BAD_NAME", objective: "Perform one bounded repair with an invalid identifier.", dependsOn: [], acceptanceKey: "unit", focusPaths: [] },
  ] };
  assert.equal(validatePlan(plan, { acceptanceKeys: ["unit"] }).ok, false);
});

test("plan validator refuses a DAG whose writable focus cannot cover required artifacts", () => {
  const plan = { strategy: "one incomplete mission that cannot create the required test", missions: [
    { id: "implementation", objective: "Implement the bounded source change but omit its acceptance test.", dependsOn: [], acceptanceKey: "unit", focusPaths: ["src/agent-tools.mjs"] },
  ] };
  const result = validatePlan(plan, {
    acceptanceKeys: ["unit"],
    requiredFocusPaths: ["src/agent-tools.mjs", "test/readable-paths.test.mjs"],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /test\/readable-paths\.test\.mjs/);
});

test("plan validator refuses a DAG that omits a required intermediate acceptance gate", () => {
  const plan = { strategy: "one mission improperly skips the compatibility gate", missions: [
    { id: "final", objective: "Implement everything and run only the final acceptance gate.", dependsOn: [], acceptanceKey: "final", focusPaths: ["src/"] },
  ] };
  const result = validatePlan(plan, {
    acceptanceKeys: ["compatibility", "final"],
    requiredAcceptanceKeys: ["compatibility", "final"],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /compatibility/);
});

test("plan validator refuses source and regression test split across a required coupled mission", () => {
  const plan = { strategy: "split implementation and regression coverage into separate missions", missions: [
    { id: "implementation", objective: "Implement the source behavior while relying on existing weak checks.", dependsOn: [], acceptanceKey: "final", focusPaths: ["src/agent-tools.mjs"] },
    { id: "regression", objective: "Add the missing regression assertions after the source change lands.", dependsOn: ["implementation"], acceptanceKey: "final", focusPaths: ["test/readable-paths.test.mjs"] },
  ] };
  const result = validatePlan(plan, {
    acceptanceKeys: ["final"],
    requiredMissionBundles: [{ acceptanceKey: "final", focusPaths: ["src/agent-tools.mjs", "test/readable-paths.test.mjs"] }],
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /single mission jointly covers/);
});

test("plan validator accepts one mission that couples source and tests under the required gate", () => {
  const plan = { strategy: "change the implementation and its regression checks as one accepted unit", missions: [
    { id: "coupled-repair", objective: "Repair readable-path behavior together with comprehensive regression coverage.", dependsOn: [], acceptanceKey: "final", focusPaths: ["src", "test/readable-paths.test.mjs"] },
  ] };
  const result = validatePlan(plan, {
    acceptanceKeys: ["final"],
    requiredMissionBundles: [{ acceptanceKey: "final", focusPaths: ["src/agent-tools.mjs", "test/readable-paths.test.mjs"] }],
  });
  assert.equal(result.ok, true);
});

test("execution geometry folds causally-ready disjoint patches into one concurrent sheet", () => {
  const plan = { strategy: "two disjoint changes followed by one causally dependent integration", missions: [
    { id: "source", objective: "Implement the bounded source behavior in its admitted writable patch.", dependsOn: [], acceptanceKey: "unit", focusPaths: ["src/"] },
    { id: "docs", objective: "Update the lasting documentation in its separate admitted patch.", dependsOn: [], acceptanceKey: "unit", focusPaths: ["content/guide.md"] },
    { id: "integration", objective: "Confirm the combined result after both independent changes have landed.", dependsOn: ["source", "docs"], acceptanceKey: "unit", focusPaths: ["test/integration.test.mjs"] },
  ] };
  const geometry = deriveExecutionGeometry(plan);
  assert.deepEqual(geometry.sheets.map((sheet) => sheet.missionIds), [["source", "docs"], ["integration"]]);
  assert.deepEqual(geometry.causalEdges, [{ from: "source", to: "integration" }, { from: "docs", to: "integration" }]);
  assert.equal(geometry.measures.parallelOpportunitySlots, 1);
  assert.deepEqual(geometry.measures.parallelCompression, { numerator: 3, denominator: 2 });
});

test("execution geometry keeps overlapping and unbounded patches on separate sheets", () => {
  const plan = { strategy: "three ready changes whose spatial boundaries cannot all be combined", missions: [
    { id: "source-tree", objective: "Change the source tree through the admitted aggregate patch boundary.", dependsOn: [], acceptanceKey: "unit", focusPaths: ["src"] },
    { id: "source-file", objective: "Change one source file contained by the aggregate source boundary.", dependsOn: [], acceptanceKey: "unit", focusPaths: ["src/runtime.mjs"] },
    { id: "unknown", objective: "Perform a change with no bounded spatial patch declaration available.", dependsOn: [], acceptanceKey: "unit", focusPaths: [] },
  ] };
  const geometry = deriveExecutionGeometry(plan);
  assert.deepEqual(geometry.sheets.map((sheet) => sheet.missionIds), [["source-tree"], ["source-file"], ["unknown"]]);
  assert.equal(geometry.spatialOverlapEdges.length, 3);
});

test("plan validator refuses focus paths that escape the admitted territory", () => {
  const plan = { strategy: "one mission attempts to cross the customer territory boundary", missions: [
    { id: "escape", objective: "Attempt an invalid write beyond the admitted customer territory boundary.", dependsOn: [], acceptanceKey: "unit", focusPaths: ["../outside"] },
  ] };
  const result = validatePlan(plan, { acceptanceKeys: ["unit"] });
  assert.equal(result.ok, false);
  assert.match(result.reason, /invalid focus path/);
});

test("program compiles one typed plan and stops at the receiving settlement's induction boundary", async () => {
  const territory = mkdtempSync(join(tmpdir(), "union-program-test-"));
  let accepted = false, missionRuns = 0, missionInput;
  const plan = { strategy: "one bounded repair followed by declared acceptance", missions: [
    { id: "repair", objective: "Implement the bounded change required by the acceptance gate.", dependsOn: [], acceptanceKey: "unit", focusPaths: ["src/"] },
  ] };
  const dispatch = async (jobs) => jobs.map((job) => {
    assert.equal(job.routingProfile, "bounded");
    assert.equal(job.difficulty, 0.4);
    assert.equal(job.maxTokens, 700);
    assert.ok(JSON.stringify(job.messages).length < 12_000);
    assert.equal(job.outputContract.schema.properties.missions.items.properties.id.pattern, "^[a-z][a-z0-9-]{1,50}$");
    assert.equal(job.outputContract.schema.properties.missions.items.properties.dependsOn.items.pattern, "^[a-z][a-z0-9-]{1,50}$");
    assert.equal(job.outputContract.schema.properties.missions.items.properties.dependsOn.maxItems, 7);
    assert.match(job.messages[1].content, /one-mission plan therefore has dependsOn: \[\]/u);
    return {
      id: job.id,
      text: JSON.stringify(plan),
      endpoint: "mock-free-cloud",
      provider: "urn:test:planning-provider",
      attempts: [{}],
      cost: { obligations: [{ amount: 5, asset: "urn:test:credit", kind: "credit", unit: "test-unit" }] },
      procurement: { result: ni("F") },
    };
  });
  const runMission = async (input) => { missionRuns += 1; missionInput = input; accepted = true; return missionResult(); };
  const result = await runProgram({
    objective: "Make the program acceptance gate pass.", territory, verifyCommand: "true", acceptanceCommand: "accept",
    acceptanceCatalog: { unit: { description: "unit acceptance", command: "true", testVectors: [{ id: "unit-example", given: ["the fixture"], when: "the unit check runs", then: ["it passes"], forbidden: [] }] } }, plannerCount: 3,
    missionDifficulty: 0.4,
    missionMaxTokens: 900,
    missionConsiderationPolicy: { type: "test-policy" },
    missionRoutingProfile: "extended",
    missionExtendedRoutingRationale: "complete mission context exceeds the bounded carrier",
    missionRequireStrongContext: false,
  }, {
    dispatch,
    runMission,
    recordExecutionEvent,
    checkCommand: () => ({ passed: accepted, output: accepted ? "pass" : "fail" }),
  });
  assert.equal(result.status, "awaiting-receiver-induction");
  assert.equal(result.acceptance.passed, false);
  assert.equal(result.cycles[0].plannerInferenceContacts, 1);
  assert.equal(result.cycles[0].admittedPlanCandidates, 1);
  assert.deepEqual(result.cycles[0].plannerProcurement, { result: ni("F") });
  assert.equal(result.cycles[0].executionEconomy.purchasedInferenceLots, 1);
  assert.deepEqual(result.cycles[0].executionEconomy.consideration, [{ amount: 5, unit: "test-unit" }]);
  assert.equal(missionRuns, 1);
  assert.equal(Object.hasOwn(missionInput, "providerTimeoutMs"), false);
  assert.equal(Object.hasOwn(missionInput, "enforceProviderSchema"), false);
  assert.equal(Object.hasOwn(missionInput, "apply"), false);
  assert.equal(missionInput.difficulty, 0.4);
  assert.equal(missionInput.maxTokens, 900);
  assert.deepEqual(missionInput.considerationPolicy, { type: "test-policy" });
  assert.equal(missionInput.routingProfile, "extended");
  assert.equal(missionInput.extendedRoutingRationale, "complete mission context exceeds the bounded carrier");
  assert.equal(missionInput.requireStrongContext, false);
  assert.equal(missionInput.testVectors[0].id, "unit-example");
  assert.equal(result.cycles[0].executionEvents.at(-1).disposition, "awaiting-receiver-induction");
  assert.equal(result.cycles[0].executionCircuit.projection.circuit.startsWith("ni:///sha-256;"), true);
  assert.equal(result.cycles[0].executionCircuit.assay, null);
});

test("one canonical planning-cycle bound produces one unresolved execution cycle", async () => {
  const territory = mkdtempSync(join(tmpdir(), "union-program-cycle-bound-"));
  const plan = { strategy: "one bounded mission under one declared planning cycle", missions: [
    { id: "bounded-mission", objective: "Attempt the bounded change once.", dependsOn: [], acceptanceKey: "unit", focusPaths: ["src/"] },
  ] };
  const refusedMission = () => ({
    ...missionResult(),
    outcome: {
      verified: false,
      integrated: false,
      classification: "provider-refused",
      proposal: null,
    },
  });
  const result = await runProgram({
    objective: "Attempt the bounded program exactly once.",
    territory,
    verifyCommand: "false",
    acceptanceCommand: "false",
    acceptanceCatalog: { unit: { description: "unit acceptance", command: "false" } },
    missionPlan: plan,
    maxPlanningCycles: 1,
  }, {
    runMission: refusedMission,
    recordExecutionEvent,
    checkCommand: () => ({ passed: false, output: "not accepted" }),
  });
  assert.equal(result.status, "unresolved");
  assert.equal(result.cycles.length, 1);
});

test("one required bundle is placed directly without a planning contact", async () => {
  const territory = mkdtempSync(join(tmpdir(), "union-program-exact-placement-"));
  const compilation = await compileProgram({
    objective: "Repair the one source artifact under its one declared acceptance gate.",
    territory,
    acceptanceCatalog: { unit: { description: "unit acceptance", command: "true" } },
    requiredFocusPaths: ["src/runtime.mjs"],
    requiredAcceptanceKeys: ["unit"],
    requiredMissionBundles: [{ acceptanceKey: "unit", focusPaths: ["src/runtime.mjs"] }],
    enforcePlannerFocusWrites: true,
  }, { dispatch: async () => { throw new Error("fully specified topology must not purchase planning inference"); } });
  assert.equal(compilation.plannerJobs, 0);
  assert.deepEqual(compilation.selected.plan.missions, [{
    id: "bounded-mission",
    objective: "Repair the one source artifact under its one declared acceptance gate.",
    dependsOn: [],
    acceptanceKey: "unit",
    focusPaths: ["src/runtime.mjs"],
  }]);
});

test("spacelike root proposals run concurrently while causal successors await receiver induction", async () => {
  const territory = mkdtempSync(join(tmpdir(), "union-program-concurrency-test-"));
  let slowActive = false, fastRanWhileSlow = false, childRuns = 0, releaseSlow = () => {};
  const plan = { strategy: "one fast causal branch proceeds beside one slow spacelike mission", missions: [
    { id: "slow", objective: "Perform one slow independent change.", dependsOn: [], acceptanceKey: "unit", focusPaths: ["slow/"] },
    { id: "fast", objective: "Perform the fast parent change.", dependsOn: [], acceptanceKey: "unit", focusPaths: ["fast/"] },
    { id: "child", objective: "Perform the child after only its fast parent settles.", dependsOn: ["fast"], acceptanceKey: "unit", focusPaths: ["child/"] },
  ] };
  const runMission = async ({ id: missionId }) => {
    if (missionId.endsWith(":slow")) {
      slowActive = true;
      await new Promise((resolveDelay) => {
        const watchdog = setTimeout(resolveDelay, 1000);
        releaseSlow = () => { clearTimeout(watchdog); resolveDelay(); };
      });
      slowActive = false;
    } else if (missionId.endsWith(":fast")) {
      fastRanWhileSlow = slowActive;
      releaseSlow();
    } else if (missionId.endsWith(":child")) {
      childRuns += 1;
    }
    return missionResult();
  };
  const result = await runProgram({
    objective: "Advance each causally ready branch without waiting for unrelated slow work.", territory, verifyCommand: "true", acceptanceCommand: "accept",
    acceptanceCatalog: { unit: { description: "unit acceptance", command: "true" } }, plannerCount: 2,
    missionPlan: plan,
    enforcePlannerFocusWrites: true,
  }, {
    dispatch: async () => { throw new Error("supplied topology must not purchase planning inference"); },
    runMission,
    recordExecutionEvent,
    checkCommand: () => ({ passed: false, output: "receiver induction has not occurred" }),
  });
  assert.equal(result.status, "awaiting-receiver-induction");
  assert.equal(result.cycles[0].plannerInferenceContacts, 0);
  assert.equal(fastRanWhileSlow, true);
  assert.equal(childRuns, 0);
  assert.deepEqual(result.cycles[0].executionGeometry.sheets.map((sheet) => sheet.missionIds), [["slow", "fast"], ["child"]]);
  const settlements = result.cycles[0].executionEvents.filter(({ phase }) => phase === "settlement");
  assert.deepEqual(settlements.map(({ mission }) => mission), ["fast", "slow", "child"]);
  assert.equal(settlements.find(({ mission }) => mission === "child").disposition, "causally-blocked");
  assert.equal(result.cycles[0].blockedMissions[0].missionId, "child");
  assert.equal(result.cycles[0].executionGeometry.spatialSeparationAdmitted, true);
});

test("program serializes disjoint declarations when focus bounds are not enforced", async () => {
  const territory = mkdtempSync(join(tmpdir(), "union-program-serial-test-"));
  let active = 0, maximumActive = 0;
  const plan = { strategy: "two declared patches remain untrusted without write confinement", missions: [
    { id: "source", objective: "Implement one declared source change without an enforced writable boundary.", dependsOn: [], acceptanceKey: "unit", focusPaths: ["src/"] },
    { id: "tests", objective: "Implement one declared test change without an enforced writable boundary.", dependsOn: [], acceptanceKey: "unit", focusPaths: ["test/"] },
  ] };
  const runMission = async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolveImmediate) => setImmediate(resolveImmediate));
    active -= 1;
    return missionResult();
  };
  const result = await runProgram({
    objective: "Complete both declarations without admitting spatial separation.", territory, verifyCommand: "true", acceptanceCommand: "accept",
    acceptanceCatalog: { unit: { description: "unit acceptance", command: "true" } }, plannerCount: 2, missionPlan: plan,
  }, {
    dispatch: async () => { throw new Error("supplied topology must not purchase planning inference"); },
    runMission,
    recordExecutionEvent,
    checkCommand: () => ({ passed: false, output: "receiver induction has not occurred" }),
  });
  assert.equal(result.status, "awaiting-receiver-induction");
  assert.equal(maximumActive, 1);
  assert.deepEqual(result.cycles[0].executionGeometry.sheets.map((sheet) => sheet.missionIds), [["source"], ["tests"]]);
  assert.equal(result.cycles[0].executionGeometry.spatialSeparationAdmitted, false);
});
