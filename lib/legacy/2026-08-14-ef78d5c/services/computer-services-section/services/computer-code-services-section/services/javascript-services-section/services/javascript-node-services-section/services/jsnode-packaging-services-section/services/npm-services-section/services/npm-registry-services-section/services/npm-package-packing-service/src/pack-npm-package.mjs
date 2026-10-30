import { execFile } from "node:child_process";
import { lstat, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const executeNpm = promisify(execFile);

export class NpmPackagePackingError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "NpmPackagePackingError";
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function fail(code, message, details) {
  throw new NpmPackagePackingError(code, message, details);
}

function within(root, candidate) {
  const fromRoot = relative(root, candidate);
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot));
}

async function directory(path, field) {
  if (typeof path !== "string" || path.length === 0) fail("ERR_NPM_PACKAGE_PACKING_INPUT", `${field} must be a non-empty string`);
  const resolved = resolve(path);
  let status;
  try {
    status = await lstat(resolved);
  } catch (error) {
    if (error?.code === "ENOENT") fail("ERR_NPM_PACKAGE_PACKING_INPUT", `${field} must name an existing directory`, { field, path: resolved });
    throw error;
  }
  if (!status.isDirectory() || status.isSymbolicLink()) fail("ERR_NPM_PACKAGE_PACKING_INPUT", `${field} must name a non-symbolic-link directory`, { field, path: resolved });
  return resolved;
}

function reportedTarball(stdout) {
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    fail("ERR_NPM_PACKAGE_PACKING_REPORT", "npm pack must emit one JSON-reported tarball", { reason: "invalid-json" });
  }
  if (!Array.isArray(report) || report.length !== 1 || !report[0] || typeof report[0] !== "object") {
    fail("ERR_NPM_PACKAGE_PACKING_REPORT", "npm pack must emit one JSON-reported tarball", { reason: "report-count" });
  }
  const filename = report[0].filename;
  if (typeof filename !== "string" || filename.length === 0 || filename !== basename(filename) || !filename.endsWith(".tgz")) {
    fail("ERR_NPM_PACKAGE_PACKING_REPORT", "npm pack reported an invalid tarball filename", { filename });
  }
  return filename;
}

/**
 * Pack one already-projected npm carrier. This service neither projects a
 * manifest nor assembles a registry; its only output is the verified tarball.
 */
export async function packNpmPackage({ carrierDirectory, destinationDirectory, execute = executeNpm } = {}) {
  const carrier = await directory(carrierDirectory, "carrierDirectory");
  const destination = await directory(destinationDirectory, "destinationDirectory");
  if (typeof execute !== "function") fail("ERR_NPM_PACKAGE_PACKING_INPUT", "execute must be a function");
  const cache = await mkdtemp(join(tmpdir(), "npm-package-packing-cache-"));
  try {
    let execution;
    try {
      execution = await execute("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", destination], {
        cwd: carrier,
        env: { ...process.env, npm_config_cache: cache, npm_config_update_notifier: "false", npm_config_loglevel: "error" },
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch (error) {
      throw new NpmPackagePackingError("ERR_NPM_PACKAGE_PACKING_EXECUTION", "npm pack failed", { causeCode: error?.code ?? null });
    }
    const filename = reportedTarball(execution?.stdout);
    const artifactPath = resolve(destination, filename);
    if (!within(destination, artifactPath)) fail("ERR_NPM_PACKAGE_PACKING_REPORT", "npm pack reported a tarball outside its destination", { filename });
    let status;
    try {
      status = await lstat(artifactPath);
    } catch (error) {
      if (error?.code === "ENOENT") fail("ERR_NPM_PACKAGE_PACKING_ARTIFACT", "npm pack did not create its reported tarball", { filename });
      throw error;
    }
    if (!status.isFile() || status.isSymbolicLink()) fail("ERR_NPM_PACKAGE_PACKING_ARTIFACT", "npm pack reported tarball must be a regular file", { filename });
    return Object.freeze({ artifactPath, filename });
  } finally {
    await rm(cache, { recursive: true, force: true });
  }
}
