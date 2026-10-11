import assert from "node:assert/strict";
import test from "node:test";
import { Message, Role } from "@a2a-js/sdk";
import { extractRmnPart, rmnPart } from "@red-cup-engineering/a2a-rmn-part-service";
import {
  ACTOR,
  SYNTHESIS_EFFECTS,
  executeA2aMessage,
  executeOperation,
  operationBytes,
  operationFromBytes,
  record,
} from "../src/a2a-executor.mjs";
import { synthesizeSoftwareProgram } from "../src/client.mjs";

const CUSTOMER = "urn:ame:synthesis-customer";
const program = record({ type: "SoftwareProgram", objective: "bounded program", territory: "/tmp/territory", acceptanceCatalog: { unit: { command: "node --test" } } });

function request() { return record({ type: "SoftwareProgramSynthesisRequest", provider: ACTOR, program }); }
function solicitation(value = request()) { return record({ type: "SoftwareProgramSynthesisSolicitation", provider: ACTOR, customer: CUSTOMER, request: value }); }
function grant(effects = SYNTHESIS_EFFECTS) {
  return record({ type: "ResourceGrant", issuer: CUSTOMER, holder: ACTOR, program: program.id, effects });
}
function message(operation) {
  return Message.toJSON({ messageId: "00000000-0000-4000-8000-000000000001", contextId: "", taskId: "", role: Role.ROLE_USER, parts: [rmnPart(operationBytes(operation))], metadata: {}, extensions: [], referenceTaskIds: [] });
}
function responseOperation(value) {
  return operationFromBytes(extractRmnPart(Message.fromJSON(value).parts).bytes);
}

test("signed A2A/RMN solicitation authors the offer without executing the program", async () => {
  let executions = 0;
  const input = solicitation();
  const output = await executeA2aMessage(message(input), { runProgram: async () => { executions += 1; } });
  const offer = responseOperation(output);
  assert.equal(offer.type, "SoftwareProgramSynthesisOffer");
  assert.equal(offer.solicitation, input.id);
  assert.equal(offer.request, input.request.id);
  assert.equal(offer.program, program.id);
  assert.deepEqual(offer.effects, SYNTHESIS_EFFECTS);
  assert.equal(executions, 0);
});

test("only the exact offered and resource-covered contract executes the program", async () => {
  const input = solicitation();
  const offer = await executeOperation(input);
  const contract = record({ type: "SoftwareProgramSynthesisContract", provider: ACTOR, customer: CUSTOMER, offer, request: input.request, resourceGrant: grant() });
  let executions = 0;
  const output = await executeA2aMessage(message(contract), { runProgram: async (value, execution) => {
    executions += 1;
    assert.equal(execution.signal instanceof AbortSignal, true);
    return { id: value.id, status: "complete", cycles: [] };
  } });
  const result = responseOperation(output);
  assert.equal(executions, 1);
  assert.equal(result.type, "SoftwareProgramSynthesisContractResult");
  assert.equal(result.contract, contract.id);
  assert.equal(result.offer, offer.id);
  assert.equal(result.request, input.request.id);
  assert.equal(result.result.status, "complete");
});

test("uncontracted requests and insufficient grants refuse before execution", async () => {
  let executions = 0;
  const runProgram = async () => { executions += 1; };
  await assert.rejects(executeOperation(request(), { runProgram }), /only synthesis solicitation or contracted synthesis invocation/u);
  const overbroad = record({ type: "SoftwareProgramSynthesisSolicitation", provider: ACTOR, customer: CUSTOMER, request: request(), ambientAuthority: true });
  await assert.rejects(executeOperation(overbroad, { runProgram }), /exact provider-addressed/u);
  const input = solicitation();
  const offer = await executeOperation(input);
  const contract = record({ type: "SoftwareProgramSynthesisContract", provider: ACTOR, customer: CUSTOMER, offer, request: input.request, resourceGrant: grant(SYNTHESIS_EFFECTS.slice(0, 2)) });
  await assert.rejects(executeOperation(contract, { runProgram }), /resource grant does not cover/u);
  assert.equal(executions, 0);
});

test("the client performs two signed A2A/RMN contacts and returns both transport receipts", async () => {
  let contacts = 0;
  const observedStages = [];
  const send = async ({ message: source, requireSignature, onTaskObservation }) => {
    assert.equal(requireSignature, true);
    contacts += 1;
    await onTaskObservation({ id: `provider-task-${contacts}`, status: { state: "working" } });
    const input = operationFromBytes(extractRmnPart(Message.fromJSON(source).parts).bytes);
    const output = await executeA2aMessage(source, { runProgram: async () => ({ status: "complete" }) });
    const response = responseOperation(output);
    return {
      result: Message.fromJSON(output),
      inputNi: input.id,
      outputNi: response.id,
      agentCard: { name: "program die", signatures: [{ protected: "signed" }] },
      authentication: { required: true, agentCardSignatureVerified: true },
    };
  };
  const result = await synthesizeSoftwareProgram(program, {
    agentCardUrl: "https://program.example/.well-known/agent-card.json",
    customer: CUSTOMER,
    resourceGrant: grant(),
    send,
    onTaskObservation: ({ stage, task }) => observedStages.push({ stage, task: task.id }),
  });
  assert.equal(contacts, 2);
  assert.deepEqual(observedStages, [
    { stage: "solicitation", task: "provider-task-1" },
    { stage: "invocation", task: "provider-task-2" },
  ]);
  assert.equal(result.status, "complete");
  assert.equal(result.synthesisContract.resourceGrant.issuer, CUSTOMER);
  assert.equal(result.synthesisReceipt.solicitation.authentication.agentCardSignatureVerified, true);
  assert.equal(result.synthesisReceipt.invocation.authentication.agentCardSignatureVerified, true);
});

test("the client resumes both exact provider-owned tasks without executing them again", async () => {
  const grantRecord = grant();
  const requestRecord = record({ type: "SoftwareProgramSynthesisRequest", provider: ACTOR, program });
  const solicitationRecord = record({ type: "SoftwareProgramSynthesisSolicitation", provider: ACTOR, customer: CUSTOMER, request: requestRecord });
  const offerRecord = await executeOperation(solicitationRecord);
  const contractRecord = record({ type: "SoftwareProgramSynthesisContract", provider: ACTOR, customer: CUSTOMER, offer: offerRecord, request: requestRecord, resourceGrant: grantRecord });
  const responseRecord = await executeOperation(contractRecord, { runProgram: async () => ({ status: "complete" }) });
  const resumed = new Map([
    ["solicitation-task", offerRecord],
    ["invocation-task", responseRecord],
  ]);
  let sends = 0;
  const result = await synthesizeSoftwareProgram(program, {
    agentCardUrl: "https://program.example/.well-known/agent-card.json",
    customer: CUSTOMER,
    resourceGrant: grantRecord,
    send: async () => { sends += 1; throw new Error("resumption must not send new work"); },
    resume: async ({ taskId, requireSignature }) => {
      assert.equal(requireSignature, true);
      const response = resumed.get(taskId);
      return {
        result: Message.fromJSON(Message.toJSON({
          messageId: `${taskId}-response`, contextId: "", taskId: "", role: Role.ROLE_AGENT,
          parts: [rmnPart(operationBytes(response))], metadata: {}, extensions: [], referenceTaskIds: [],
        })),
        inputNi: taskId === "solicitation-task" ? solicitationRecord.id : contractRecord.id,
        outputNi: response.id,
        agentCard: { name: "program die", signatures: [{ protected: "signed" }] },
        authentication: { required: true, agentCardSignatureVerified: true },
      };
    },
    resumeTaskIds: { solicitation: "solicitation-task", invocation: "invocation-task" },
  });
  assert.equal(sends, 0);
  assert.equal(result.status, "complete");
  assert.equal(result.synthesisReceipt.solicitation.outputNi, offerRecord.id);
  assert.equal(result.synthesisReceipt.invocation.outputNi, responseRecord.id);
});
