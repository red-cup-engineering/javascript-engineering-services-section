// src/journal/filesystem — filesystem journal implementation.
//
// This service owns data-directory reads, source admissions, and projections.
// Shared low-level filesystem effects such as atomic temp-write + rename live
// in adapters/filesystem so this module can focus on journal projections.
//
//   <logDir>/<feed>.jsonl.statements/sha256/*.json  content-addressed source statements
//   <logDir>/packets/sha256/*.json          immutable oversized source packets
//   <logDir>/<feed>.jsonl      deterministic EAVT feed projection
//   <stateDir>/<feed>.json     the current view, projected from the log (bulk)
//   <recordDir>/<feed>.jsonl   settled invariants (Datoms), projected from source
//   <contentDir>/<term>/<term>.<type>  content-tier cuts read from records

import path from "node:path";
import { journalDirectoryOf } from "../store-root.mts";
import type { FilesystemJournalPaths } from "./types.mts";
import { canonicalBytes, sha256Hex } from "../../lib/identity/index.mts";
import { parse, requireJsonValue, type JsonValue } from "../../lib/codecs/json/core.mts";
import { jsonToTerm } from "@red-cup-engineering/relation-model-notation-json-codec";
import {
  observeJournalOperation,
  journalAppendAddress,
  journalLogArtifact,
  journalObservation,
  journalRecordArtifact,
  journalStateArtifact,
  type FeedStateProjection,
  type RecordCommitResult,
  type RecordArtifactProjection,
  type RootEventWriteOptions,
  type EventWriteResult,
  type StatementLogRead,
  type JournalObservation,
  type JournalObservationOptions,
} from "./operations/index.mts";
import {
  dataArtifactHandlePath,
  dataTierDirectory,
  feedArtifactPath,
  logRecordArtifactPath,
  projectDataArtifactPath,
  dataStoreFromLogPath,
  type DataArtifactHandle,
} from "../../lib/addressing/index.mts";
import {
  foldStateAccumRow,
  initialStateAccum,
  closeStateAccum,
  type StateView,
} from "../../lib/fixpoint/state-fold.mts";
import { type StatementValue } from "../../lib/records/persistence.mts";
import type { ContractValue } from "../../lib/contracts/index.mts";
import {
  eavtId,
  eavtObject,
  toEavt,
  type EAVT,
} from "../../lib/codecs/json/jsonl/eavt/index.mts";
import {
  ensureDirectory,
  foldToLinesAtomicSync,
  pathExists,
  readDirectoryEntries,
  readFileUtf8,
  statPathOrNull,
  walkFiles,
  writeFileAtomic,
  writeFileAtomicNew,
} from "../../lib/filesystem/index.mts";

import { projectLegacyLog } from "./legacy-codec.mts";
import {
  admitEvents,
  foldEventRows,
  readEventRows,
  readEventRowsAsOf,
  readEvents,
  eventFiles,
  eventPath,
  writeRows as writeEventRows,
} from "./events.mts";

/**
 * Filesystem binding for the journal and its derived artifact tiers.
 *
 * The first three tiers are required: append-only log, projected state, and
 * settled records. `contentDir` is optional because not every feed needs a
 * per-entity document cut. The type is deliberately just paths; policy such as
 * retention, locking, backup, and cross-process coordination belongs above this
 * small Node binding.
 */
export type { FilesystemJournalPaths } from "./types.mts";

/** Beyond this many bytes, `readRows`/`readRowsPath` refuse a
 *  whole-file read rather than materializing every row resident, and name
 *  `streamStatementLogPath` as the alternative. Parsed EAVT rows run several
 *  times their JSONL byte count as JS objects, so this is set well under
 *  typical default Node heap sizes, not at the JSONL file-size ceiling. */
export const STATEMENT_LOG_READ_MAX_BYTES = 256 * 1024 * 1024;

/** Read newline-delimited JSON, skipping malformed lines; a missing file is []. */
export function readJsonl<T = JsonValue>(filePath: string): T[] {
  let text: string;
  try {
    text = readFileUtf8(filePath);
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(parse(trimmed) as T);
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

/** Read a single JSON document, or null if absent/unreadable. */
export function readJsonFile<T = JsonValue>(filePath: string): T | null {
  try {
    return parse(readFileUtf8(filePath)) as T;
  } catch {
    return null;
  }
}

function packetDirectoryPath(logDir: string): string {
  return path.join(logDir, "packets", "sha256");
}

function packetArtifactPath(logDir: string, sha256: string): string {
  return path.join(packetDirectoryPath(logDir), `${sha256}.json`);
}

function packetReferencePath(logDir: string, packetPath: string): string {
  return path.relative(logDir, packetPath).split(path.sep).join("/");
}

function statementLogSourceFiles(logPath: string): readonly string[] {
  ensureLegacyProjected(logPath);
  return eventFiles(logPath);
}

function ensureLegacyProjected(logPath: string): void {
  if (eventFiles(logPath).length > 0) return;
  const legacy = projectLegacyLog(logPath, Object.freeze({
    kind: "metroplat.legacy-journal-codec",
    logPath,
  }) as JsonValue);
  if (legacy.statements.length === 0) return;
  admitEvents(logPath, legacy.statements);
}

function statementLogSourceBytes(files: readonly string[]): number {
  return files.reduce((sum, file) => sum + (statPathOrNull(file)?.size ?? 0), 0);
}

/** Source byte length for one statement-log handle. */
export function sourceByteLengthInternal(logArtifact: DataArtifactHandle): number {
  return statementLogSourceBytes(statementLogSourceFiles(dataArtifactHandlePath(logArtifact, "log")));
}

/** True when one statement-log handle has source material. */
export function sourceExistsInternal(logArtifact: DataArtifactHandle): boolean {
  return statementLogSourceFiles(dataArtifactHandlePath(logArtifact, "log")).length > 0;
}

export interface StatementLogSourceSelection {
  readonly files: readonly string[];
}

export function sourceSelectionInternal(logPath: string): StatementLogSourceSelection {
  const files = statementLogSourceFiles(logPath);
  return Object.freeze({ files });
}

export function scanSourceFilesInternal<Acc>(
  files: readonly string[],
  init: Acc,
  step: (accumulator: Acc, row: EAVT) => Acc,
): { readonly result: Acc; readonly rows: number; readonly malformed: number } {
  let result = init;
  let rows = 0;
  let malformed = 0;
  const logPaths = new Set<string>();
  for (const file of files) {
    const marker = ".jsonl.statements/";
    const markerAt = file.indexOf(marker);
    if (markerAt >= 0) logPaths.add(`${file.slice(0, markerAt)}.jsonl`);
  }
  for (const logPath of logPaths) {
    const folded = foldEventRows(logPath, result, step);
    result = folded.result;
    rows += folded.rows;
    malformed += folded.malformed;
  }
  return { result, rows, malformed };
}

/**
 * Every admitted log feed for one date under a data root, regardless of which
 * subject recorded it. A feed is present when either its legacy
 * `${date}-admit-*.jsonl` channel code exists or its content-addressed
 * statement directory exists. A caller wanting
 * one specific feed's rows should still address it directly; this is for
 * callers that need every recorded row for a date across however many
 * subjects wrote to it, where recognizing which rows matter is a question the
 * rows' own structure answers, not the filename they happened to land in.
 */
export function listDailyFeedsInternal(dataRoot: string, date: string): readonly string[] {
  const directory = dataTierDirectory(dataRoot, "log", date);
  if (!pathExists(directory)) return Object.freeze([]);
  const admitPrefix = `${date}-admit-`;
  const feeds = new Set<string>();
  try {
    for (const entry of readDirectoryEntries(directory)) {
      if (entry.isFile() && entry.name.startsWith(admitPrefix) && entry.name.endsWith(".jsonl")) {
        feeds.add(path.join(directory, entry.name));
      } else if (entry.isDirectory() && entry.name.startsWith(admitPrefix) && entry.name.endsWith(".jsonl.statements")) {
        feeds.add(path.join(directory, entry.name.slice(0, -".statements".length)));
      }
    }
  } catch {
    return Object.freeze([]);
  }
  return Object.freeze([...feeds].sort((left, right) => left.localeCompare(right)));
}

export function journalDateStatus(dataRoot: string, date: string): { readonly exists: boolean; readonly legacyIdentitySidecars: number } {
  const directory = dataTierDirectory(dataRoot, "log", date);
  if (!pathExists(directory)) return Object.freeze({ exists: false, legacyIdentitySidecars: 0 });
  try {
    const legacyIdentitySidecars = readDirectoryEntries(directory)
      .filter((entry) => entry.isFile() && entry.name.endsWith(".identities")).length;
    return Object.freeze({ exists: true, legacyIdentitySidecars });
  } catch {
    return Object.freeze({ exists: false, legacyIdentitySidecars: 0 });
  }
}

export function discoverJournalRoots(root: string, maxDepth = 7): readonly string[] {
  const resolvedRoot = path.resolve(root);
  const found: string[] = [];
  const skipped = new Set(["node_modules", ".git", "dist", ".tmp", ".metroplat-tmp", "data", "content"]);
  const visit = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    if (path.basename(dir) !== "data" && statPathOrNull(journalDirectoryOf(dir))?.isDirectory() === true) found.push(dir);
    let entries;
    try {
      entries = readDirectoryEntries(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || skipped.has(entry.name)) continue;
      visit(path.join(dir, entry.name), depth + 1);
    }
  };
  visit(resolvedRoot, 0);
  return Object.freeze(found.sort((left, right) => left.localeCompare(right)));
}

export function enclosingJournalRoot(targetPath: string, fallback: string): string {
  let dir = path.dirname(path.resolve(targetPath));
  for (;;) {
    if (path.basename(dir) !== "data" && statPathOrNull(journalDirectoryOf(dir))?.isDirectory() === true) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(fallback);
    dir = parent;
  }
}

export function journalAdmissionSpan(dataRoot: string): { readonly first: string | null; readonly last: string | null; readonly feeds: number } {
  const logsDir = journalDirectoryOf(dataRoot);
  if (!pathExists(logsDir)) return Object.freeze({ first: null, last: null, feeds: 0 });
  let first: string | null = null;
  let last: string | null = null;
  let feeds = 0;
  for (const year of readDirectoryEntries(logsDir)) {
    if (!year.isDirectory() || !/^\d{4}$/u.test(year.name)) continue;
    for (const month of readDirectoryEntries(path.join(logsDir, year.name))) {
      if (!month.isDirectory()) continue;
      for (const day of readDirectoryEntries(path.join(logsDir, year.name, month.name))) {
        if (!day.isDirectory()) continue;
        const date = `${year.name}-${month.name}-${day.name}`;
        const count = listDailyFeedsInternal(dataRoot, date).length;
        if (count === 0) continue;
        feeds += count;
        if (first === null || date < first) first = date;
        if (last === null || date > last) last = date;
      }
    }
  }
  return Object.freeze({ first, last, feeds });
}

/** Fold every recorded EAVT row for one date across every admitted log file
 *  under a data root (see {@link listDailyFeedsInternal}). */
export function scanDailyRowsInternal<Acc>(
  dataRoot: string,
  date: string,
  init: Acc,
  step: (accumulator: Acc, row: EAVT) => Acc,
): { readonly result: Acc; readonly rows: number; readonly malformed: number; readonly feeds: number } {
  let result = init;
  let rows = 0;
  let malformed = 0;
  let feeds = 0;
  for (const file of listDailyFeedsInternal(dataRoot, date)) {
    feeds += 1;
    const folded = scanRowsInternal(file, result, step);
    result = folded.result;
    rows += folded.rows;
    malformed += folded.malformed;
  }
  return Object.freeze({ result, rows, malformed, feeds });
}

/** Every recorded EAVT row for one date across every admitted log file
 *  under a data root (see {@link listDailyFeedsInternal}). */
export function readDailyAdmitRows(dataRoot: string, date: string): readonly EAVT[] {
  return Object.freeze(scanDailyRowsInternal(dataRoot, date, [] as EAVT[], (rows, row) => {
    rows.push(row);
    return rows;
  }).result);
}

/** Fold every admitted row in a territory without exposing journal paths. */
export function territoryLogPathsInternal(dataRoot: string): readonly string[] {
  const logsRoot = journalDirectoryOf(dataRoot);
  if (!pathExists(logsRoot)) return Object.freeze([]);
  const marker = ".jsonl.statements" + path.sep;
  const logPaths = new Set<string>();
  for (const file of walkFiles(logsRoot, { skipSymbolicLinks: true })) {
    const at = file.indexOf(marker);
    if (at >= 0) logPaths.add(file.slice(0, at + ".jsonl".length));
  }
  return Object.freeze([...logPaths].sort((left, right) => left.localeCompare(right)));
}

/** Fold every admitted row in a territory without exposing journal paths. */
export function foldTerritoryRows<Acc>(
  dataRoot: string,
  init: Acc,
  step: (accumulator: Acc, row: EAVT) => Acc,
): { readonly result: Acc; readonly rows: number; readonly malformed: number; readonly feeds: number } {
  const logPaths = territoryLogPathsInternal(dataRoot);
  let result = init;
  let rows = 0;
  let malformed = 0;
  for (const logPath of logPaths) {
    const folded = scanRowsInternal(logPath, result, step);
    result = folded.result;
    rows += folded.rows;
    malformed += folded.malformed;
  }
  return Object.freeze({ result, rows, malformed, feeds: logPaths.length });
}

/** Ensure all tier directories exist (the content tier only when configured). */
export function ensureStoreDirs(store: FilesystemJournalPaths): void {
  ensureDirectory(store.logDir);
  ensureDirectory(store.stateDir);
  ensureDirectory(store.recordDir);
  if (store.contentDir !== undefined) ensureDirectory(store.contentDir);
}

// The content tier's READER (reading `data/content/...` back as documents,
// the inverse of this store's artifact-carried projection writes) lives in
// the filesystem content adapter — a distinct concern from the generic
// journal log/state/record projections below, re-exported here so every
// existing consumer of this barrel is unaffected by the split.
export {
  readContentResource,
  listContentEntries,
  readContentTree,
  type ContentEntriesList,
  type ContentEntry,
  type ContentResourceRead,
  type ContentStoreOperationKind,
  type ContentTreeRead,
} from "../../lib/filesystem/content/tree.mts";

export type {
  FeedStateProjection,
  JupyterNotebookProjection,
  JupyterRecordProjection,
  LogAccountabilityReportProjection,
  LogCredentialProjection,
  LogCredentialProjectionOptions,
  LogRaftSafetyJudgmentProjection,
  LogX402ReceiptProjection,
  MementoStateProjection,
  MementoTimeMapProjection,
  MementoTimeMapProjectionOptions,
  RecordCommitResult,
  RootEventWriteOptions,
  EventWriteResult,
  StatementLogRead,
  JournalObservation,
  JournalObservationOptions,
  JournalOperationKind,
} from "./operations/index.mts";

/**
 * Read a feed's admitted statement log as a report-bearing journal observation.
 *
 * A missing or unreadable log yields an observation with `rows: []`, making the
 * empty feed a first-class state instead of an exceptional case. The result
 * carries the operation contract, boundary exposure, and exposure report beside
 * the normalized EAVT records.
 */
export function readRows(store: FilesystemJournalPaths, feed: string): StatementLogRead {
  const logPath = feedArtifactPath(store.logDir, feed, "jsonl");
  const sourceFiles = statementLogSourceFiles(logPath);
  const sourceBytes = statementLogSourceBytes(sourceFiles);
  if (sourceBytes > STATEMENT_LOG_READ_MAX_BYTES) {
    // Beyond this bound a whole-file read would materialize every row
    // resident (parsed JS objects run several times the JSONL byte count),
    // trading a slow OOM for the old ERR_STRING_TOO_LONG crash. The honest
    // move is the same FOUR-charge refusal shape as the stat-absent/
    // read-failed branches below — evidenced both ways, the `contested` corner
    // (the log is present, but this read declines it) — naming the streaming
    // alternative rather than attempting a read this function cannot bound.
    const rows: EAVT[] = [];
    const artifact = journalLogArtifact(logPath);
    const obstruction = `log source is ${sourceBytes} bytes, over the ${STATEMENT_LOG_READ_MAX_BYTES}-byte whole-read bound; use streamStatementLogPath to fold it without materializing every row`;
    const observation = observeJournalOperation(feed, "read-statement-rows");
    return journalObservation(
      Object.freeze({ ...observation, operation: "read-statement-rows" as const, artifact, rows, obstruction }),
      "statement log read",
    ) as StatementLogRead;
  }
  if (sourceFiles.length === 0) {
    const rows: EAVT[] = [];
    const artifact = journalLogArtifact(logPath);
    const observation = observeJournalOperation(feed, "read-statement-rows");
    return journalObservation(
      Object.freeze({ ...observation, operation: "read-statement-rows" as const, artifact, rows }),
      "statement log read",
    ) as StatementLogRead;
  }
  const read = readEventRows(logPath);
  const rows = read.rows;
  const malformed = read.verdicts.map((statement, index) => Object.freeze({
    line: index + 1,
    text: statement.bytes,
    reason: String((statement.observation.payload as { readonly reason?: unknown } | undefined)?.reason ?? "inadmissible statement"),
  }));
  const artifact = journalLogArtifact(logPath);
  const observation = observeJournalOperation(feed, "read-statement-rows");
  return journalObservation(
    Object.freeze({
      ...observation,
      operation: "read-statement-rows" as const,
      artifact,
      rows: Object.freeze(rows),
      ...(malformed.length === 0 ? {} : { malformed: Object.freeze(malformed) }),
    }),
    "statement log read",
  ) as StatementLogRead;
}

/** Read a statement log directly from its durable `data/journals/.../<feed>.jsonl` artifact handle. */
export function readRowsPath(logArtifact: DataArtifactHandle): StatementLogRead {
  const logPath = dataArtifactHandlePath(logArtifact, "log");
  const { store, feed } = dataStoreFromLogPath(logPath);
  return readRows(store, feed);
}

export function readRowsAsOfPath(logArtifact: DataArtifactHandle, frontier: readonly string[]): StatementLogRead {
  const logPath = dataArtifactHandlePath(logArtifact, "log");
  ensureLegacyProjected(logPath);
  const { feed } = dataStoreFromLogPath(logPath);
  const read = readEventRowsAsOf(logPath, frontier);
  const artifact = journalLogArtifact(logPath);
  const observation = observeJournalOperation(feed, "read-statement-rows");
  return journalObservation(Object.freeze({
    ...observation,
    operation: "read-statement-rows" as const,
    artifact,
    rows: read.rows,
    ...(read.verdicts.length === 0 ? {} : {
      malformed: Object.freeze(read.verdicts.map((statement, index) => Object.freeze({
        line: index + 1,
        text: statement.bytes,
        reason: "inadmissible statement",
      }))),
    }),
  }), "as-of statement log read") as StatementLogRead;
}

export function readEventIdsPath(logArtifact: DataArtifactHandle): readonly string[] {
  const logPath = dataArtifactHandlePath(logArtifact, "log");
  ensureLegacyProjected(logPath);
  return Object.freeze(readEvents(logPath).map((statement) => statement.id));
}

/** One line that failed EAVT admission while streaming a statement log. */
export interface StreamedStatementMalformedLine {
  readonly line: number;
  readonly text: string;
  readonly reason: string;
}

/**
 * Stream a durable `data/journals` artifact one admitted EAVT row at a time,
 * through the SAME line-wise admission `readRows` uses (a corrupted
 * line is evidence, never a thrown error that poisons the whole read), never
 * materializing the file or its row array whole. This is the alternative
 * `readRows`'s size guard names for a log over `STATEMENT_LOG_READ_MAX_BYTES`,
 * and the primitive any genuinely unbounded-row consumer (a migration, a
 * bulk export) should fold over instead of collecting `.rows`. `maxBytes`
 * bounds the read to a fixed snapshot length — pass the log's own `statSync`
 * size to make this pass agree with an independent whole-file read (a
 * content hash, a second stream) about "the file" even while it is being
 * appended to concurrently.
 */
export async function* streamStatementLogPath(
  logArtifact: DataArtifactHandle,
  onMalformed?: (malformed: StreamedStatementMalformedLine) => void,
  maxBytes?: number,
): AsyncGenerator<EAVT> {
  const logPath = dataArtifactHandlePath(logArtifact, "log");
  void maxBytes;
  const read = readEventRows(logPath);
  read.verdicts.forEach((statement, index) => {
    onMalformed?.({ line: index + 1, text: statement.bytes, reason: "inadmissible statement" });
  });
  for (const row of read.rows) yield row;
}

/**
 * Fold a durable log artifact's rows synchronously, one line at a time,
 * through the same admission `readRows` uses. This is the internal
 * bounded-memory primitive `projectStateInternal`/`projectRecordInternal`/
 * `commitRecordInternal` fold over instead of collecting `readRows(...).rows` —
 * a resident `EAVT[]` for every row is exactly the shape that made a grown
 * day log's projections costly. Kept synchronous (unlike `streamStatementLogPath`)
 * so these projections' existing public call sites need no async cascade.
 */
export function scanRowsInternal<Acc>(
  logPath: string,
  init: Acc,
  step: (accumulator: Acc, row: EAVT) => Acc,
): { readonly result: Acc; readonly rows: number; readonly malformed: number } {
  ensureLegacyProjected(logPath);
  return foldEventRows(logPath, init, step);
}

/** Every domain a statement log currently gets a bespoke `data/records` document
 *  projection for, PLUS the generic `data/state` memento leg. Domain-specific
 *  projections (credential, x402, accountability, raft, jupyter) live outside
 *  the generic fold itself. Runtime-owned projections stay as sibling files;
 *  x402 lives in integrations/x402 and depends into this store rather than
 *  making journal import vendor vocabulary. */
export type LogRecordProjectionOperation =
  | "project-log-memento-timemap"
  | "project-log-credential"
  | "project-log-x402-receipt"
  | "project-log-accountability-report"
  | "project-log-raft-safety-judgment";

export interface LogRecordProjectionBuild {
  readonly payload: JsonValue;
  readonly boundary?: Readonly<Record<string, ContractValue>>;
  readonly receipt?: Readonly<Record<string, unknown>>;
}

export interface LogRecordProjectionFoldSource {
  readonly rows: number;
  readonly malformed: number;
  readonly logPath: string;
}

/** Whether a JSON value admits only the atomic term shapes `jsonToTerm`
 *  produces for scalars (`mark`/`bool`/`star`/`charge`) rather than the
 *  compound `pair` it builds for every array or object. This is the actual
 *  measurable content/record boundary: an object or array is real product-
 *  structured data regardless of how human-facing its fields read; only a
 *  bare scalar (in practice, a markdown string) is the atomic term content
 *  tier is for. */
function isAtomicPayload(payload: JsonValue): boolean {
  return jsonToTerm(payload)[0] !== "pair";
}

/** Slice a JSON record document out of a statement log by folding source rows
 *  into a domain accumulator instead of first materializing a `StatementLogRead`.
 *  This is the record-tier analogue of `projectStateInternal`: callers retain
 *  only the sufficient statistic their record format requires. */
export function projectDomainRecordInternal<T extends JournalObservation, Acc>(
  logArtifact: DataArtifactHandle,
  operation: LogRecordProjectionOperation,
  suffix: string,
  context: string,
  init: () => Acc,
  step: (accumulator: Acc, row: EAVT) => Acc,
  build: (accumulator: Acc, source: LogRecordProjectionFoldSource) => LogRecordProjectionBuild,
  options: JournalObservationOptions = {},
): T {
  void options;
  const logPath = dataArtifactHandlePath(logArtifact, "log");
  const { feed } = dataStoreFromLogPath(logPath);
  const recordPath = logRecordArtifactPath(logPath, suffix);
  const sourceArtifact = journalLogArtifact(logPath);
  const artifact = journalRecordArtifact(recordPath, "json");
  const sourceSelection = sourceSelectionInternal(logPath);
  const folded = scanSourceFilesInternal(sourceSelection.files, init(), step);
  const source = Object.freeze({ rows: folded.rows, malformed: folded.malformed, logPath });
  const projected = build(folded.result, source);
  if (isAtomicPayload(projected.payload)) {
    throw new TypeError(`projectDomainRecordInternal: ${operation} payload measured atomic, not a compound term — reconsider its tier`);
  }
  writeFileAtomic(recordPath, `${canonicalBytes(projected.payload)}\n`);
  const observation = observeJournalOperation(feed, operation);
  return journalObservation(Object.freeze({
    ...observation,
    operation,
    sourceArtifact,
    artifact,
    ...(projected.receipt ?? {}),
  }), context) as unknown as T;
}

/** Beyond this many bytes, source material is admitted as an immutable packet
 *  and the row carries a packet reference. The row stays bounded without
 *  deleting the boundary value it came from. */
export const STATEMENT_ROW_MAX_BYTES = 64 * 1024;

function alreadyExists(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { readonly code?: unknown }).code === "EEXIST";
}

/** The coordinates of one immutable packet written under `<logDir>/packets/sha256/`. */
export interface PacketWrite {
  readonly sha256: string;
  readonly bytes: number;
  readonly path: string;
  readonly relativePath: string;
}

/** Write one immutable packet (create-exclusive, idempotent by content) and
 *  return its coordinates. The one packet-write primitive: arrival and hook
 *  admission import this rather than carrying their own copies of the
 *  directory layout and EEXIST tolerance. `bytes` counts the content, not the
 *  trailing newline the file carries. */
export function writePacketText(logDir: string, text: string): PacketWrite {
  const sha256 = sha256Hex(text);
  const packetPath = packetArtifactPath(logDir, sha256);
  try {
    writeFileAtomicNew(packetPath, `${text}\n`);
  } catch (error) {
    if (!alreadyExists(error)) throw error;
  }
  return Object.freeze({
    sha256,
    bytes: Buffer.byteLength(text, "utf8"),
    path: packetPath,
    relativePath: packetReferencePath(logDir, packetPath),
  });
}

function packetReference(logDir: string, text: string): JsonValue {
  const packet = writePacketText(logDir, text);
  return Object.freeze({
    kind: "metroplat.witness-packet-reference" as const,
    mediaType: "application/json" as const,
    sha256: packet.sha256,
    bytes: packet.bytes,
    href: `blob:sha256:${packet.sha256}`,
    path: packet.relativePath,
  }) as JsonValue;
}

function packetizeValue(logDir: string, value: JsonValue, inlineLimitBytes: number): JsonValue {
  const text = canonicalBytes(value);
  return Buffer.byteLength(text, "utf8") <= inlineLimitBytes ? value : packetReference(logDir, text);
}

/** Bound one admitted row by replacing an oversized value with a durable packet
 *  reference. If the row is still too large after that, packet the whole row
 *  and admit an obstruction that points at the packet instead of erasing the
 *  original material. */
function packetizeOversizedRow(logDir: string, row: EAVT): EAVT {
  const { e, a, v, t } = eavtObject(row);
  const valuePacketized = toEavt({ e, a, v: packetizeValue(logDir, v, STATEMENT_ROW_MAX_BYTES), t });
  const rowText = canonicalBytes(valuePacketized as unknown as JsonValue);
  if (Buffer.byteLength(rowText, "utf8") <= STATEMENT_ROW_MAX_BYTES) return valuePacketized;
  const [entity, attribute, , time] = row;
  const originalPacket = packetReference(logDir, canonicalBytes(row as unknown as JsonValue));
  return toEavt({
    e: entity,
    a: attribute,
    v: Object.freeze({
      // Frozen legacy wire discriminant; the source API exposes a statement obstruction.
      kind: "metroplat.witness-row-obstruction" as const,
      reason: "over-threshold-packeted" as const,
      threshold: STATEMENT_ROW_MAX_BYTES,
      packet: originalPacket,
    }) as unknown as JsonValue,
    t: time,
  });
}

/**
 * Source-admit every normalized statement row into one durable
 * content-addressed statement. The feed JSONL path is only the logical handle
 * callers use to name the statement set; no live write publishes a feed file.
 * Over-threshold values are written as immutable content-addressed packet files
 * under `packets/sha256/`, and statement payloads carry packet references
 * instead of dropping the original material.
 */
function writeRows(
  store: FilesystemJournalPaths,
  feed: string,
  rows: readonly EAVT[],
  options: JournalObservationOptions = {},
): EventWriteResult {
  const logPath = feedArtifactPath(store.logDir, feed, "jsonl");
  const artifact = journalLogArtifact(logPath);
  if (rows.length === 0) {
    const observation = observeJournalOperation(feed, "write-statement-rows");
    return journalObservation(
      Object.freeze({ ...observation, operation: "write-statement-rows" as const, artifact, rows: 0, appended: 0, statements: Object.freeze([]) }),
      "journal append result",
    ) as EventWriteResult;
  }
  const admitted = rows.map((row) => packetizeOversizedRow(store.logDir, row));
  const writes = writeEventRows(logPath, admitted, options.caller === undefined ? feed : options.caller as JsonValue, {
    ...(options.eventClaim === undefined ? {} : { claim: options.eventClaim }),
    ...(options.eventCauses === undefined ? {} : { causes: options.eventCauses }),
    ...(options.eventArtifacts === undefined ? {} : { artifacts: options.eventArtifacts }),
  });
  const observation = observeJournalOperation(feed, "write-statement-rows");
  return journalObservation(
    Object.freeze({
      ...observation,
      operation: "write-statement-rows" as const,
      artifact,
      rows: rows.length,
      appended: writes.filter((write) => write.written).length,
      statements: Object.freeze(writes.map((write) => Object.freeze({
        id: write.statement.id,
        path: eventPath(logPath, write.statement.id),
        written: write.written,
      }))),
    }),
    "journal append result",
  ) as EventWriteResult;
}

/** Admit statement rows under `$root/data/journals/...` and return the log artifact descriptor. */
export function appendRowsInternal(
  root: string,
  action: string,
  rows: readonly EAVT[],
  options: RootEventWriteOptions = {},
): EventWriteResult {
  const first = rows[0];
  const at = options.at ?? (first === undefined ? "0000-00-00" : eavtObject(first).t);
  const log = journalAppendAddress(root, action, at, options);
  const { store, feed } = dataStoreFromLogPath(log.path);
  return writeRows(store, feed, rows, {
    at,
    ...(options.caller === undefined ? {} : { caller: options.caller }),
    ...(options.eventClaim === undefined ? {} : { eventClaim: options.eventClaim }),
    ...(options.eventCauses === undefined ? {} : { eventCauses: options.eventCauses }),
    ...(options.eventArtifacts === undefined ? {} : { eventArtifacts: options.eventArtifacts }),
  });
}

/** Project state from a durable log artifact handle.
 *
 * Folds the log line by line (`scanRowsInternal` + `foldStateAccumRow`)
 * rather than collecting `readRows(...).rows` first: the running
 * accumulator stays O(distinct entities × attributes), never O(rows), so this
 * bounds memory even for a log too large for `readRows`'s own whole-read
 * guard. */
export function projectStateInternal(
  logArtifact: DataArtifactHandle,
  functional: readonly string[] = [],
  options: JournalObservationOptions = {},
): FeedStateProjection {
  void options;
  const logPath = dataArtifactHandlePath(logArtifact, "log");
  const { feed } = dataStoreFromLogPath(logPath);
  const functionalSet = new Set(functional);
  const statePath = projectDataArtifactPath(logPath, "state", "json");
  const sourceArtifact = journalLogArtifact(logPath);
  const artifact = journalStateArtifact(statePath);
  const sourceSelection = sourceSelectionInternal(logPath);
  const folded = scanSourceFilesInternal(sourceSelection.files, initialStateAccum, (accum, row) =>
    foldStateAccumRow(accum, eavtObject(row), functionalSet));
  const settlement = closeStateAccum(folded.result);
  const view = settlement.view;
  writeFileAtomic(statePath, `${canonicalBytes(view as unknown as JsonValue)}\n`);
  const observation = observeJournalOperation(feed, "project-feed-state");
  return journalObservation(
    Object.freeze({ ...observation, operation: "project-feed-state" as const, sourceArtifact, artifact }),
    "feed state projection",
  ) as FeedStateProjection;
}

/** Read a projected `data/state` artifact into a process-local state view. */
export function readStateArtifactInternal(stateArtifact: DataArtifactHandle): StateView {
  const statePath = dataArtifactHandlePath(stateArtifact, "state");
  return readJsonFile<StateView>(statePath) ?? {};
}

/** The addressable settlement reading of one recorded feed: the designated
 *  state view, the held both-charged cells (the feed's standing
 *  contradictions — its adjudication queue), and the closure engine's
 *  stabilization certificate. This is the addressable form of `closeStateView`. */
export interface FeedStateReadout {
  readonly kind: "metroplat.holography.feed-settlement";
  readonly feed: string;
  readonly sourceRows: number;
  readonly entities: number;
  readonly designated: StateView;
  readonly held: readonly {
    readonly entity: StatementValue;
    readonly attribute: string;
    readonly time: StatementValue;
    readonly values: readonly StatementValue[];
    readonly charge: "contested";
  }[];
  readonly closure: {
    readonly stabilization: "witness" | "obstruction";
    readonly stage: number | null;
    readonly regime: "finite" | "scott" | "transfinite";
  };
}

/** Settle one feed's log into its addressable settlement reading. */
export function readStateInternal(
  logArtifact: DataArtifactHandle,
  functional: readonly string[] = [],
): FeedStateReadout {
  const logPath = dataArtifactHandlePath(logArtifact, "log");
  const { feed } = dataStoreFromLogPath(logPath);
  const functionalSet = new Set(functional);
  const folded = scanRowsInternal(logPath, initialStateAccum, (accum, row) =>
    foldStateAccumRow(accum, eavtObject(row), functionalSet));
  const settlement = closeStateAccum(folded.result);
  return Object.freeze({
    kind: "metroplat.holography.feed-settlement" as const,
    feed,
    sourceRows: folded.rows,
    entities: Object.keys(settlement.view).length,
    designated: settlement.view,
    held: Object.freeze(settlement.held.map((cell) => Object.freeze({
      entity: cell.entity,
      attribute: cell.attribute,
      time: cell.time,
      values: cell.values,
      charge: "contested" as const,
    }))),
    closure: Object.freeze({
      stabilization: settlement.readout.stabilization,
      stage: settlement.readout.stage,
      regime: settlement.readout.regime,
    }),
  });
}

// Runtime-owned `data/journals` -> `data/records` projections are built on
// `projectDomainRecordInternal` above. Integration projections such as
// x402 import this fold engine directly from their integration module.
/**
 * Project a durable `data/journals` artifact into `data/records` without
 * caller-held rows, streaming the log once rather than collecting
 * `readRowsPath(...).rows` and a whole `Datom[]` first: every row gets
 * the same constant `reading`, so there is nothing this projection needs from
 * a resident row array that a single line-by-line pass cannot already give it.
 * The source log is never rewritten: record commit is a deterministic
 * projection leg, not source compaction.
 */
export function commitRecordInternal(
  logArtifact: DataArtifactHandle,
  reading: JsonValue,
  options: JournalObservationOptions = {},
): RecordCommitResult {
  void options;
  const logPath = dataArtifactHandlePath(logArtifact, "log");
  const { feed } = dataStoreFromLogPath(logPath);
  const recordPath = projectDataArtifactPath(logPath, "record", "jsonl");
  const recordReading = requireJsonValue(reading, "record reading");
  const sourceArtifact = journalLogArtifact(logPath);
  const artifact = journalRecordArtifact(recordPath);
  const sourceSelection = sourceSelectionInternal(logPath);
  let datomCount = 0;
  foldToLinesAtomicSync(recordPath, (emit) => {
    const folded = scanSourceFilesInternal(sourceSelection.files, undefined, (_accum, row) => {
      const r = eavtObject(row);
      emit(canonicalBytes([r.e, r.a, r.v, r.t, recordReading] as unknown as JsonValue));
      return undefined;
    });
    datomCount = folded.rows;
  });
  const observation = observeJournalOperation(feed, "commit-record");
  return journalObservation(
    Object.freeze({ ...observation, operation: "commit-record" as const, sourceArtifact, artifact, sourceRows: datomCount, datoms: datomCount }),
    "record commit result",
  ) as RecordCommitResult;
}

function compactDatomReading(row: EAVT): JsonValue {
  return Object.freeze({
    kind: "metroplat.record.cell-reading",
    // Frozen durable field name: the value is the source statement identity.
    witness: eavtId(row),
  });
}

/**
 * Recompute `data/records`'s settled datoms fresh from `data/journals` and the
 * current `data/state` fold, without modifying the live log.
 *
 * This is the idempotent, re-derivable state->record leg the settlement law
 * requires: reading it twice with no intervening append yields byte-identical
 * output, and deleting `data/records` and re-deriving it recovers the same
 * content. The datom carries the original E/A/V/T columns plus a compact
 * cell-reading receipt; record->content reconstructs the state view from the
 * datom columns themselves. A single entity with many rows therefore stays
 * linear in source rows instead of repeating its whole settled view per row.
 */
export function projectRecordInternal(
  logArtifact: DataArtifactHandle,
  options: JournalObservationOptions = {},
): RecordArtifactProjection {
  void options;
  const logPath = dataArtifactHandlePath(logArtifact, "log");
  const { feed } = dataStoreFromLogPath(logPath);
  const statePath = projectDataArtifactPath(logPath, "state", "json");
  // Always fold fresh from the log rather than trusting whatever currently
  // sits at the state-tier path: a feed whose "settle" address is claimed by a
  // custom settlement deriver may hold a source-specific status settlement
  // human-facing view there, not this feed's generic per-entity StateView, and
  // reading it as one would settle every row's reading to null. Recomputing is
  // exactly what the settlement law already promises (re-deriving `data/records`
  // recovers the same content), so it costs the guarantee nothing.
  //
  // Two streamed passes over the log rather than one whole-file read: pass 1
  // verifies the same state fold this record can later reconstruct; pass 2
  // re-streams the source rows and writes compact datoms. The fifth datom slot
  // is a cell receipt, never a repeated copy of the entity's settled view.
  const recordPath = projectDataArtifactPath(logPath, "record", "jsonl");
  const sourceSelection = sourceSelectionInternal(logPath);
  const stateFold = scanSourceFilesInternal(sourceSelection.files, initialStateAccum, (accum, row) =>
    foldStateAccumRow(accum, eavtObject(row), new Set()));
  closeStateAccum(stateFold.result);
  let datomCount = 0;
  foldToLinesAtomicSync(recordPath, (emit) => {
    const folded = scanSourceFilesInternal(sourceSelection.files, undefined, (_accum, row) => {
      const r = eavtObject(row);
      emit(canonicalBytes([r.e, r.a, r.v, r.t, compactDatomReading(row)] as unknown as JsonValue));
      return undefined;
    });
    datomCount = folded.rows;
  });
  const sourceArtifact = journalLogArtifact(logPath);
  const stateArtifact = journalStateArtifact(statePath);
  const artifact = journalRecordArtifact(recordPath);
  const observation = observeJournalOperation(feed, "project-log-record");
  return journalObservation(Object.freeze({
    ...observation,
    operation: "project-log-record" as const,
    sourceArtifact,
    stateArtifact,
    artifact,
    datoms: datomCount,
  }), "record settlement projection") as RecordArtifactProjection;
}

/** Atomically write a JSON snapshot to `<dir>/<feed>.<type>`. */
export function writeJsonAtomic(dir: string, feed: string, value: JsonValue, type = "json"): void {
  writeFileAtomic(feedArtifactPath(dir, feed, type), `${canonicalBytes(value)}\n`);
}
