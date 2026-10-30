/** Filesystem persistence for journal events. */
import path from "node:path";
import {
  canonicalBytes,
  isIdentityWitness,
  parseArtifactRef,
  sha256Hex,
  verifyArtifact,
  type AddressedArtifact,
  type ArtifactRef,
  type ArtifactSource,
} from "../../lib/identity/index.mts";

import { parse, requireJsonValue, type JsonValue } from "../../lib/codecs/json/core.mts";
import { toEavt, eavtId, eavtObject, parse as parseEavt, type EAVT } from "../../lib/codecs/json/jsonl/eavt/index.mts";
import { tm, type Tm } from "@red-cup-engineering/relation-model-notation";
import {
  parseJournalWitness,
  journalWitness,
  type JournalWitness,
  type JournalObservation,
} from "../event.mts";
import {
  ensureDirectory,
  linkFileNew,
  pathExists,
  readFileUtf8,
  walkFiles,
  writeFileAtomicNew,
} from "../../lib/filesystem/index.mts";
import { isCausalWitness, type CausalObstruction } from "../judgment.mts";
import {
  evaluateWitnessDependencies,
  rebuildCausalSubstrate,
  type WitnessAdmissionState,
} from "../substrate.mts";
import { validateAddressedWitnessCore, type WitnessRef } from "../witness.mts";
import { artifactStoreRoot, receivedSearchRoot } from "../store-root.mts";

export type { JournalWitness };

export interface EventWrite {
  readonly statement: JournalWitness;
  readonly written: boolean;
  readonly admission: WitnessAdmissionState;
}

export interface EventAdmissionOptions {
  readonly claim?: Tm;
  readonly causes?: readonly string[];
  readonly artifacts?: readonly ArtifactSource[];
}

export interface EventRead {
  readonly statements: readonly JournalWitness[];
  readonly rows: readonly EAVT[];
  readonly verdicts: readonly JournalWitness[];
}

const alreadyExists = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { readonly code?: unknown }).code === "EEXIST";

export function eventDirectoryPath(logPath: string): string {
  return `${logPath}.statements`;
}

function digestSegment(id: string): string {
  const parsed = parseArtifactRef(id);
  if (!isIdentityWitness(parsed)) throw new TypeError(parsed.message);
  return parsed.value.digest;
}

export function eventPath(logPath: string, id: string): string {
  return path.join(eventDirectoryPath(logPath), "sha-256", `${digestSegment(id)}.json`);
}

function eventIndexDirectoryPath(logPath: string): string {
  return path.join(`${logPath}.index`, "statements", "sha-256");
}

function eventIndexPath(logPath: string, id: string): string {
  return path.join(eventIndexDirectoryPath(logPath), `${digestSegment(id)}.json`);
}

function causeIndexDirectoryPath(logPath: string, from: string): string {
  return path.join(`${logPath}.index`, "causes", "by-from", "sha-256", digestSegment(from));
}

function causeIndexPath(logPath: string, from: string, to: string): string {
  return path.join(causeIndexDirectoryPath(logPath, from), `${digestSegment(to)}.json`);
}

export function eventFiles(logPath: string): readonly string[] {
  return admittedReceivedFiles(logPath);
}

function receivedDirectoryPath(logPath: string): string {
  return path.join(eventDirectoryPath(logPath), "received", "sha-256");
}

function receivedPath(logPath: string, id: string): string {
  return path.join(receivedDirectoryPath(logPath), `${digestSegment(id)}.json`);
}

function stageReceivedWitness(logPath: string, statement: JournalWitness): void {
  indexReceivedWitness(logPath, statement);
  const serialized = `${canonicalBytes(statement as unknown as JsonValue)}\n`;
  const filePath = receivedPath(logPath, statement.id);
  try {
    writeFileAtomicNew(filePath, serialized);
  } catch (error) {
    if (!alreadyExists(error)) throw error;
    if (readFileUtf8(filePath) !== serialized) {
      throw new TypeError(`same received journal witness address has different bytes: ${statement.id}`);
    }
  }
}

interface ReceivedWitnessLocation {
  readonly filePath: string;
  readonly logPath: string;
  readonly statement: JournalWitness;
}

function receivedWitnesses(logPath: string): readonly ReceivedWitnessLocation[] {
  const searchRoot = receivedSearchRoot(logPath);
  const receivedMarker = `${path.sep}received${path.sep}sha-256${path.sep}`;
  const statementSuffix = ".statements";
  const locations: ReceivedWitnessLocation[] = [];
  for (const filePath of walkFiles(searchRoot, {
    includeFile: (name, fullPath) => name.endsWith(".json") && fullPath.includes(receivedMarker),
  })) {
    const statementAt = filePath.indexOf(`${statementSuffix}${receivedMarker}`);
    if (statementAt < 0) continue;
    locations.push(Object.freeze({
      filePath,
      logPath: filePath.slice(0, statementAt),
      statement: readEventFile(filePath),
    }));
  }
  return Object.freeze(locations.sort((left, right) => left.filePath.localeCompare(right.filePath)));
}

const CAUSAL_ADMISSION_INDEX_VERSION = 1;

function causalAdmissionIndexRoot(logPath: string): string {
  return path.join(artifactStoreRoot(logPath), "index", "causal-admission", `v${CAUSAL_ADMISSION_INDEX_VERSION}`);
}

function admittedIndexPath(logPath: string, id: string): string {
  return path.join(causalAdmissionIndexRoot(logPath), "admitted", "sha-256", `${digestSegment(id)}.json`);
}

function blockedIndexPath(logPath: string, id: string): string {
  return path.join(causalAdmissionIndexRoot(logPath), "blocked", "sha-256", `${digestSegment(id)}.json`);
}

function receivedLocationDirectory(logPath: string, id: string): string {
  return path.join(causalAdmissionIndexRoot(logPath), "received", "by-witness", "sha-256", digestSegment(id));
}

function dependentDirectory(logPath: string, dependency: string): string {
  return path.join(causalAdmissionIndexRoot(logPath), "dependents", "by-dependency", "sha-256", digestSegment(dependency));
}

function indexReadyPath(logPath: string): string {
  return path.join(causalAdmissionIndexRoot(logPath), "ready.json");
}

function writeImmutableJson(filePath: string, value: JsonValue): boolean {
  const serialized = `${canonicalBytes(value)}\n`;
  try {
    writeFileAtomicNew(filePath, serialized);
    return true;
  } catch (error) {
    if (!alreadyExists(error)) throw error;
    if (readFileUtf8(filePath) !== serialized) {
      throw new TypeError(`immutable causal-admission index entry has different bytes: ${filePath}`);
    }
    return false;
  }
}

function requiredReferences(statement: JournalWitness): readonly ArtifactRef[] {
  const references = new Set<ArtifactRef>([
    statement.core.articulation,
    ...statement.core.referencedArtifacts,
    ...statement.core.causes,
  ]);
  for (const source of statement.sources) {
    if (source.ref !== statement.id && source.ref !== statement.core.site) references.add(source.ref);
  }
  return Object.freeze([...references].sort());
}

/** Write reverse dependency and location entries before publishing the local
 * received witness. Once the migration marker exists, every durable received
 * witness is therefore discoverable from any dependency that can activate it. */
function indexReceivedWitness(logPath: string, statement: JournalWitness): void {
  const root = artifactStoreRoot(logPath);
  const relativeLogPath = path.relative(root, path.resolve(logPath));
  for (const dependency of requiredReferences(statement)) {
    writeImmutableJson(
      path.join(dependentDirectory(logPath, dependency), `${digestSegment(statement.id)}.json`),
      Object.freeze({
        kind: "metroplat.journal.causal-dependent-index",
        version: CAUSAL_ADMISSION_INDEX_VERSION,
        dependency,
        witness: statement.id,
      }) as unknown as JsonValue,
    );
  }
  writeImmutableJson(
    path.join(receivedLocationDirectory(logPath, statement.id), `${sha256Hex(relativeLogPath)}.json`),
    Object.freeze({
      kind: "metroplat.journal.received-location-index",
      version: CAUSAL_ADMISSION_INDEX_VERSION,
      witness: statement.id,
      logPath: relativeLogPath,
    }) as unknown as JsonValue,
  );
}

function receivedLocationsFor(logPath: string, id: WitnessRef): readonly ReceivedWitnessLocation[] {
  const directory = receivedLocationDirectory(logPath, id);
  if (!pathExists(directory)) return Object.freeze([]);
  const root = artifactStoreRoot(logPath);
  const locations: ReceivedWitnessLocation[] = [];
  for (const filePath of walkFiles(directory, { includeFile: (name) => name.endsWith(".json") })) {
    const value = parse(readFileUtf8(filePath));
    if (value === null || Array.isArray(value) || typeof value !== "object") continue;
    const record = value as Readonly<Record<string, JsonValue>>;
    if (record["kind"] !== "metroplat.journal.received-location-index"
      || record["version"] !== CAUSAL_ADMISSION_INDEX_VERSION
      || record["witness"] !== id
      || typeof record["logPath"] !== "string") continue;
    const receivedLogPath = path.resolve(root, record["logPath"]);
    if (path.resolve(artifactStoreRoot(receivedLogPath)) !== path.resolve(root)) continue;
    const receivedFilePath = receivedPath(receivedLogPath, id);
    if (!pathExists(receivedFilePath)) continue;
    const statement = readEventFile(receivedFilePath);
    if (statement.id !== id) throw new TypeError(`received-location index points at a different witness: ${id}`);
    locations.push(Object.freeze({ filePath: receivedFilePath, logPath: receivedLogPath, statement }));
  }
  return Object.freeze(locations.sort((left, right) => left.filePath.localeCompare(right.filePath)));
}

function dependentWitnesses(logPath: string, dependency: ArtifactRef): readonly WitnessRef[] {
  const directory = dependentDirectory(logPath, dependency);
  if (!pathExists(directory)) return Object.freeze([]);
  const references: WitnessRef[] = [];
  for (const filePath of walkFiles(directory, { includeFile: (name) => name.endsWith(".json") })) {
    const digest = path.basename(filePath, ".json");
    const reference = `metroplat:artifact:1:rfc8785-jcs:sha-256:${digest}` as ArtifactRef;
    const parsed = parseArtifactRef(reference);
    if (isIdentityWitness(parsed)) references.push(reference as WitnessRef);
  }
  return Object.freeze([...new Set(references)].sort());
}

function publishStatement(logPath: string, sourcePath: string, statement: JournalWitness): EventWrite {
  const filePath = eventPath(logPath, statement.id);
  const serialized = `${canonicalBytes(statement as unknown as JsonValue)}\n`;
  try {
    linkFileNew(sourcePath, filePath);
    return Object.freeze({ statement, written: true, admission: "admitted" as const });
  } catch (error) {
    if (!alreadyExists(error)) throw error;
    if (readFileUtf8(filePath) !== serialized) {
      throw new TypeError(`same journal witness address has different persisted bytes: ${statement.id}`);
    }
    return Object.freeze({ statement, written: false, admission: "admitted" as const });
  }
}

function markAdmitted(logPath: string, sourcePath: string, statement: JournalWitness): boolean {
  const filePath = admittedIndexPath(logPath, statement.id);
  try {
    linkFileNew(sourcePath, filePath);
    return true;
  } catch (error) {
    if (!alreadyExists(error)) throw error;
    const existing = readEventFile(filePath);
    if (existing.id !== statement.id) {
      throw new TypeError(`admitted causal index contains a different witness: ${statement.id}`);
    }
    return false;
  }
}

function markBlocked(logPath: string, id: WitnessRef, obstruction: CausalObstruction): boolean {
  return writeImmutableJson(blockedIndexPath(logPath, id), Object.freeze({
    kind: "metroplat.journal.blocked-witness-index",
    version: CAUSAL_ADMISSION_INDEX_VERSION,
    witness: id,
    obstruction,
  }) as unknown as JsonValue);
}

/** Backfill the rebuildable reverse index once for roots written by the prior
 * whole-corpus admission path. New writers index before publishing received
 * witnesses, so an object arriving concurrently with this scan cannot fall
 * behind the completion marker. Existing admitted hard links become the
 * authoritative root-global admitted markers used by incremental closure. */
function ensureCausalAdmissionIndex(logPath: string): void {
  const ready = indexReadyPath(logPath);
  if (pathExists(ready)) return;
  const receivedSet = receivedWitnesses(logPath);
  for (const received of receivedSet) {
    indexReceivedWitness(received.logPath, received.statement);
  }
  const rebuilt = rebuildCausalSubstrate(readArtifactSources(logPath));
  if (!isCausalWitness(rebuilt)) throw new TypeError(rebuilt.message);
  for (const received of receivedSet) {
    const state = rebuilt.value.witnessState(received.statement.id);
    if (state === "admitted") {
      markAdmitted(logPath, received.filePath, received.statement);
    } else if (state === "blocked") {
      const obstruction = rebuilt.value.obstruction(received.statement.id);
      if (obstruction !== undefined) markBlocked(logPath, received.statement.id, obstruction);
    }
  }
  writeImmutableJson(ready, Object.freeze({
    kind: "metroplat.journal.causal-admission-index",
    version: CAUSAL_ADMISSION_INDEX_VERSION,
    source: "received-witnesses-and-exact-artifacts",
  }) as unknown as JsonValue);
}

function indexedWitnessState(logPath: string, reference: WitnessRef): WitnessAdmissionState {
  if (pathExists(admittedIndexPath(logPath, reference))) return "admitted";
  if (pathExists(blockedIndexPath(logPath, reference))) return "blocked";
  return receivedLocationsFor(logPath, reference).length > 0 ? "quarantined" : "not-witness";
}

function artifactPath(logPath: string, ref: ArtifactRef): string {
  return path.join(artifactStoreRoot(logPath), "objects", "rfc8785-jcs", "sha-256", `${digestSegment(ref)}.json`);
}

function readAddressedArtifact(logPath: string, ref: ArtifactRef): AddressedArtifact | undefined {
  const filePath = artifactPath(logPath, ref);
  if (!pathExists(filePath)) return undefined;
  const verified = verifyArtifact(ref, readFileUtf8(filePath));
  if (!isIdentityWitness(verified)) {
    throw new TypeError(`corrupt journal artifact ${ref}: ${verified.message}`);
  }
  return verified.value;
}

/** Resolve and verify one exact object from the journal's authoritative store. */
export function readArtifactSource(logPath: string, ref: ArtifactRef): ArtifactSource | undefined {
  const artifact = readAddressedArtifact(logPath, ref);
  return artifact === undefined ? undefined : Object.freeze({ ref, canonicalText: artifact.canonical.text });
}

function writeArtifactSource(logPath: string, artifact: ArtifactSource): void {
  const verified = verifyArtifact(artifact.ref, artifact.canonicalText);
  if (!isIdentityWitness(verified)) {
    throw new TypeError(`journal referenced artifact ${artifact.ref}: ${verified.message}`);
  }
  const canonicalText = verified.value.canonical.text;
  const filePath = artifactPath(logPath, artifact.ref);
  try {
    writeFileAtomicNew(filePath, canonicalText);
  } catch (error) {
    if (!alreadyExists(error)) throw error;
    if (readFileUtf8(filePath) !== canonicalText) {
      throw new TypeError(`same artifact address has different persisted bytes: ${artifact.ref}`);
    }
  }
}

/** Whole-source reconstruction is reserved for rebuilding the derived causal
 * admission index when its completion marker is absent. Ordinary appends use
 * dependency-shaped reads and never call this root-global verifier. */
function readArtifactSources(logPath: string): readonly ArtifactSource[] {
  const directory = path.join(artifactStoreRoot(logPath), "objects", "rfc8785-jcs", "sha-256");
  if (!pathExists(directory)) return Object.freeze([]);
  const sources: ArtifactSource[] = [];
  for (const filePath of walkFiles(directory, { includeFile: (name) => name.endsWith(".json") })) {
    const digest = path.basename(filePath, ".json");
    const ref = `metroplat:artifact:1:rfc8785-jcs:sha-256:${digest}` as ArtifactRef;
    const artifact = readAddressedArtifact(logPath, ref);
    if (artifact !== undefined) sources.push(Object.freeze({ ref, canonicalText: artifact.canonical.text }));
  }
  return Object.freeze(sources.sort((left, right) => left.ref.localeCompare(right.ref)));
}

function writeStatementIndex(logPath: string, statement: JournalWitness, written: boolean): void {
  ensureDirectory(eventIndexDirectoryPath(logPath));
  try {
    writeFileAtomicNew(eventIndexPath(logPath, statement.id), `${canonicalBytes(Object.freeze({
      id: statement.id,
      causes: statement.core.causes,
      written,
    }) as unknown as JsonValue)}\n`);
  } catch (error) {
    if (!alreadyExists(error)) throw error;
  }
  for (const cause of statement.core.causes) {
    ensureDirectory(causeIndexDirectoryPath(logPath, cause));
    try {
      writeFileAtomicNew(causeIndexPath(logPath, cause, statement.id), `${canonicalBytes(Object.freeze({
        from: cause,
        to: statement.id,
      }) as unknown as JsonValue)}\n`);
    } catch (error) {
      if (!alreadyExists(error)) throw error;
    }
  }
}

export function readEventFile(filePath: string): JournalWitness {
  return parseJournalWitness(parse(readFileUtf8(filePath)));
}

/** Read a present exact witness. Corruption is an explicit integrity failure. */
export function tryReadEventFile(filePath: string): JournalWitness | undefined {
  if (!pathExists(filePath)) return undefined;
  return readEventFile(filePath);
}

function admittedReceivedFiles(logPath: string): readonly string[] {
  ensureCausalAdmissionIndex(logPath);
  const directory = receivedDirectoryPath(logPath);
  if (!pathExists(directory)) return Object.freeze([]);
  return Object.freeze(walkFiles(directory, { includeFile: (name) => name.endsWith(".json") })
    .filter((filePath) => {
      const statement = readEventFile(filePath);
      if (!pathExists(admittedIndexPath(logPath, statement.id))) return false;
      const write = publishStatement(logPath, filePath, statement);
      writeStatementIndex(logPath, statement, write.written);
      return true;
    })
    .sort((left, right) => left.localeCompare(right)));
}

export function readEvents(logPath: string): readonly JournalWitness[] {
  const statements: JournalWitness[] = [];
  for (const filePath of admittedReceivedFiles(logPath)) {
    const statement = tryReadEventFile(filePath);
    if (statement !== undefined) statements.push(statement);
  }
  return Object.freeze(statements.sort((left, right) => left.id.localeCompare(right.id)));
}

export function readEventsAsOf(logPath: string, frontier: readonly string[]): readonly JournalWitness[] {
  const byId = new Map<string, JournalWitness>(readEvents(logPath).map((statement) => [statement.id, statement]));
  const selected = new Map<string, JournalWitness>();
  const visit = (id: string): void => {
    if (selected.has(id)) return;
    const statement = byId.get(id);
    if (statement === undefined) return;
    selected.set(id, statement);
    for (const cause of statement.core.causes) visit(cause);
  };
  for (const id of frontier) visit(id);
  return Object.freeze([...selected.values()].sort((left, right) => left.id.localeCompare(right.id)));
}

export function eventForRow(row: EAVT, seat: JsonValue, options: EventAdmissionOptions = {}): JournalWitness {
  const { t } = eavtObject(row);
  const referencedArtifacts = options.artifacts?.map((artifact) => artifact.ref) ?? [];
  return journalWitness(Object.freeze({
    kind: "metroplat.journal.observation" as const,
    seat,
    claim: options.claim ?? tm.mark("metroplat.eavt.row"),
    address: tm.mark(eavtId(row)),
    time: String(t),
    causes: Object.freeze([...(options.causes ?? [])].sort()),
    payload: row as unknown as JsonValue,
    ...(referencedArtifacts.length === 0 ? {} : { referencedArtifacts: Object.freeze(referencedArtifacts) }),
  }) satisfies JournalObservation);
}

export function verdictEvent(input: {
  readonly seat: JsonValue;
  readonly reason: string;
  readonly address: string;
  readonly time: string;
  readonly evidence: JsonValue;
  readonly causes?: readonly string[];
}): JournalWitness {
  return journalWitness(Object.freeze({
    kind: "metroplat.journal.observation" as const,
    seat: input.seat,
    claim: tm.mark(`metroplat.journal.inadmissible.${input.reason}`),
    address: tm.mark(input.address),
    time: input.time,
    causes: Object.freeze([...(input.causes ?? [])].sort()),
    payload: Object.freeze({
      kind: "metroplat.journal.inadmissibility-verdict",
      reason: input.reason,
      evidence: input.evidence,
      charge: "contested",
    }) as JsonValue,
  }) satisfies JournalObservation);
}

export function admitEvents(
  logPath: string,
  statements: readonly JournalWitness[],
  artifacts: readonly ArtifactSource[] = [],
): readonly EventWrite[] {
  ensureDirectory(path.join(eventDirectoryPath(logPath), "sha-256"));
  ensureDirectory(receivedDirectoryPath(logPath));
  ensureDirectory(eventIndexDirectoryPath(logPath));
  ensureCausalAdmissionIndex(logPath);

  for (const statement of statements) {
    parseJournalWitness(statement);
    stageReceivedWitness(logPath, statement);
  }
  const available = new Set<ArtifactRef>();
  for (const artifact of artifacts) {
    writeArtifactSource(logPath, artifact);
    available.add(artifact.ref);
  }
  for (const statement of statements) {
    for (const artifact of statement.sources) {
      writeArtifactSource(logPath, artifact);
      available.add(artifact.ref);
    }
  }

  const artifactCache = new Map<ArtifactRef, AddressedArtifact | undefined>();
  const artifactAt = (reference: ArtifactRef): AddressedArtifact | undefined => {
    if (!artifactCache.has(reference)) artifactCache.set(reference, readAddressedArtifact(logPath, reference));
    return artifactCache.get(reference);
  };
  const queue: WitnessRef[] = [];
  const queued = new Set<WitnessRef>();
  const enqueue = (reference: WitnessRef): void => {
    if (queued.has(reference)) return;
    queued.add(reference);
    queue.push(reference);
  };
  const enqueueDependents = (dependency: ArtifactRef): void => {
    for (const dependent of dependentWitnesses(logPath, dependency)) enqueue(dependent);
  };
  for (const statement of statements) enqueue(statement.id);
  for (const reference of available) enqueueDependents(reference);

  const newlyAdmitted = new Set<WitnessRef>();
  while (queue.length > 0) {
    const reference = queue.shift()!;
    queued.delete(reference);
    const locations = receivedLocationsFor(logPath, reference);
    if (locations.length === 0) continue;
    const statement = locations[0]!.statement;
    const priorState = indexedWitnessState(logPath, reference);
    if (priorState === "blocked") continue;
    if (priorState === "admitted") {
      for (const received of locations) {
        const write = publishStatement(received.logPath, received.filePath, statement);
        writeStatementIndex(received.logPath, statement, write.written);
      }
      continue;
    }

    const coreArtifact = artifactAt(reference);
    if (coreArtifact === undefined) continue;
    const core = validateAddressedWitnessCore(coreArtifact.canonical);
    if (!isCausalWitness(core)) {
      if (markBlocked(logPath, reference, core)) enqueueDependents(reference);
      continue;
    }
    const evaluation = evaluateWitnessDependencies(core.value, {
      artifact: artifactAt,
      witnessState: (cause) => indexedWitnessState(logPath, cause),
    });
    if (evaluation.obstruction !== undefined) {
      if (markBlocked(logPath, reference, evaluation.obstruction)) enqueueDependents(reference);
      continue;
    }
    if (evaluation.missing.length > 0) continue;

    const admittedNow = markAdmitted(logPath, locations[0]!.filePath, statement);
    for (const received of locations) {
      const write = publishStatement(received.logPath, received.filePath, statement);
      writeStatementIndex(received.logPath, statement, write.written);
    }
    if (admittedNow) {
      newlyAdmitted.add(reference);
      enqueueDependents(reference);
    }
  }

  return Object.freeze(statements.map((statement) => Object.freeze({
    statement,
    written: newlyAdmitted.has(statement.id),
    admission: indexedWitnessState(logPath, statement.id),
  })));
}

function evidenceJson(value: unknown, message: string): JsonValue {
  try {
    return Object.freeze({ message, value: requireJsonValue(value, "inadmissible statement evidence") }) as JsonValue;
  } catch {
    return Object.freeze({ message, value: String(value) }) as JsonValue;
  }
}

function coreTime(value: unknown): string {
  return typeof value === "object"
    && value !== null
    && typeof (value as { readonly time?: unknown }).time === "string"
    && (value as { readonly time: string }).time.length > 0
    ? (value as { readonly time: string }).time
    : "0000-00-00T00:00:00.000Z";
}

export function admitJournalObservations(logPath: string, cores: readonly unknown[], seat: JsonValue): readonly EventWrite[] {
  const statements = cores.map((core) => {
    try {
      return journalWitness(core as JournalObservation);
    } catch (error) {
      const text = (() => {
        try {
          return canonicalBytes(requireJsonValue(core, "inadmissible statement core"));
        } catch {
          return String(core);
        }
      })();
      return verdictEvent({
        seat,
        reason: "untyped-statement",
        address: `inadmissible:${eavtId(toEavt({
          e: "metroplat.journal.inadmissible",
          a: "statement-core",
          v: text,
          t: coreTime(core),
        }))}`,
        time: coreTime(core),
        evidence: evidenceJson(core, error instanceof Error ? error.message : "statement core failed admission"),
      });
    }
  });
  return admitEvents(logPath, statements);
}

export function writeRows(logPath: string, rows: readonly EAVT[], seat: JsonValue, options: EventAdmissionOptions = {}): readonly EventWrite[] {
  return admitEvents(logPath, rows.map((row) => eventForRow(row, seat, options)), options.artifacts);
}

function rowFromStatement(statement: JournalWitness): EAVT | undefined {
  const payload = statement.observation.payload;
  if (!Array.isArray(payload)) return undefined;
  try {
    return toEavt(eavtObject(payload as unknown as EAVT));
  } catch {
    return undefined;
  }
}

export function readEventRows(logPath: string): EventRead {
  const statements = readEvents(logPath);
  return rowsOfStatements(statements);
}

export function readEventRowsAsOf(logPath: string, frontier: readonly string[]): EventRead {
  return rowsOfStatements(readEventsAsOf(logPath, frontier));
}

function rowsOfStatements(statements: readonly JournalWitness[]): EventRead {
  const rows: EAVT[] = [];
  const verdicts: JournalWitness[] = [];
  for (const statement of statements) {
    const row = rowFromStatement(statement);
    if (row === undefined) verdicts.push(statement);
    else rows.push(row);
  }
  return Object.freeze({ statements, rows: Object.freeze(rows), verdicts: Object.freeze(verdicts) });
}

function* statementFileStream(logPath: string): Generator<string> {
  yield* admittedReceivedFiles(logPath);
}

export function foldEventRows<Acc>(
  logPath: string,
  init: Acc,
  step: (accumulator: Acc, row: EAVT) => Acc,
): { readonly result: Acc; readonly rows: number; readonly malformed: number } {
  let result = init;
  let rows = 0;
  let malformed = 0;
  for (const filePath of statementFileStream(logPath)) {
    const statement = tryReadEventFile(filePath);
    if (statement === undefined) {
      malformed += 1;
      continue;
    }
    const row = rowFromStatement(statement);
    if (row === undefined) {
      malformed += 1;
      continue;
    }
    result = step(result, row);
    rows += 1;
  }
  return Object.freeze({ result, rows, malformed });
}

export function parseLegacyLineAsEvents(line: string, seat: JsonValue, time: string, address: string): readonly JournalWitness[] {
  try {
    return Object.freeze(parseEavt(line).map((row) => eventForRow(row, seat)));
  } catch (error) {
    return Object.freeze([verdictEvent({
      seat,
      reason: "malformed-line",
      address,
      time,
      evidence: Object.freeze({
        line,
        message: error instanceof Error ? error.message : "unreadable legacy line",
      }) as JsonValue,
    })]);
  }
}
