import { randomUUID } from "node:crypto";
import { Message, Role } from "@a2a-js/sdk";
import { a2aResultParts, resumeRmnTask, sendRmnTask } from "@red-cup-engineering/a2a-rmn-task-client-service";
import { extractRmnPart, rmnPart } from "@red-cup-engineering/a2a-rmn-part-service";
import {
  ACTOR,
  SYNTHESIS_EFFECTS,
  exactOperation,
  operationBytes,
  operationFromBytes,
  record,
} from "./protocol.mjs";

function agentUrl(value) {
  const url = value ?? process.env.SOFTWARE_PROGRAM_SYNTHESIS_AGENT_CARD_URL;
  if (typeof url !== "string" || !url) throw new Error("SOFTWARE_PROGRAM_SYNTHESIS_AGENT_CARD_URL is required");
  return url;
}

function receipt(transport) {
  return Object.freeze({
    inputNi: transport.inputNi,
    outputNi: transport.outputNi,
    agentCard: transport.agentCard,
    authentication: transport.authentication,
  });
}

async function sendOperation(operation, { url, send, resume, resumeTaskId, stage, onTaskObservation, signal }) {
  const observe = onTaskObservation
    ? (task) => onTaskObservation({ stage, task })
    : undefined;
  if (typeof resumeTaskId === "string" && resumeTaskId) {
    const transport = await resume({ agentUrl: url, taskId: resumeTaskId, requireSignature: true, onTaskObservation: observe, signal });
    const output = extractRmnPart(a2aResultParts(transport.result));
    return { operation: operationFromBytes(output.bytes), receipt: receipt(transport) };
  }
  const message = Message.toJSON({
    messageId: randomUUID(), contextId: "", taskId: "", role: Role.ROLE_USER,
    parts: [rmnPart(operationBytes(operation))], metadata: {}, extensions: [], referenceTaskIds: [],
  });
  const transport = await send({ agentUrl: url, message, requireSignature: true, onTaskObservation: observe, signal });
  const output = extractRmnPart(a2aResultParts(transport.result));
  return { operation: operationFromBytes(output.bytes), receipt: receipt(transport) };
}

export async function synthesizeSoftwareProgram(program, {
  agentCardUrl,
  customer,
  resourceGrant,
  send = sendRmnTask,
  resume = resumeRmnTask,
  resumeTaskIds,
  onTaskObservation,
  signal,
} = {}) {
  if (typeof customer !== "string" || !customer.startsWith("urn:")) throw new Error("an exact synthesis customer URN is required");
  if (!exactOperation(program)) throw new Error("an exact content-addressed software program is required");
  if (!exactOperation(resourceGrant)) throw new Error("an exact synthesis ResourceGrant is required");
  const url = agentUrl(agentCardUrl);
  const request = record({ type: "SoftwareProgramSynthesisRequest", provider: ACTOR, program });
  const solicitation = record({ type: "SoftwareProgramSynthesisSolicitation", provider: ACTOR, customer, request });
  const offered = await sendOperation(solicitation, {
    url, send, resume, resumeTaskId: resumeTaskIds?.solicitation, stage: "solicitation", onTaskObservation, signal,
  });
  const offer = offered.operation;
  if (!exactOperation(offer)
    || offer.type !== "SoftwareProgramSynthesisOffer"
    || offer.provider !== ACTOR
    || offer.customer !== customer
    || offer.solicitation !== solicitation.id
    || offer.request !== request.id
    || offer.program !== program.id
    || offer.operation !== "invoke-software-program-synthesis"
    || JSON.stringify(offer.effects) !== JSON.stringify(SYNTHESIS_EFFECTS)) {
    throw new Error("software program provider returned a foreign offer");
  }
  const contract = record({ type: "SoftwareProgramSynthesisContract", provider: ACTOR, customer, offer, request, resourceGrant });
  const invoked = await sendOperation(contract, {
    url, send, resume, resumeTaskId: resumeTaskIds?.invocation, stage: "invocation", onTaskObservation, signal,
  });
  const response = invoked.operation;
  if (!exactOperation(response)
    || response.type !== "SoftwareProgramSynthesisContractResult"
    || response.provider !== ACTOR
    || response.customer !== customer
    || response.contract !== contract.id
    || response.offer !== offer.id
    || response.request !== request.id
    || response.program !== program.id) {
    throw new Error("software program provider returned a foreign contracted result");
  }
  return Object.freeze({
    ...response.result,
    synthesisProvider: ACTOR,
    synthesisOffer: offer,
    synthesisContract: contract,
    synthesisReceipt: Object.freeze({
      solicitation: offered.receipt,
      invocation: invoked.receipt,
    }),
  });
}
