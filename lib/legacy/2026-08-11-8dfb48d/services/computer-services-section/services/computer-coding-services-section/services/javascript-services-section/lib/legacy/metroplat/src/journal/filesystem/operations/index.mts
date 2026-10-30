/**
 * src/journal/filesystem/operations — observations and receipts for journal
 * admission and the log/state/record/content projection chain. The journal is
 * the sole durable event store; these APIs do not define a second store.
 *
 * This is a different module from
 * `integrations/filesystem/addressing/data-artifact-address`: that one is pure
 * path-derivation math, not a contract/lens/exposure boundary.
 */
import type { ContractValue } from "../../../lib/contracts/index.mts";
import type { StatementCoordinate } from "../../../lib/records/persistence.mts";
import type { CredentialStatementOptions } from "../../../lib/capability/identity/index.mts";
import type { Tm } from "@red-cup-engineering/relation-model-notation";
import type { ArtifactSource } from "../../../lib/identity/index.mts";
import type {
  DataArtifactAddress,
  DataArtifactDescriptor,
  DataArtifactEncoding,
} from "../../../lib/addressing/index.mts";
import {
  dataArtifactAddress,
  dataArtifactDescriptor,
} from "../../../lib/addressing/index.mts";
import {
  feedStateProjectionContract,
  jupyterNotebookProjectionContract,
  jupyterRecordProjectionContract,
  logAccountabilityReportProjectionContract,
  logCredentialProjectionContract,
  logRaftSafetyJudgmentProjectionContract,
  logX402ReceiptProjectionContract,
  mementoStateProjectionContract,
  mementoTimeMapProjectionContract,
  recordCommitResultContract,
  recordProjectionContract,
  contentProjectionContract,
  statementWriteResultContract,
  statementLogReadContract,
  journalObservationContract,
  type JournalObservation,
} from "./schema.mts";

export type {
  ContentArtifactProjection,
  FeedStateProjection,
  JupyterNotebookProjection,
  JupyterRecordProjection,
  LogAccountabilityReportProjection,
  LogCredentialProjection,
  LogRaftSafetyJudgmentProjection,
  LogX402ReceiptProjection,
  MementoStateProjection,
  MementoTimeMapProjection,
  RecordCommitResult,
  RecordArtifactProjection,
  EventWriteResult,
  StatementLogRead,
  JournalObservation,
} from "./schema.mts";

/** Filesystem-journal move exposed at the `data/` boundary. */
export type JournalOperationKind =
  | "write-statement-rows"
  | "read-statement-rows"
  | "project-feed-state"
  | "project-memento-state"
  | "project-log-memento-timemap"
  | "project-log-credential"
  | "project-log-x402-receipt"
  | "project-log-accountability-report"
  | "project-log-raft-safety-judgment"
  | "project-content-jupyter-record"
  | "project-record-jupyter-notebook"
  | "commit-record"
  | "project-log-record"
  | "project-record-content";

/** Options for exposing a filesystem-journal move as contract material. */
export interface JournalObservationOptions {
  /** Time, stage, or other exposure coordinate supplied by the boundary. */
  readonly at?: ContractValue;
  /** Caller/observer descriptor supplied by the boundary. */
  readonly caller?: ContractValue;
  /** Optional typed claim to use for admitted source statements. */
  readonly eventClaim?: Tm;
  /** Optional causal predecessors to attach to admitted source statements. */
  readonly eventCauses?: readonly string[];
  /** Exact artifacts referenced by every witnessed source row in this append. */
  readonly eventArtifacts?: readonly ArtifactSource[];
}

/** Options for projecting a durable statement log into a credential artifact. */
export interface LogCredentialProjectionOptions extends JournalObservationOptions {
  readonly credential?: CredentialStatementOptions;
}

/** Options for projecting a durable statement log into a Memento TimeMap artifact. */
export interface MementoTimeMapProjectionOptions extends JournalObservationOptions {
  readonly original?: string;
}

/** Options for path-first statement writes under a data root. */
export interface RootEventWriteOptions extends JournalObservationOptions {
  readonly at?: StatementCoordinate;
  readonly rootName?: string;
  readonly subject?: string;
  readonly encoding?: DataArtifactEncoding;
}

export function journalAppendAddress(
  root: string,
  action: string,
  at: StatementCoordinate,
  options: RootEventWriteOptions = {},
): DataArtifactAddress {
  return dataArtifactAddress({
    root,
    ...(options.rootName === undefined ? {} : { rootName: options.rootName }),
    tier: "log",
    encoding: options.encoding ?? "jsonl",
    at,
    action,
    subject: options.subject ?? action,
  });
}

export function journalLogArtifact(logPath: string): DataArtifactDescriptor {
  return dataArtifactDescriptor("log", logPath, "jsonl");
}

export function journalStateArtifact(statePath: string): DataArtifactDescriptor {
  return dataArtifactDescriptor("state", statePath, "json");
}

export function journalRecordArtifact(recordPath: string, encoding: DataArtifactEncoding = "jsonl"): DataArtifactDescriptor {
  return dataArtifactDescriptor("record", recordPath, encoding);
}

export function journalContentArtifact(
  contentPath: string,
  encoding: DataArtifactEncoding = "json",
): DataArtifactDescriptor {
  return dataArtifactDescriptor("content", contentPath, encoding);
}

export function observeJournalOperation(feed: string, operation: JournalOperationKind): JournalObservation {
  return journalObservationContract.assert(Object.freeze({
    kind: "metroplat.witness-store-observation" as const,
    operation,
    feed,
  }), "journal observation") as JournalObservation;
}

export function journalObservation<T extends JournalObservation>(value: T, context = "journal receipt"): T {
  switch (value.operation) {
    case "write-statement-rows":
      return statementWriteResultContract.assert(Object.freeze(value), context) as T;
    case "read-statement-rows":
      return statementLogReadContract.assert(Object.freeze(value), context) as T;
    case "project-feed-state":
      return feedStateProjectionContract.assert(Object.freeze(value), context) as T;
    case "project-memento-state":
      return mementoStateProjectionContract.assert(Object.freeze(value), context) as T;
    case "project-log-memento-timemap":
      return mementoTimeMapProjectionContract.assert(Object.freeze(value), context) as T;
    case "project-log-credential":
      return logCredentialProjectionContract.assert(Object.freeze(value), context) as T;
    case "project-log-x402-receipt":
      return logX402ReceiptProjectionContract.assert(Object.freeze(value), context) as T;
    case "project-log-accountability-report":
      return logAccountabilityReportProjectionContract.assert(Object.freeze(value), context) as T;
    case "project-log-raft-safety-judgment":
      return logRaftSafetyJudgmentProjectionContract.assert(Object.freeze(value), context) as T;
    case "project-content-jupyter-record":
      return jupyterRecordProjectionContract.assert(Object.freeze(value), context) as T;
    case "project-record-jupyter-notebook":
      return jupyterNotebookProjectionContract.assert(Object.freeze(value), context) as T;
    case "commit-record":
      return recordCommitResultContract.assert(Object.freeze(value), context) as T;
    case "project-log-record":
      return recordProjectionContract.assert(Object.freeze(value), context) as T;
    case "project-record-content":
      return contentProjectionContract.assert(Object.freeze(value), context) as T;
  }
}
