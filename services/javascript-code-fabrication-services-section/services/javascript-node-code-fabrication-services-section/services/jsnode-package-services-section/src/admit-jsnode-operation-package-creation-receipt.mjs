#!/usr/bin/env node
import path, { isAbsolute as isAbsoluteFilepath } from "node:path";
import { freezeJson } from "@red-cup-engineering/json-services-section";
import { isJsonValue } from "@red-cup-engineering/json-services-section";
import { admitRelativePosixFilepath } from "@red-cup-engineering/computer-filepath-engineering-services-section/admit-relative-posix-filepath";

class ReceiptRefusal extends Error {
  constructor(code, message, refusedPath = null) {
    super(message);
    this.code = code;
    this.refusedPath = refusedPath;
  }
}

function refuse(code, message, refusedPath = null) {
  throw new ReceiptRefusal(code, message, refusedPath);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys, context) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    refuse("UNEXPECTED_FIELDS", `${context} must carry exactly: ${expected.join(", ")}`);
  }
}

function digest(value, context) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value)) refuse("INVALID_DIGEST", `${context} must be a lowercase SHA-256 digest`);
  return value;
}

function materializations(value) {
  if (!Array.isArray(value) || value.length === 0) refuse("INVALID_FILES", "files must be a nonempty array of TextFileMaterialization records");
  const admitted = [];
  let previousPath = null;
  for (const candidate of value) {
    if (!isRecord(candidate)) refuse("INVALID_FILE", "each file must be a TextFileMaterialization record");
    exactKeys(candidate, ["type", "version", "path", "mode", "digest"], "file");
    if (candidate.type !== "TextFileMaterialization" || candidate.version !== 1) refuse("INVALID_FILE", "file type and version must be TextFileMaterialization@1");
    let filePath;
    try {
      filePath = admitRelativePosixFilepath(candidate.path);
    } catch {
      refuse("INVALID_FILE_PATH", "file path must be a normalized relative POSIX filepath", typeof candidate.path === "string" ? candidate.path : null);
    }
    if (previousPath !== null && previousPath.localeCompare(filePath) >= 0) refuse("NONCANONICAL_FILE_ORDER", "file paths must be unique and strictly ordered", filePath);
    if (candidate.mode !== 0o644 && candidate.mode !== 0o755) refuse("INVALID_FILE_MODE", "file mode must be 0644 or 0755", filePath);
    admitted.push({ ...candidate, path: filePath, digest: digest(candidate.digest, `file ${filePath} digest`) });
    previousPath = filePath;
  }
  return admitted;
}

const assayFields = Object.freeze({
  "staged-dependency-installation": ["type", "version", "name", "status"],
  syntax: ["type", "version", "name", "status"],
  tests: ["type", "version", "name", "status", "paths"],
  pack: ["type", "version", "name", "status", "filename", "digest"],
  "clean-installation": ["type", "version", "name", "status", "javascriptFiles", "reachableJavascriptFiles"],
  "import-face": ["type", "version", "name", "status", "examples"],
  "command-face": ["type", "version", "name", "status", "examples"],
  help: ["type", "version", "name", "status"],
});

function assays(value) {
  if (!Array.isArray(value)) refuse("INVALID_ASSAYS", "assays must be an array");
  const required = ["syntax", "tests", "pack", "clean-installation", "import-face"];
  const names = value.map((candidate) => candidate?.name);
  const offset = names[0] === "staged-dependency-installation" ? 1 : 0;
  const trailing = names.slice(offset + required.length);
  if (names.length < offset + required.length ||
      names.slice(offset, offset + required.length).some((name, index) => name !== required[index]) ||
      !(trailing.length === 0 || (trailing.length === 2 && trailing[0] === "command-face" && trailing[1] === "help"))) {
    refuse("INCOMPLETE_ASSAYS", "assays must carry required module evidence and, when a catalog command exists, command and help evidence");
  }
  return value.map((candidate) => {
    if (!isRecord(candidate) || !Object.hasOwn(assayFields, candidate.name)) refuse("INVALID_ASSAY", "each assay must be a known JsnodeOperationPackageAssay record");
    exactKeys(candidate, assayFields[candidate.name], `assay ${candidate.name}`);
    if (candidate.type !== "JsnodeOperationPackageAssay" || candidate.version !== 1 || candidate.status !== "passed") refuse("FAILED_ASSAY", `assay ${candidate.name} must be passed`);
    if (candidate.name === "tests" && (!Array.isArray(candidate.paths) || candidate.paths.length === 0 || candidate.paths.some((value) => typeof value !== "string"))) refuse("INVALID_ASSAY", "tests assay must identify its test paths");
    if (candidate.name === "pack") {
      if (typeof candidate.filename !== "string" || candidate.filename.length === 0) refuse("INVALID_ASSAY", "pack assay must identify its tarball filename");
      digest(candidate.digest, "pack assay digest");
    }
    if (["clean-installation", "import-face", "command-face"].includes(candidate.name)) {
      for (const [key, entry] of Object.entries(candidate)) if (["javascriptFiles", "reachableJavascriptFiles", "examples"].includes(key) && (!Number.isInteger(entry) || entry < 0)) refuse("INVALID_ASSAY", `assay ${candidate.name}.${key} must be a nonnegative integer`);
    }
    return candidate;
  });
}

function refusal(error) {
  if (!(error instanceof ReceiptRefusal)) throw error;
  return freezeJson({
    type: "JsnodeOperationPackageCreationReceiptRefusal",
    version: 1,
    code: error.code,
    message: error.message,
    path: error.refusedPath,
  });
}

/**
 * Admits the complete immutable evidence that one JSNode operation package was created successfully.
 * @summary Admits the evidence that one JSNode operation package was created successfully.
 * @param {object} candidate A JsnodeOperationPackageCreationReceipt candidate.
 * @returns {object} The admitted immutable receipt or a specific receipt-refusal record.
 */
export function admitJsnodeOperationPackageCreationReceipt(candidate) {
  try {
    if (!isJsonValue(candidate) || !isRecord(candidate)) refuse("INVALID_RECEIPT", "input must be a JSON record");
    exactKeys(candidate, ["type", "version", "packageName", "packageVersion", "destination", "filesDigest", "files", "assays"], "receipt");
    if (candidate.type !== "JsnodeOperationPackageCreationReceipt" || candidate.version !== 1) refuse("INVALID_RECEIPT", "receipt type and version must be JsnodeOperationPackageCreationReceipt@1");
    if (typeof candidate.packageName !== "string" || !/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/u.test(candidate.packageName)) refuse("INVALID_PACKAGE_NAME", "packageName must be a normalized scoped npm package name");
    if (typeof candidate.packageVersion !== "string" || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(candidate.packageVersion)) refuse("INVALID_PACKAGE_VERSION", "packageVersion must be an exact three-part numeric version");
    if (typeof candidate.destination !== "string" || !isAbsoluteFilepath(candidate.destination) || path.resolve(candidate.destination) !== candidate.destination) refuse("INVALID_DESTINATION", "destination must be an absolute normalized path");
    return freezeJson({
      ...candidate,
      filesDigest: digest(candidate.filesDigest, "filesDigest"),
      files: materializations(candidate.files),
      assays: assays(candidate.assays),
    });
  } catch (error) {
    return refusal(error);
  }
}
