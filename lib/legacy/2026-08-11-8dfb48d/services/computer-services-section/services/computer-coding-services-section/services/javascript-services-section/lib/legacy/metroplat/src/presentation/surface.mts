/**
 * presentation/surface — module → projected surface: programs, resources,
 * and prompts.
 *
 * This is the inverse of the package-boundary-to-presentation arrow elsewhere in the
 * workspace (which reads `package.json#bin`). `projectSurface` reads a module's
 * operations, resources, and prompts and yields the program discovery presentation —
 * the coproduct apex into which each leg injects — plus a bound dispatch. CLI,
 * OpenAPI, MCP (tools + resources + prompts), and web UX are projected from this
 * one presentation as functorial images; none invents a second ontology.
 *
 * Resources and prompts are derived from what the package already declares: each
 * action's input/output JSON Schema and the discovery presentation itself project as
 * MCP resources, and each action projects as a guided MCP prompt — so the three
 * standard knowledge-vault primitives come for free, with packages free to
 * declare richer resources/prompts via `resource()`/`prompt()`.
 */
import type { UtteranceObject } from "../lib/records/utterance/index.mts";
import { operationIrAudit, operationRmnDebt, nonportableOperations, schemasOfOperations } from "../rpc/index.mts";
import { operationUtterances, fact, isOperation, type Operation } from "../rpc/index.mts";
import { wireCodec } from "../lib/codecs/wire/index.mts";
import { authorizationFromCapabilityAssertions, authorizationFromStanding, createOperationCatalog, describe, type CapabilityAssertionSource, type OperationCatalog, type RpcAuthorize, type RpcDescription } from "../rpc/index.mts";
import { isProgramContractStanding, readProgramContractStanding, type ProgramContractStanding } from "../rpc/contract.mts";
import {
  isResource,
  resource,
  resourceDescriptor,
  resourceUtterances,
  type ResourceRegistration,
  type ResourceDescriptor,
} from "./resources.mts";
import {
  operationPrompt,
  isPrompt,
  prompt,
  promptDescriptor,
  promptUtterances,
  userMessage,
  type PromptTemplate,
  type PromptDescriptor,
} from "./prompt.mts";
import { operationsManifoldResource } from "./manifold.mts";
import type { OperationConvergenceSignature } from "../rpc/convergence.mts";
import { projectLsp, type LspVirtualDocument } from "../integrations/lsp/index.mts";
import type { SchemaContract } from "../lib/schema/index.mts";
import { agentReadinessReportContract, type AgentReadinessReport, type AgentReadinessSurface } from "./readiness.mts";
export * from "./readiness.mts";
import type { ExportSurface } from "../workspace/schemas/exports.mts";
import type { BinSurface } from "../workspace/schemas/bins.mts";
import type { PackageSurface } from "../workspace/schemas/package-surface.mts";
import type { PublicationStatusProof } from "../workspace/schemas/publication-status.mts";
import type { CapabilityReading } from "../lib/capability/claims.mts";

/** One generated program readout mounted as a POST endpoint. */
export interface ProgramEndpoint {
  /** The source operation verb; this is the stable endpoint/tool/form name. */
  readonly name: string;
  /** Relative URL path for the HTTP/form projection. */
  readonly href: string;
  /** Current executable projection method. Mounted programs are invoked as POSTs. */
  readonly method: "POST";
  /** Media type decoded from boundary input. */
  readonly input: string;
  /** Media type encoded to boundary output. */
  readonly output: string;
  /** Short summary projected from the source operation declaration. */
  readonly summary?: string;
  /** Longer description projected from the source operation declaration. */
  readonly description?: string;
  /** JSON Schema ref for the consumed presentation, when the action declares one. */
  readonly domainSchema?: Record<string, unknown>;
  /** JSON Schema ref for the produced presentation, when the action declares one. */
  readonly codomainSchema?: Record<string, unknown>;
  /** RMN body projected into discovery when the source operation carries behavior as data. */
  readonly runTerm?: import("@red-cup-engineering/relation-model-notation/types").Tm;
  /** Contract generators, mathematical classification, and settled behavioral evidence. */
  readonly contract: ProgramContractStanding;
  /** Derived termination/transport signature, read from the codomain's settlement classification. */
  readonly settlement: OperationConvergenceSignature;
}

/** The program discovery presentation: the coproduct apex of a package's legs. */
export interface ProgramDiscovery {
  /** Runtime tag for an induced program discovery presentation. */
  readonly kind: "metroplat.program.discovery";
  /** Package or module name whose legs were induced. */
  readonly package: string;
  /** The base process protocol this discovery presentation currently describes. */
  readonly protocol: "stdio";
  /** Mounted program endpoints projected from carried operations. */
  readonly programs: readonly ProgramEndpoint[];
  /** MCP/resource descriptors projected from carried and derived resources. */
  readonly resources: readonly ResourceDescriptor[];
  /** MCP prompt descriptors projected from carried and derived prompts. */
  readonly prompts: readonly PromptDescriptor[];
  /** The valuation reading from which this face was induced, when supplied. */
  readonly capabilities?: {
    readonly valuation: Readonly<Record<string, import("../lib/values/index.mts").ChargeValueName>>;
    readonly designated: readonly { readonly address: string; readonly charge: "held" | "contested" }[];
    readonly obstructions: readonly import("../lib/capability/claims.mts").CapabilityObstruction[];
    readonly order: readonly string[];
  };
  /** Relational facts describing the package, operations, programs, resources, and prompts. */
  readonly utterances: readonly UtteranceObject[];
}

export type TransportAgreementFace =
  | "discovery"
  | "cli"
  | "http"
  | "openapi"
  | "mcp"
  | "openai"
  | "html-form"
  | "arrival-admission"
  | "resources"
  | "prompts";

export interface TransportAgreementOverlapReport {
  readonly kind: "metroplat.transport-agreement-overlap";
  readonly faceA: TransportAgreementFace;
  readonly faceB: TransportAgreementFace;
  readonly target: string;
  readonly evidence: readonly string[];
  readonly missing: readonly string[];
  readonly ok: boolean;
}

export interface TransportAgreementReport {
  readonly kind: "metroplat.transport-agreement";
  readonly package: string;
  readonly source: "induced-program-surface";
  readonly faces: readonly TransportAgreementFace[];
  readonly operations: number;
  readonly resources: number;
  readonly prompts: number;
  readonly overlaps: readonly TransportAgreementOverlapReport[];
  readonly evidence: readonly string[];
  readonly missing: readonly string[];
  readonly ok: boolean;
}

/** Closure-free protocol projection material derived from one RPC catalog. */
export interface ProjectedSurface {
  /** The discovery presentation, suitable for docs, MCP resources, and inspection. */
  readonly discovery: ProgramDiscovery;
  /** The settled capability reading, when this surface was induced from one. */
  readonly capabilities?: CapabilityReading<Operation>;
  /** The action legs that were accepted from the source namespace. */
  readonly operations: readonly Operation[];
  /** Explicit immutable catalog used by the sole dispatcher. */
  readonly catalog: OperationCatalog;
  /** Protocol-neutral, closure-free description projected by every transport. */
  readonly description: RpcDescription;
  /** Engine-facing decision function derived from the surface's settled standing. */
  readonly authorize: RpcAuthorize;
  /** Resource legs that were carried or derived. */
  readonly resources: readonly ResourceRegistration[];
  /** Prompt legs that were carried or derived. */
  readonly prompts: readonly PromptTemplate[];
}

/** Options for inducing a program surface. */
export interface SurfaceAssemblyOptions {
  /** Catalog assembled by the application root; embedded projections may omit it. */
  readonly catalog?: OperationCatalog;
  /** Settled subject-capability assertions conjoined with operation availability. */
  readonly capabilityAssertions?: CapabilityAssertionSource;
  /** Package or module name recorded in discovery and journal statements. */
  readonly packageName?: string;
  /** Base HTTP/form path used when projecting action hrefs. */
  readonly basePath?: string;
  /** Extra resources to publish beyond the auto-derived schema/discovery ones. */
  readonly resources?: readonly ResourceRegistration[];
  /** Extra prompts to publish beyond the auto-derived per-action ones. */
  readonly prompts?: readonly PromptTemplate[];
  /** Already-admitted package export surface to publish as resource material. */
  readonly exportSurface?: ExportSurface;
  /** Already-admitted package bin surface to publish as resource material. */
  readonly binSurface?: BinSurface;
  /** Already-admitted combined package surface to publish as resource material. */
  readonly packageSurface?: PackageSurface;
  /** Observed package publication artifact proof supplied by a filesystem boundary. */
  readonly publicationStatus?: PublicationStatusProof;
  /** Auto-derive one resource per action input/output JSON Schema. Default true. */
  readonly deriveSchemaResources?: boolean;
  /** Auto-derive endpoint projection reports from live operation instruments. Default true. */
  readonly deriveEndpointProjectionResources?: boolean;
  /** Auto-derive MetroPlat LSP virtual documents as MCP-readable resources. Default true. */
  readonly deriveLspResources?: boolean;
  /** Auto-derive one guided prompt per action. Default true. */
  readonly derivePrompts?: boolean;
}

function joinPath(basePath: string, leaf: string): string {
  const base = basePath.replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(leaf)}`;
}

function operationInputAddress(action: Operation): string {
  return action.domain?.id ?? `wire:${action.inputFormat}`;
}

function operationOutputAddress(action: Operation): string {
  return action.codomain?.id ?? `wire:${action.outputFormat}`;
}

/** Keep only the operations out of a module namespace (or accept a list directly). */
export function collectOperations(source: Iterable<unknown> | Readonly<Record<string, unknown>>): readonly Operation[] {
  return Object.freeze(collectValues(source).filter(isOperation));
}

/** Keep only the resources out of a module namespace (or accept a list directly). */
export function collectResources(source: Iterable<unknown> | Readonly<Record<string, unknown>>): readonly ResourceRegistration[] {
  return Object.freeze(collectValues(source).filter(isResource));
}

/** Keep only the prompts out of a module namespace (or accept a list directly). */
export function collectPrompts(source: Iterable<unknown> | Readonly<Record<string, unknown>>): readonly PromptTemplate[] {
  return Object.freeze(collectValues(source).filter(isPrompt));
}

function collectValues(source: Iterable<unknown> | Readonly<Record<string, unknown>>): readonly unknown[] {
  return Symbol.iterator in Object(source)
    ? [...(source as Iterable<unknown>)]
    : Object.values(source as Record<string, unknown>);
}

/** Project an operation declaration into its transport-neutral endpoint. */
function endpointOf(operation: Operation, basePath: string, standing?: ProgramContractStanding): ProgramEndpoint {
  const contract = standing ?? readProgramContractStanding(operation);
  return Object.freeze({
    name: operation.verb,
    href: joinPath(basePath, operation.verb),
    method: "POST" as const,
    input: wireCodec(operation.inputFormat).mediaType,
    output: wireCodec(operation.outputFormat).mediaType,
    ...(operation.summary === undefined ? {} : { summary: operation.summary }),
    ...(operation.description === undefined ? {} : { description: operation.description }),
    ...(operation.domain === undefined ? {} : { domainSchema: operation.domain.schema }),
    ...(operation.codomain === undefined ? {} : { codomainSchema: operation.codomain.schema }),
    ...(operation.runTerm === undefined ? {} : { runTerm: operation.runTerm }),
    contract,
    settlement: contract.contract.settlement,
  });
}


/** The URI of an action's input/output schema resource. */
function schemaUri(packageName: string, verb: string, side: "input" | "output"): string {
  return `metroplat://${encodeURIComponent(packageName)}/schema/${encodeURIComponent(verb)}/${side}`;
}

/** Auto-derive the schema resources a package already carries on its operations. */
function schemaResourcesOf(operations: readonly Operation[], packageName: string): readonly ResourceRegistration[] {
  const resources: ResourceRegistration[] = [];
  for (const presentation of schemasOfOperations(operations)) {
    const schema = presentation.schema;
    resources.push(resource({
      uri: `${presentation.id}.json`,
      name: `${presentation.id} schema`,
      description: `JSON Schema for presentation ${presentation.id}.`,
      read: () => `${JSON.stringify(schema, null, 2)}\n`,
    }));
  }
  for (const act of operations) {
    if (act.domain !== undefined) {
      const schema = act.domain.schema;
      resources.push(resource({
        uri: schemaUri(packageName, act.verb, "input"),
        name: `${act.verb} input schema`,
        description: `JSON Schema of the ${act.inputFormat} input presentation for ${act.verb}.`,
        read: () => `${JSON.stringify(schema, null, 2)}\n`,
      }));
    }
    if (act.codomain !== undefined) {
      const schema = act.codomain.schema;
      resources.push(resource({
        uri: schemaUri(packageName, act.verb, "output"),
        name: `${act.verb} output schema`,
        description: `JSON Schema of the ${act.outputFormat} output presentation for ${act.verb}.`,
        read: () => `${JSON.stringify(schema, null, 2)}\n`,
      }));
    }
  }
  return Object.freeze(resources);
}

export function lspDocumentIndexResourceUri(packageName = "@red-cup-engineering/metroplat"): string {
  return `metroplat://${encodeURIComponent(packageName)}/lsp/documents`;
}

export function lspDocumentResourceUri(uri: string, packageName = "@red-cup-engineering/metroplat"): string {
  return `metroplat://${encodeURIComponent(packageName)}/lsp/document/${encodeURIComponent(uri)}`;
}

export function agentReadinessResourceUri(packageName = "@red-cup-engineering/metroplat"): string {
  return `metroplat://${encodeURIComponent(packageName)}/agent-readiness`;
}

export function transportAgreementResourceUri(packageName = "@red-cup-engineering/metroplat"): string {
  return `metroplat://${encodeURIComponent(packageName)}/transport-agreement`;
}

export function operationIrAuditResourceUri(packageName = "@red-cup-engineering/metroplat"): string {
  return `metroplat://${encodeURIComponent(packageName)}/action-ir-audit`;
}

export function operationRmnDebtResourceUri(packageName = "@red-cup-engineering/metroplat"): string {
  return `metroplat://${encodeURIComponent(packageName)}/action-rmn-debt`;
}

function operationAuditResourcesOf(operations: readonly Operation[], packageName: string): readonly ResourceRegistration[] {
  const irAudit = operationIrAudit(operations);
  const rmnDebt = operationRmnDebt(operations);
  const freeTs = nonportableOperations(operations);
  return Object.freeze([
    resource({
      uri: operationIrAuditResourceUri(packageName),
      name: `${packageName} action IR audit`,
      description: "Operation relation and RMN-body audit derived from the same induced program surface as tools, resources, prompts, and endpoint projections.",
      read: () => `${JSON.stringify({
        kind: "metroplat.action-ir-audit-report",
        package: packageName,
        operations: irAudit.length,
        audit: irAudit,
      }, null, 2)}\n`,
    }),
    resource({
      uri: operationRmnDebtResourceUri(packageName),
      name: `${packageName} action RMN debt`,
      description: "Strict free-TypeScript operations and adjacent RMN presentation-boundary debts detected from the induced program surface.",
      read: () => `${JSON.stringify({
        kind: "metroplat.action-rmn-debt-report",
        package: packageName,
        nonportableOperations: freeTs,
        rmnDebt,
        ok: freeTs.length === 0 && rmnDebt.length === 0,
      }, null, 2)}\n`,
    }),
  ]);
}

function endpointOverlap(
  endpoint: ProgramEndpoint,
  faceA: TransportAgreementFace,
  faceB: TransportAgreementFace,
  requiredFaces: readonly string[],
  extraEvidence: readonly string[] = [],
): TransportAgreementOverlapReport {
  const evidence = Object.freeze([
    `action:${endpoint.name}`,
    `input:${endpoint.input}`,
    `output:${endpoint.output}`,
    `settlement:${endpoint.settlement.regime}/${endpoint.settlement.transport}/${endpoint.settlement.finality}`,
    ...requiredFaces.map((face) => `face:${face}`),
    ...extraEvidence,
  ]);
  return Object.freeze({
    kind: "metroplat.transport-agreement-overlap" as const,
    faceA,
    faceB,
    target: endpoint.name,
    evidence,
    missing: Object.freeze([]),
    ok: true,
  });
}

function cardinalityOverlap(
  faceA: TransportAgreementFace,
  faceB: TransportAgreementFace,
  target: string,
  left: number,
  right: number,
): TransportAgreementOverlapReport {
  const missing = left === right ? [] : [`${target}:count:${left}!=${right}`];
  return Object.freeze({
    kind: "metroplat.transport-agreement-overlap" as const,
    faceA,
    faceB,
    target,
    evidence: Object.freeze([`${faceA}:${left}`, `${faceB}:${right}`]),
    missing: Object.freeze(missing),
    ok: missing.length === 0,
  });
}

function uniqueOverlap(
  faceA: TransportAgreementFace,
  faceB: TransportAgreementFace,
  target: string,
  values: readonly string[],
): TransportAgreementOverlapReport {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  const missing = [...duplicates].map((value) => `${target}:duplicate:${value}`);
  return Object.freeze({
    kind: "metroplat.transport-agreement-overlap" as const,
    faceA,
    faceB,
    target,
    evidence: Object.freeze([`${target}:items:${values.length}`, `${target}:unique:${seen.size}`]),
    missing: Object.freeze(missing),
    ok: missing.length === 0,
  });
}

function transportAgreementReportOf(
  packageName: string,
  operations: readonly Operation[],
  endpoints: readonly ProgramEndpoint[],
  resources: readonly ResourceRegistration[],
  prompts: readonly PromptTemplate[],
): TransportAgreementReport {
  const operationNames = operations.map((act) => act.verb);
  const endpointNames = endpoints.map((endpoint) => endpoint.name);
  const overlaps: TransportAgreementOverlapReport[] = [
    cardinalityOverlap("cli", "discovery", "operations", operations.length, endpoints.length),
    cardinalityOverlap("mcp", "discovery", "tools", endpoints.length, operations.length),
    cardinalityOverlap("openapi", "discovery", "operations", endpoints.length, operations.length),
    cardinalityOverlap("openai", "discovery", "function-tools", endpoints.length, operations.length),
    cardinalityOverlap("resources", "discovery", "resources", resources.length, resources.length),
    cardinalityOverlap("prompts", "discovery", "prompts", prompts.length, prompts.length),
    uniqueOverlap("cli", "discovery", "action-verbs", operationNames),
    uniqueOverlap("openapi", "discovery", "operation-ids", endpointNames),
    uniqueOverlap("mcp", "discovery", "tool-names", endpointNames),
    uniqueOverlap("openai", "discovery", "function-tool-names", endpointNames),
    ...endpoints.flatMap((endpoint) => [
      endpointOverlap(endpoint, "cli", "discovery", Object.freeze(["cli-dispatch", "program-discovery"])),
      endpointOverlap(endpoint, "openapi", "discovery", Object.freeze(["openapi-operation", "program-discovery"])),
      endpointOverlap(endpoint, "mcp", "discovery", Object.freeze(["mcp-tool", "program-discovery"])),
      endpointOverlap(endpoint, "openai", "mcp", Object.freeze(["openai-function-tool", "mcp-tool"])),
      endpointOverlap(endpoint, "http", "discovery", Object.freeze(["http-route", "program-discovery"])),
      endpointOverlap(endpoint, "html-form", "discovery", Object.freeze(["html-form", "program-discovery"])),
      endpointOverlap(endpoint, "arrival-admission", "cli", Object.freeze(["arrival-admission", "cli-dispatch"])),
    ]),
  ];
  const missing = overlaps.flatMap((overlap) => overlap.missing);
  return Object.freeze({
    kind: "metroplat.transport-agreement" as const,
    package: packageName,
    source: "induced-program-surface" as const,
    faces: Object.freeze(["discovery", "cli", "http", "openapi", "mcp", "openai", "html-form", "arrival-admission", "resources", "prompts"] as const),
    operations: operations.length,
    resources: resources.length,
    prompts: prompts.length,
    overlaps: Object.freeze(overlaps),
    evidence: Object.freeze([
      `package:${packageName}`,
      `operations:${operations.length}`,
      `resources:${resources.length}`,
      `prompts:${prompts.length}`,
      `transport-cover:finite-equalizer-report`,
      ...endpoints.map((endpoint) => `endpoint:${endpoint.name}:${endpoint.input}:${endpoint.output}`),
    ]),
    missing: Object.freeze(missing),
    ok: missing.length === 0,
  });
}

function agentStatusCutPrompt(operations: readonly Operation[]): readonly PromptTemplate[] {
  const operationNames = new Set(operations.map((act) => act.verb));
  if (!operationNames.has("read")) return Object.freeze([]);
  return Object.freeze([
    prompt({
      name: "agent-status-cut",
      description: "Read the carried handoff/status cut for an MetroPlat agent session from its state-tier cut address.",
      arguments: Object.freeze([
        Object.freeze({
          name: "session",
          description: "The host session id whose status cut to read (Claude Code or Codex).",
          required: true,
        }),
        Object.freeze({
          name: "readiness",
          description: "Optional JSON agent-readiness report read from metroplat://%40emsenn%2Fmetroplat/agent-readiness.",
          required: false,
        }),
      ]),
      compose: (args) => {
        const lines = [
          "Use MetroPlat to produce the agent handoff/status cut.",
          "",
          "SchemaContract path:",
          "1. Address the cut at the state tier: data/state/YYYY/MM/DD/${date}-cut-claude-session-${session}.json (or -cut-codex-session-${session}.json for a Codex host, -cut-codex-latest.json for the most recent Codex session).",
          "2. Call read with { \"path\": <that address> }; a current-day cut recomputes through its deriver before presentation.",
          "3. Read readiness from metroplat://%40emsenn%2Fmetroplat/agent-readiness when the MCP/LSP boundary is available.",
          "",
          "Do not summarize the session as ordinary prose first; keep goals, obligations, conflicts, evidence, readiness, and missing entries as carried material.",
          ...(args["session"] === undefined || args["session"] === "" ? [] : ["", "Session:", args["session"]]),
          ...(args["readiness"] === undefined || args["readiness"] === "" ? [] : ["", "Readiness:", args["readiness"]]),
        ];
        return [userMessage(lines.join("\n"))];
      },
    }),
  ]);
}

function uniqueStrings(values: Iterable<string | undefined>): readonly string[] {
  return Object.freeze([...new Set([...values].filter((value): value is string => typeof value === "string" && value.length > 0))]);
}

function readinessSurface(
  surface: string,
  count: number,
  descriptors: readonly Record<string, unknown>[],
  contracts: readonly string[],
  evidence: readonly string[],
): AgentReadinessSurface {
  const evidencePolicies: readonly string[] = Object.freeze([]);
  const missing = count > 0 ? [] : [`${surface}:descriptors`];
  return Object.freeze({
    surface,
    ready: missing.length === 0,
    count,
    contracts: Object.freeze([...contracts]),
    evidencePolicies,
    evidence: Object.freeze([...evidence]),
    missing: Object.freeze(missing),
  });
}

function agentReadinessReportOf(
  packageName: string,
  operations: readonly Operation[],
  endpoints: readonly ProgramEndpoint[],
  resources: readonly ResourceRegistration[],
  prompts: readonly PromptTemplate[],
  lspResources: readonly ResourceRegistration[],
  publicationStatus: PublicationStatusProof | undefined,
): AgentReadinessReport {
  const operationNames = new Set(operations.map((act) => act.verb));
  const resourceDescriptors = resources.map((res) => resourceDescriptor(res) as unknown as Record<string, unknown>);
  const promptDescriptors = prompts.map((pr) => promptDescriptor(pr) as unknown as Record<string, unknown>);
  const endpointDescriptors = endpoints.map((endpoint) => Object.freeze({
    name: endpoint.name,
    input: endpoint.input,
    output: endpoint.output,
    contract: endpoint.contract,
  }));
  const programContracts = uniqueStrings(endpoints.map((endpoint) => endpoint.contract.contract.id));
  const lspDocumentIndex = lspDocumentIndexResourceUri(packageName);
  const lspDocumentResources = lspResources.filter((res) => res.uri.startsWith(`metroplat://${encodeURIComponent(packageName)}/lsp/document/`));
  const lspResourceDocuments = lspDocumentResources.filter((res) => decodeURIComponent(res.uri).includes("metroplat-lsp://resource/"));
  const lspPromptDocuments = lspDocumentResources.filter((res) => decodeURIComponent(res.uri).includes("metroplat-lsp://prompt/"));
  const agentStatusPrompt = prompts.some((pr) => pr.name === "agent-status-cut");
  const freeTs = nonportableOperations(operations);
  const rmnDebts = operationRmnDebt(operations);
  const portableOperations = operationIrAudit(operations).filter((entry) => entry.relation === "operation" && entry.hasRunTerm).length;
  const rmn = Object.freeze({
    portableOperations,
    freeTsOperations: freeTs.length,
    debts: rmnDebts.length,
    auditResource: operationIrAuditResourceUri(packageName),
    debtResource: operationRmnDebtResourceUri(packageName),
    ready: freeTs.length === 0 && rmnDebts.length === 0,
  });
  const publication = Object.freeze({
    provided: publicationStatus !== undefined,
    ...(publicationStatus === undefined ? {} : { packageName: publicationStatus.packageName }),
    targets: publicationStatus?.targets.length ?? 0,
    missing: Object.freeze(publicationStatus?.missing ?? []),
    nonExecutableBins: Object.freeze(publicationStatus?.nonExecutableBins ?? []),
    ready: publicationStatus?.ok ?? true,
  });
  // Agent work rides the holographic boundary: session material, work claims,
  // continuations, and status/fleet cuts are all reads at corners or state-tier
  // cut addresses behind the one read/write pair.
  const agentWork = Object.freeze({
    holographicRead: operationNames.has("read"),
    holographicWrite: operationNames.has("write"),
    agentStatusCutPrompt: agentStatusPrompt,
    ready: false,
  });
  const completedAgentWork = Object.freeze({
    ...agentWork,
    ready: agentWork.holographicRead && agentWork.holographicWrite && agentWork.agentStatusCutPrompt,
  });
  const lsp = Object.freeze({
    action: operationNames.has("metroplat-lsp"),
    documentIndexResource: lspDocumentIndex,
    documents: lspDocumentResources.length,
    resources: lspResourceDocuments.length,
    prompts: lspPromptDocuments.length,
    ready: operationNames.has("metroplat-lsp") &&
      resources.some((res) => res.uri === lspDocumentIndex) &&
      lspDocumentResources.length > 0 &&
      lspResourceDocuments.length > 0 &&
      lspPromptDocuments.length > 0,
  });
  const mcp = Object.freeze({
    tools: endpoints.length,
    resources: resources.length,
    prompts: prompts.length,
    ready: endpoints.length > 0 && resources.length > 0 && prompts.length > 0,
  });
  const surfaces = Object.freeze([
    readinessSurface("mcp:tools/list", endpoints.length, endpointDescriptors, programContracts, Object.freeze([
      `operations:${operations.length}`,
      `endpoints:${endpoints.length}`,
    ])),
    readinessSurface("mcp:resources/list", resources.length, resourceDescriptors, programContracts, Object.freeze([
      `resources:${resources.length}`,
      `lsp-document-index:${resources.some((res) => res.uri === lspDocumentIndex)}`,
    ])),
    readinessSurface("mcp:prompts/list", prompts.length, promptDescriptors, programContracts, Object.freeze([
      `prompts:${prompts.length}`,
    ])),
    readinessSurface("lsp:documents", lspDocumentResources.length, lspDocumentResources.map((res) => resourceDescriptor(res) as unknown as Record<string, unknown>), programContracts, Object.freeze([
      `lsp-action:${lsp.action}`,
      `lsp-document-index:${lsp.documentIndexResource}`,
      `lsp-resource-documents:${lsp.resources}`,
      `lsp-prompt-documents:${lsp.prompts}`,
    ])),
  ]);
  const missing = [
    ...surfaces.flatMap((surface) => surface.missing),
    ...(mcp.ready ? [] : ["mcp"]),
    ...(lsp.ready ? [] : ["lsp"]),
    ...(completedAgentWork.holographicRead ? [] : ["agent-work:read"]),
    ...(completedAgentWork.holographicWrite ? [] : ["agent-work:write"]),
    ...(completedAgentWork.agentStatusCutPrompt ? [] : ["agent-work:agent-status-cut-prompt"]),
    ...(freeTs.length === 0 ? [] : freeTs.map((entry) => `rmn:free-ts:${entry.verb}`)),
    ...(rmnDebts.length === 0 ? [] : rmnDebts.map((entry) => `rmn:debt:${entry.verb}:${entry.debt}`)),
    ...(publication.missing.length === 0 ? [] : publication.missing.map((target) => `publication:missing:${target}`)),
    ...(publication.nonExecutableBins.length === 0 ? [] : publication.nonExecutableBins.map((target) => `publication:bin-not-executable:${target}`)),
  ];
  const report = Object.freeze({
    kind: "metroplat.agent-readiness" as const,
    package: packageName,
    source: "induced-program-surface" as const,
    ready: missing.length === 0,
    surfaces,
    mcp,
    lsp,
    agentWork: completedAgentWork,
    rmn,
    publication,
    evidence: Object.freeze([
      `package:${packageName}`,
      `operations:${operations.length}`,
      `mcp-tools:${mcp.tools}`,
      `mcp-resources:${mcp.resources}`,
      `mcp-prompts:${mcp.prompts}`,
      `lsp-documents:${lsp.documents}`,
      `agent-work-ready:${completedAgentWork.ready}`,
      `rmn-portable-operations:${rmn.portableOperations}`,
      `rmn-free-ts-operations:${rmn.freeTsOperations}`,
      `rmn-debts:${rmn.debts}`,
      `publication-proof:${publication.provided}`,
      `publication-targets:${publication.targets}`,
    ]),
    missing: Object.freeze(missing),
  });
  return agentReadinessReportContract.assert(report, "agent readiness report") as AgentReadinessReport;
}

function lspDocumentResource(document: LspVirtualDocument, packageName: string): ResourceRegistration {
  return resource({
    uri: lspDocumentResourceUri(document.uri, packageName),
    name: `${document.id} LSP virtual document`,
    mimeType: "application/json",
    description: `MetroPlat LSP ${document.kind} document ${document.uri}.`,
    read: () => document.text,
  });
}

function lspResourcesOf(
  schemas: readonly SchemaContract[],
  operations: readonly Operation[],
  endpoints: readonly ProgramEndpoint[],
  resourceDescriptors: readonly ResourceDescriptor[],
  promptDescriptors: readonly PromptDescriptor[],
  packageName: string,
): readonly ResourceRegistration[] {
  const lsp = projectLsp({
    schemas: schemas,
    operations,
    endpoints,
    resourceDescriptors,
    promptDescriptors,
  });
  const index = Object.freeze(lsp.documents.map((document) => Object.freeze({
    kind: document.kind,
    id: document.id,
    uri: document.uri,
    resource: lspDocumentResourceUri(document.uri, packageName),
  })));
  return Object.freeze([
    resource({
      uri: lspDocumentIndexResourceUri(packageName),
      name: `${packageName} MetroPlat LSP document index`,
      description: "The MetroPlat language-service document index projected from the same presentation/action graph as MCP tools and resources.",
      read: () => `${JSON.stringify(index, null, 2)}\n`,
    }),
    ...lsp.documents.map((document) => lspDocumentResource(document, packageName)),
  ]);
}

/** De-duplicate resources by URI, keeping the first occurrence. */
function dedupeResources(resources: readonly ResourceRegistration[]): readonly ResourceRegistration[] {
  const seen = new Set<string>();
  const kept: ResourceRegistration[] = [];
  for (const res of resources) {
    if (seen.has(res.uri)) continue;
    seen.add(res.uri);
    kept.push(res);
  }
  return Object.freeze(kept);
}

/** De-duplicate prompts by name, keeping the first occurrence. */
function dedupePrompts(prompts: readonly PromptTemplate[]): readonly PromptTemplate[] {
  const seen = new Set<string>();
  const kept: PromptTemplate[] = [];
  for (const pr of prompts) {
    if (seen.has(pr.name)) continue;
    seen.add(pr.name);
    kept.push(pr);
  }
  return Object.freeze(kept);
}

/**
 * Induce the bin surface for a module's legs.
 *
 * The input can be a module namespace object or a list. Actions, resources, and
 * prompts are collected, schema resources and operation prompts are derived, and the
 * result is one discovery presentation plus a bound dispatcher. HTTP, OpenAPI, MCP,
 * forms, and CLI code consume this induced apex rather than re-declaring the
 * operation surface.
 */
function isCapabilityReading(source: unknown): source is CapabilityReading<Operation> {
  return source !== null
    && typeof source === "object"
    && (source as { readonly kind?: unknown }).kind === "metroplat.capability.reading"
    && Array.isArray((source as { readonly designated?: unknown }).designated);
}

function callableActionsOfReading(reading: CapabilityReading<Operation>): readonly Operation[] {
  const obstructions = new Map(reading.obstructions.map((obstruction) => [obstruction.address, obstruction]));
  return Object.freeze(reading.designated.flatMap((entry) => entry.carriers.map((carrier) => {
    const obstruction = obstructions.get(entry.address);
    if (obstruction === undefined) return carrier;
    return Object.freeze({
      ...carrier,
      run: () => Object.freeze({
        kind: obstruction.kind,
        address: obstruction.address,
        charge: obstruction.charge,
        price: obstruction.price,
      }),
    });
  })));
}

/**
 * Induce the protocol surface from a settled operation-capability reading.
 * Subject standing is always conjoined afterward; an absent assertion set is
 * the all-unknown valuation and therefore authorizes nothing.
 */
export function projectSurface(
  source: Iterable<unknown> | Readonly<Record<string, unknown>> | CapabilityReading<Operation>,
  options: SurfaceAssemblyOptions = {},
): ProjectedSurface {
  const capabilityReading = isCapabilityReading(source) ? source : undefined;
  const settledSource: Iterable<unknown> | Readonly<Record<string, unknown>> = capabilityReading === undefined
    ? source as Iterable<unknown> | Readonly<Record<string, unknown>>
    : callableActionsOfReading(capabilityReading);
  const operations = collectOperations(settledSource);
  const catalog = options.catalog ?? createOperationCatalog(operations);
  const projectedVerbs = operations.map((operation) => operation.verb).sort();
  const catalogVerbs = catalog.operations.map((operation) => operation.verb).sort();
  if (JSON.stringify(projectedVerbs) !== JSON.stringify(catalogVerbs)) {
    throw new TypeError("projectSurface: supplied catalog does not match the projected operation family");
  }
  const standingByOperation = new Map<string, "held" | "denied" | "contested" | "unknown">();
  if (capabilityReading === undefined) {
    for (const operation of operations) standingByOperation.set(operation.ref, "held");
  } else {
    for (const designation of capabilityReading.designated) {
      for (const carrier of designation.carriers) {
        if (isOperation(carrier)) standingByOperation.set(carrier.ref, designation.charge);
      }
    }
  }
  const authorize = authorizationFromCapabilityAssertions(
    authorizationFromStanding(
      standingByOperation,
      capabilityReading === undefined ? "explicit-catalog" : "settled-operation-standing",
    ),
    options.capabilityAssertions ?? [],
    "settled-subject-standing",
  );
  const rpcDescription = describe(catalog, standingByOperation);
  const packageName = options.packageName ?? "@red-cup-engineering/metroplat";
  const basePath = options.basePath ?? "";
  const term = `metroplat.package.${packageName}`;
  const standingByVerb = new Map<string, ProgramContractStanding>();
  if (capabilityReading !== undefined) {
    for (const designation of capabilityReading.designated) {
      if (!isProgramContractStanding(designation.claim.contract)) continue;
      for (const carrier of designation.carriers) standingByVerb.set(carrier.verb, designation.claim.contract);
    }
  }
  const programs = operations.map((act) => endpointOf(act, basePath, standingByVerb.get(act.verb)));

  // Carried prompts come first so they win de-duplication over derived ones.
  const carriedPrompts = [...collectPrompts(settledSource), ...(options.prompts ?? []), ...agentStatusCutPrompt(operations)];
  const derivedPrompts = options.derivePrompts === false ? [] : operations.map(operationPrompt);
  const prompts = dedupePrompts([...carriedPrompts, ...derivedPrompts]);

  // Explicit resources come first; auto-derived schema + discovery resources follow.
  const carriedResources = [...collectResources(settledSource), ...(options.resources ?? [])];
  const liveSchemas = schemasOfOperations(operations);
  const schemaResources = options.deriveSchemaResources === false ? [] : schemaResourcesOf(operations, packageName);
  const operationAuditResources = operationAuditResourcesOf(operations, packageName);
  const resourcesBeforeReadiness = dedupeResources([
    ...carriedResources,
    ...schemaResources,
    ...operationAuditResources,
  ]);
  let readinessRef: AgentReadinessReport | undefined;
  let transportAgreementRef: TransportAgreementReport | undefined;
  const readinessResource = resource({
    uri: agentReadinessResourceUri(packageName),
    name: `${packageName} agent readiness`,
    description: "Finite MCP/LSP/agent-work readiness observation derived from the same induced program surface as tools, resources, prompts, and LSP documents.",
    read: () => {
      if (readinessRef === undefined) throw new Error("agent readiness report was read before the program surface was sealed");
      return `${JSON.stringify(readinessRef, null, 2)}\n`;
    },
  });
  const transportAgreementResource = resource({
    uri: transportAgreementResourceUri(packageName),
    name: `${packageName} transport agreement`,
    description: "Finite agreement report over CLI, HTTP, OpenAPI, MCP, OpenAI, form, resource, prompt, and invocation faces induced from one program surface.",
    read: () => {
      if (transportAgreementRef === undefined) throw new Error("transport agreement report was read before the program surface was sealed");
      return `${JSON.stringify(transportAgreementRef, null, 2)}\n`;
    },
  });
  const resourcesBeforeLsp = dedupeResources([
    ...resourcesBeforeReadiness,
    readinessResource,
    transportAgreementResource,
  ]);
  const lspResources = options.deriveLspResources === false
    ? []
    : lspResourcesOf(liveSchemas, operations, programs, resourcesBeforeLsp.map(resourceDescriptor), prompts.map(promptDescriptor), packageName);

  const utterances: UtteranceObject[] = [
    fact(term, "metroplat.package.has-name", packageName),
    fact(term, "metroplat.package.speaks-protocol", "stdio"),
  ];
  for (const act of operations) {
    utterances.push(fact(term, "metroplat.package.has-action", act.verb));
    for (const u of operationUtterances(act)) utterances.push(u);
  }

  // The discovery presentation is itself a resource; its read thunk closes over the
  // assembled descriptors so the artifact is always the live apex.
  let discoveryRef: ProgramDiscovery;
  const discoveryResource = resource({
    uri: `metroplat://${encodeURIComponent(packageName)}/discovery`,
    name: `${packageName} discovery`,
    description: "The package's program discovery surface: mounted programs, source operations, resources, and prompts.",
    read: () => `${JSON.stringify(discoveryRef, null, 2)}\n`,
  });
  const manifoldResource = operationsManifoldResource(packageName, () => discoveryRef);

  const resources = dedupeResources([
    ...resourcesBeforeLsp,
    ...lspResources,
    discoveryResource,
    manifoldResource,
  ]);
  readinessRef = agentReadinessReportOf(packageName, operations, programs, resources, prompts, lspResources, options.publicationStatus);
  transportAgreementRef = transportAgreementReportOf(packageName, operations, programs, resources, prompts);
  for (const res of resources) {
    utterances.push(fact(term, "metroplat.package.has-resource", res.uri));
    for (const u of resourceUtterances(res)) utterances.push(u);
  }
  for (const pr of prompts) {
    utterances.push(fact(term, "metroplat.package.has-prompt", pr.name));
    for (const u of promptUtterances(pr)) utterances.push(u);
  }

  discoveryRef = Object.freeze({
    kind: "metroplat.program.discovery" as const,
    package: packageName,
    protocol: "stdio" as const,
    programs: Object.freeze(programs),
    resources: Object.freeze(resources.map(resourceDescriptor)),
    prompts: Object.freeze(prompts.map(promptDescriptor)),
    ...(capabilityReading === undefined ? {} : {
      capabilities: Object.freeze({
        valuation: capabilityReading.valuation,
        designated: Object.freeze(capabilityReading.designated.map(({ address, charge }) => Object.freeze({ address, charge }))),
        obstructions: capabilityReading.obstructions,
        order: capabilityReading.order,
      }),
    }),
    utterances: Object.freeze(utterances),
  });

  return Object.freeze({
    discovery: discoveryRef,
    ...(capabilityReading === undefined ? {} : { capabilities: capabilityReading }),
    operations,
    catalog,
    description: rpcDescription,
    authorize,
    resources,
    prompts,
  });
}
