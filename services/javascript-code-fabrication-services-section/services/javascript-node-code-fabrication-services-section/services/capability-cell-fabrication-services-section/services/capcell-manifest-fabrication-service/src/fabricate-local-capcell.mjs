import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  admitNormalizedSemanticContent,
  identifyNormalizedSemanticContent,
} from "@red-cup-engineering/computer-code-engineering-services-section/semiotic-expression-notation/runtime";
import {
  EMPTY_WITNESS_ROOT,
} from "@red-cup-engineering/computer-content-address-engineering-services-section/semantic-content-identity";
import { jsonToTerm } from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/json-codec";
import { inferTy } from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/typing";

export const CAPCELL_PROFILE = "org.red-cup-engineering.capcell.v1";

// Facets are observations of the one cell's body, not a closed capability or
// protocol vocabulary. A cell may declare the evidence it actually has.
export const REQUIRED_BODY_FACETS = Object.freeze([]);

// These are capabilities. A conforming cell never implements them privately:
// it binds independently market-addressable CapCells satisfying this profile.
export const REQUIRED_PROVIDER_CAPABILITIES = Object.freeze([
  "source-repository-hosting",
  "package-publication",
  "deployment",
  "web-identity-publication",
  "smart-account-provisioning",
  "activitypub-offer-publication",
  "market-offer-discovery",
  "a2a-task-transport",
  "ocapn-grant",
  "ocapn-admission",
  "captp-session",
  "x402-clearing",
  "witness-journal-receipt-append",
  "behavioral-assay",
]);
export class CapCellSpecificationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CapCellSpecificationError";
    this.code = "CAPCELL_SPECIFICATION_INVALID";
  }
}

export class CapCellUnrealizedError extends Error {
  constructor(missing, manifest) {
    super(`CapCell is unrealized; missing closure: ${missing.join(", ")}`);
    this.name = "CapCellUnrealizedError";
    this.code = "CAPCELL_UNREALIZED";
    this.missing = Object.freeze([...missing]);
    this.manifest = manifest;
  }
}

export class CapCellIndependentConformanceRequiredError extends Error {
  constructor(manifest) {
    super("retired audit-theater error: CapCell completion is established by bound behavioral evidence, not reviewer authorship");
    this.name = "CapCellIndependentConformanceRequiredError";
    this.code = "CAPCELL_INDEPENDENT_CONFORMANCE_REQUIRED";
    this.manifest = manifest;
  }
}

function assertSemanticIdentity(candidate) {
  const expected = admitNormalizedSemanticContent(candidate.bytes, candidate.token ?? candidate.id);
  if (
    candidate.id !== expected.id
    || candidate.algorithm !== expected.algorithm
    || candidate.mediaType !== expected.mediaType
    || !Buffer.from(candidate.bytes).equals(expected.bytes)
  ) {
    throw new CapCellSpecificationError("semantic identity does not match its canonical SEN value");
  }
}

function identifyJson(objectKind, value) {
  const term = jsonToTerm(value);
  const semanticType = inferTy([], term);
  if (semanticType === null) {
    throw new CapCellSpecificationError(`${objectKind} does not derive an SEN semantic type`);
  }
  return identifyNormalizedSemanticContent({
    objectKind,
    semanticType,
    term,
    witnessRoot: EMPTY_WITNESS_ROOT,
  });
}

function nonempty(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new CapCellSpecificationError(`${field} must be a non-empty string`);
  }
  return value;
}

function exactKeys(value, allowed, field) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new CapCellSpecificationError(`${field} must be a plain record`);
  }
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extra.length) throw new CapCellSpecificationError(`${field} has unexpected fields: ${extra.join(", ")}`);
}

function ni(value, field) {
  const result = nonempty(value, field);
  if (!/^ni:\/\/\/sha-256;[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u.test(result)) {
    throw new CapCellSpecificationError(`${field} must be an RFC 6920 SHA-256 ni URI`);
  }
  return result;
}

function caip10(value, field) {
  const result = nonempty(value, field);
  if (!/^eip155:[0-9]+:0x[0-9a-f]{40}$/u.test(result)) {
    throw new CapCellSpecificationError(`${field} must be a lowercase EVM CAIP-10 account`);
  }
  return result;
}

function contained(value, field) {
  const result = nonempty(value, field);
  if (!result.startsWith("./") || result.includes("..")) {
    throw new CapCellSpecificationError(`${field} must be a contained relative path`);
  }
  return result;
}

function normalizeMaterial(source, index) {
  const field = `materials[${index}]`;
  exactKeys(source, ["package", "semanticId", "authority"], field);
  if (source.authority !== "none") {
    throw new CapCellSpecificationError(`${field} must declare authority \"none\"; effectful dependencies are provider CapCells`);
  }
  return Object.freeze({
    package: nonempty(source.package, `${field}.package`),
    semanticId: ni(source.semanticId, `${field}.semanticId`),
    authority: "none",
  });
}

export function normalizeCapCellSpecification(source) {
  exactKeys(source, ["profile", "identity", "package", "capability", "materials"], "specification");
  if (source.profile !== CAPCELL_PROFILE) {
    throw new CapCellSpecificationError(`profile must be ${CAPCELL_PROFILE}`);
  }
  exactKeys(source.identity, ["actor", "account"], "identity");
  const actor = nonempty(source.identity.actor, "identity.actor");
  if (!actor.startsWith("urn:")) throw new CapCellSpecificationError("identity.actor must be a stable URN");

  let packageIdentity;
  if (source.package !== undefined) {
    exactKeys(source.package, ["name", "version"], "package");
    const packageName = nonempty(source.package.name, "package.name");
    if (!/^@[a-z0-9-]+\/[a-z0-9-]+$/u.test(packageName)) {
      throw new CapCellSpecificationError("package.name must be a scoped npm package");
    }
    const version = nonempty(source.package.version, "package.version");
    if (!/^\d+\.\d+\.\d+$/u.test(version)) {
      throw new CapCellSpecificationError("package.version must be an exact semantic version");
    }
    packageIdentity = Object.freeze({name: packageName, version});
  }

  exactKeys(source.capability, [
    "operation", "law", "kernel", "inputSchema", "outputSchema", "refusalSchema",
  ], "capability");
  const operation = nonempty(source.capability.operation, "capability.operation");
  if (!/^[a-z][a-z0-9-]*$/u.test(operation)) {
    throw new CapCellSpecificationError("capability.operation must be lowercase kebab-case");
  }

  const materials = (source.materials ?? []).map(normalizeMaterial);
  const packages = materials.map((item) => item.package);
  if (new Set(packages).size !== packages.length) {
    throw new CapCellSpecificationError("materials must not repeat a package");
  }
  return Object.freeze({
    profile: CAPCELL_PROFILE,
    identity: Object.freeze({
      actor,
      account: caip10(source.identity.account, "identity.account"),
    }),
    ...(packageIdentity ? {package: packageIdentity} : {}),
    capability: Object.freeze({
      operation,
      law: ni(source.capability.law, "capability.law"),
      kernel: contained(source.capability.kernel, "capability.kernel"),
      inputSchema: contained(source.capability.inputSchema, "capability.inputSchema"),
      outputSchema: contained(source.capability.outputSchema, "capability.outputSchema"),
      refusalSchema: contained(source.capability.refusalSchema, "capability.refusalSchema"),
    }),
    materials: Object.freeze(materials),
  });
}

function normalizeProviderBinding(source, capability) {
  if (!source || Object.getPrototypeOf(source) !== Object.prototype) {
    throw new CapCellSpecificationError(`providers.${capability} must be a provider-cell binding`);
  }
  exactKeys(source, ["cell", "account", "operation", "law", "offer", "agentCard", "contract"], `providers.${capability}`);
  const cell = nonempty(source.cell, `providers.${capability}.cell`);
  if (!cell.startsWith("urn:")) throw new CapCellSpecificationError(`providers.${capability}.cell must be a stable URN`);
  return Object.freeze({
    cell,
    account: caip10(source.account, `providers.${capability}.account`),
    operation: nonempty(source.operation, `providers.${capability}.operation`),
    law: ni(source.law, `providers.${capability}.law`),
    offer: nonempty(source.offer, `providers.${capability}.offer`),
    agentCard: nonempty(source.agentCard, `providers.${capability}.agentCard`),
    contract: ni(source.contract, `providers.${capability}.contract`),
  });
}

function normalizeEvidence(source = {}) {
  exactKeys(source, ["body", "providers"], "evidence");
  const bodySource = source.body ?? {};
  const providersSource = source.providers ?? {};
  if (!bodySource || Object.getPrototypeOf(bodySource) !== Object.prototype) {
    throw new CapCellSpecificationError("evidence.body must be a plain record");
  }
  exactKeys(providersSource, REQUIRED_PROVIDER_CAPABILITIES, "evidence.providers");
  const body = Object.fromEntries(Object.entries(bodySource));
  const providers = Object.fromEntries(
    REQUIRED_PROVIDER_CAPABILITIES
      .filter((name) => providersSource[name] !== undefined)
      .map((name) => [name, normalizeProviderBinding(providersSource[name], name)]),
  );
  return Object.freeze({body: Object.freeze(body), providers: Object.freeze(providers)});
}

export function fabricateLocalCapCell(source, evidence = {}) {
  const specification = normalizeCapCellSpecification(source);
  const supplied = normalizeEvidence(evidence);
  const missingBody = REQUIRED_BODY_FACETS
    .filter((name) => supplied.body[name] === undefined)
    .map((name) => `body:${name}`);
  const missingProviders = REQUIRED_PROVIDER_CAPABILITIES
    .filter((name) => supplied.providers[name] === undefined)
    .map((name) => `provider:${name}`);
  const duplicateProviderCells = Object.entries(supplied.providers)
    .filter(([, binding], index, entries) => entries.findIndex(([, other]) => other.cell === binding.cell) !== index)
    .map(([capability]) => `provider:${capability}:shared-cell`);
  const missing = [...missingBody, ...missingProviders, ...duplicateProviderCells];
  const specificationIdentity = identifyJson("capcell.specification", specification);
  const manifestBody = {
    profile: CAPCELL_PROFILE,
    state: missing.length === 0 ? "realized" : "unrealized",
    specification: specificationIdentity.id,
    actor: specification.identity.actor,
    account: specification.identity.account,
    capability: specification.capability,
    ...(specification.package ? {package: specification.package} : {}),
    body: supplied.body,
    providers: supplied.providers,
    missing,
  };
  const manifestIdentity = identifyJson("capcell.manifest", manifestBody);
  return Object.freeze({
    specification,
    specificationIdentity,
    manifest: Object.freeze({ id: manifestIdentity.id, ...manifestBody }),
    manifestIdentity,
  });
}

export function assertCapCellComplete(bundle) {
  assertSemanticIdentity(bundle.specificationIdentity);
  assertSemanticIdentity(bundle.manifestIdentity);
  if (bundle.manifest.missing.length > 0) {
    throw new CapCellUnrealizedError(bundle.manifest.missing, bundle.manifest);
  }
  return bundle.manifest;
}

export async function writeLocalCapCellBundle(source, outputDirectory, evidence = {}) {
  const bundle = fabricateLocalCapCell(source, evidence);
  const directory = resolve(outputDirectory);
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(resolve(directory, "capcell.spec.cbor"), bundle.specificationIdentity.bytes),
    writeFile(resolve(directory, "capcell.manifest.cbor"), bundle.manifestIdentity.bytes),
    writeFile(
      resolve(directory, "capcell.manifest.json"),
      `${JSON.stringify(bundle.manifest, null, 2)}\n`,
      "utf8",
    ),
  ]);
  return bundle;
}
