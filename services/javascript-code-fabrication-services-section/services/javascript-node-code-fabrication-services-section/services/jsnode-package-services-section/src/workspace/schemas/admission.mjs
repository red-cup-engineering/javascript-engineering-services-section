/**
 * @packageDocumentation
 *
 * schemas/admission - schema contracts for package-phase host marks.
 *
 * `src/workspace/schemas/admission` admits host material that has already crossed into the Node
 * package as text or JSON. These schemas are the package-realized receipts:
 * accepted material becomes a schema-contracted value, rejected material remains
 * a carried failure value. Filesystem discovery and process lifecycle stay in
 * services, not here.
 */

import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";

/** A package manifest host mark admitted into the package phase. */
export const packageManifestAdmissionSchema = {
  $id: "metroplat/admission/package-manifest",
  type: "object",
  required: ["kind", "source", "manifest"],
  properties: {
    kind: { const: "metroplat.admission.package-manifest" },
    source: { type: "string", minLength: 1 },
    manifest: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string", minLength: 1 },
        version: { type: "string" },
        type: { type: "string" },
        private: { type: "boolean" },
        packageManager: { type: "string" },
        main: { type: "string" },
        types: { type: "string" },
        exports: {},
        bin: {},
        scripts: { type: "object" },
        dependencies: { type: "object" },
        devDependencies: { type: "object" },
        peerDependencies: { type: "object" },
        optionalDependencies: { type: "object" },
      },
      additionalProperties: true,
    },
  },
  title: "Package manifest admission",
  description: "A host package manifest admitted as package-phase material.",
  additionalProperties: false,
};

/** A failed admission attempt, kept as data instead of control flow. */
export const admissionFailureSchema = {
  $id: "metroplat/admission/failure",
  type: "object",
  required: ["kind", "source", "reason"],
  properties: {
    kind: { const: "metroplat.admission.failure" },
    source: { type: "string", minLength: 1 },
    reason: { type: "string", minLength: 1 },
  },
  title: "Admission failure",
  description: "A package-phase host mark that did not satisfy the admission schema.",
  additionalProperties: false,
};

export const packageManifestAdmissionContract = schemaFrom(packageManifestAdmissionSchema);
export const admissionFailureContract = schemaFrom(admissionFailureSchema);

/** A `pnpm-workspace.yaml` host mark admitted into the package phase. */
export const workspaceDeclarationAdmissionSchema = {
  $id: "metroplat/admission/workspace-declaration",
  type: "object",
  required: ["kind", "source", "packages"],
  properties: {
    kind: { const: "metroplat.admission.workspace-declaration" },
    source: { type: "string", minLength: 1 },
    /** Glob patterns naming member package directories, relative to the workspace root. */
    packages: { type: "array", items: { type: "string", minLength: 1 } },
    linkWorkspacePackages: { type: "boolean" },
    preferWorkspacePackages: { type: "boolean" },
  },
  title: "Workspace declaration admission",
  description: "A host pnpm-workspace.yaml admitted as package-phase material.",
  additionalProperties: false,
};

export const workspaceDeclarationAdmissionContract = schemaFrom(workspaceDeclarationAdmissionSchema);

const pnpmDependencyUseSchema = {
  type: "object",
  required: ["name", "field", "specifier", "version", "workspaceLink"],
  properties: {
    name: { type: "string", minLength: 1 },
    /** Which manifest field pnpm resolved this dependency under. */
    field: { enum: ["dependencies", "devDependencies", "optionalDependencies"] },
    specifier: { type: "string" },
    version: { type: "string" },
    /** True when the resolved `version` is a `link:` target — a proven workspace edge. */
    workspaceLink: { type: "boolean" },
  },
  additionalProperties: false,
};

const pnpmLockfileImporterSchema = {
  type: "object",
  required: ["path", "dependencies"],
  properties: {
    /** Importer key from the lockfile: `.` for the workspace root, else a workspace-relative path. */
    path: { type: "string", minLength: 1 },
    dependencies: { type: "array", items: pnpmDependencyUseSchema },
  },
  additionalProperties: false,
};

/** A `pnpm-lock.yaml` `importers:` subtree, admitted into the package phase.
 *  Only the importers section is admitted — the `packages:`/`snapshots:`
 *  registry-resolution sections are outside this codec's accepted
 *  representation (see `codecs/text/pnpm-lockfile`). */
export const pnpmLockfileAdmissionSchema = {
  $id: "metroplat/admission/pnpm-lockfile",
  type: "object",
  required: ["kind", "source", "lockfileVersion", "importers"],
  properties: {
    kind: { const: "metroplat.admission.pnpm-lockfile" },
    source: { type: "string", minLength: 1 },
    lockfileVersion: { type: "string", minLength: 1 },
    importers: { type: "array", items: pnpmLockfileImporterSchema },
  },
  title: "pnpm lockfile importers admission",
  description: "A host pnpm-lock.yaml importers subtree admitted as package-phase material.",
  additionalProperties: false,
};

export const pnpmLockfileAdmissionContract = schemaFrom(pnpmLockfileAdmissionSchema);
