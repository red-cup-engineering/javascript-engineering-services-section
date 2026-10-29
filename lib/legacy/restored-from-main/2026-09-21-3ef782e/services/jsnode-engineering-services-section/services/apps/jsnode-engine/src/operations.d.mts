export type PackageOperationOrigin = Readonly<{
  address: string;
  packageName: string;
  packageVersion: string;
}>;

export type BoundPackageOperation = Readonly<{
  identity: string;
  operation: import("@red-cup-engineering/computer-platform/operations").Operation;
  origin: PackageOperationOrigin;
  path: string;
  exportName: string;
  description: string | null;
  inputSchema: Readonly<Record<string, unknown>> | null;
  outputSchema: Readonly<Record<string, unknown>> | null;
  run: (input: unknown) => unknown | Promise<unknown>;
}>;

export function readJsnodeOperationArguments(input: Readonly<{
  text: string;
  path: string;
  inputSchema?: unknown;
  outputSchema?: unknown;
}>): object;

/**
 * Reads only FERN-admitted operations whose installed package identity and
 * declared contract still match the flatfile. Package loading is delayed until
 * those checks have passed.
 */
export function readBoundPackageOperations(input: Readonly<{
  fernPath: string;
  operationsRoot: string;
}>): Promise<readonly BoundPackageOperation[]>;

/** Validate and append receipt-derived package facts to an EAVT catalog. */
export function admitFabricationReceipt(input: Readonly<{ flatfilePath: string; receiptPath: string; workingDirectory?: string }>): Promise<Readonly<{ address: string; rows: number }>>;
/** Match a supplied resource against catalogued package contracts without loading packages. */
export function inspectPackageResource(input: Readonly<{ fernPath: string; resource: Readonly<{ path: string; content: string }> }>): Promise<Readonly<{ resource: Readonly<{ path: string; content: string }>; classification: object; operations: readonly object[] }>>;
