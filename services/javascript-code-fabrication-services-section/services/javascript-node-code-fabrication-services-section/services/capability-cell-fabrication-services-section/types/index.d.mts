export interface CapCellSpecification {
  profile: "org.red-cup-engineering.capcell.v1";
  identity: { actor: string; account: string };
  package?: { name: string; version: string };
  capability: {
    operation: string;
    law: string;
    kernel: string;
    inputSchema: string;
    outputSchema: string;
    refusalSchema: string;
  };
  materials?: Array<{
    package: string;
    semanticId: string;
    authority: "none";
  }>;
}

export interface CapCellLineageSourcePin {
  uri: string;
  revision: string;
  sha256: string;
}

export interface CapCellLineage {
  sas: CapCellLineageSourcePin;
  hld: CapCellLineageSourcePin;
  lld: CapCellLineageSourcePin;
}

/** Versioned opt-in lineage gate; no upgrade of existing v1 cells is implied. */
export interface CapCellSpecificationV2 extends Omit<CapCellSpecification, "profile"> {
  profile: "org.red-cup-engineering.capcell.v2";
  lineage: CapCellLineage;
}
export type AnyCapCellSpecification = CapCellSpecification | CapCellSpecificationV2;

export interface ProviderCellBinding {
  cell: string;
  account: string;
  operation: string;
  law: string;
  offer: string;
  agentCard: string;
  contract: string;
}

export interface CapCellEvidence {
  body?: Record<string, unknown>;
  providers?: Record<string, ProviderCellBinding>;
}

export interface CapCellLineageReadRequest {
  kind: "sas" | "hld" | "lld";
  uri: string;
  revision: string;
}

/** The caller binds an authorized source provider; the fabricator checks bytes only. */
export type ReadCapCellLineage = (
  request: CapCellLineageReadRequest,
) => Promise<Uint8Array> | Uint8Array;

export declare const CAPCELL_PROFILE: "org.red-cup-engineering.capcell.v1";
export declare const CAPCELL_PROFILE_V2: "org.red-cup-engineering.capcell.v2";
export declare const LINEAGE_KINDS: readonly ["sas", "hld", "lld"];
export declare const REQUIRED_BODY_FACETS: readonly string[];
export declare const REQUIRED_PROVIDER_CAPABILITIES: readonly string[];

export declare class CapCellSpecificationError extends Error {
  code: "CAPCELL_SPECIFICATION_INVALID";
}
export declare class CapCellLineageReadError extends Error {
  code: "CAPCELL_LINEAGE_READ_FAILED";
  kind: "sas" | "hld" | "lld";
  reason: string;
}
export declare class CapCellUnrealizedError extends Error {
  code: "CAPCELL_UNREALIZED";
  missing: readonly string[];
  manifest: unknown;
}
export declare class CapCellIndependentConformanceRequiredError extends Error {
  code: "CAPCELL_INDEPENDENT_CONFORMANCE_REQUIRED";
}

export declare function normalizeCapCellSpecification(source: unknown): AnyCapCellSpecification;
export declare function fabricateLocalCapCell(
  source: unknown,
  evidence?: CapCellEvidence,
): unknown;
export declare function fabricateVerifiedCapCell(
  source: unknown,
  evidence?: CapCellEvidence,
  readLineage?: ReadCapCellLineage,
): Promise<unknown>;
export declare function assertCapCellComplete(bundle: unknown): unknown;
export declare function writeLocalCapCellBundle(
  source: unknown,
  outputDirectory: string,
  evidence?: CapCellEvidence,
  options?: {readLineage?: ReadCapCellLineage},
): Promise<unknown>;
