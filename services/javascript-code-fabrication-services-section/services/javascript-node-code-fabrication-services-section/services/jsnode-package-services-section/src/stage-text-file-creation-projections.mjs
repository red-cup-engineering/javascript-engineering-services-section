// Stages an admitted set of future text files into a fresh temporary sibling directory, then reads
// the stage back and proves every path, byte, and mode matches what was staged, before the caller
// (create-jsnode-operation-package.mjs) assays and publishes it. This is the one place in the
// package-creation pipeline that touches a staging directory's files directly; every actual file
// read or write goes through @red-cup-engineering/computer-file-engineering-services-section, and only directory walking
// (mkdtemp/mkdir/readdir/lstat/rm) calls node:fs directly, since file-services owns file content,
// not directories.
import { lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { readFileText } from "@red-cup-engineering/computer-file-engineering-services-section/read-file";
import { writeFileText } from "@red-cup-engineering/computer-file-engineering-services-section/write-file";
import { serializeLines } from "@red-cup-engineering/jsonl-services-section";
import { admitTextFileCreationProjectionSet } from "@red-cup-engineering/computer-file-engineering-services-section/admit-text-file-creation-projection-set";
import { sha256Digest, sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

class StagingRefusal extends Error {
  constructor(code, message, refusedPath = null) {
    super(message);
    this.code = code;
    this.refusedPath = refusedPath;
  }
}

function refuse(code, message, refusedPath = null) {
  throw new StagingRefusal(code, message, refusedPath);
}

// Walks a staged directory depth-first in canonical (locale-sorted) order, strictly UTF-8 decoding
// each regular file (file-services' readFileText fatal option — a stage must never carry a byte
// sequence that is not valid UTF-8), and refusing any symlink or special file it finds.
async function actualFiles(root) {
  const files = [];
  async function visit(directory, prefix) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const absolutePath = path.join(directory, entry.name);
      const status = await lstat(absolutePath);
      if (status.isSymbolicLink()) refuse("STAGE_SYMLINK", "staged projections must not contain symbolic links", relativePath);
      if (status.isDirectory()) await visit(absolutePath, relativePath);
      else if (status.isFile()) {
        let text;
        try {
          text = await readFileText(absolutePath, { fatal: true });
        } catch {
          refuse("STAGE_NON_UTF8_FILE", "staged text files must contain valid UTF-8", relativePath);
        }
        files.push({ type: "TextFileCreationProjection", version: 1, path: relativePath, text, mode: status.mode & 0o777 });
      } else refuse("STAGE_SPECIAL_FILE", "staged projections must contain only directories and regular files", relativePath);
    }
  }
  await visit(root, "");
  return files;
}

// Re-reads stageDirectory and proves it holds exactly the admitted files' paths, UTF-8 text, and
// modes, returning the same TextFileCreationStageRead shape read-text-file-creation-stage-service
// used to return (or throws a StagingRefusal on any mismatch).
async function readStage(stageDirectory, expected) {
  const observedFiles = await actualFiles(stageDirectory);
  const observedDigest = sha256Digest(serializeLines(observedFiles));
  const observed = admitTextFileCreationProjectionSet({ type: "TextFileCreationProjectionSet", version: 1, files: observedFiles, filesDigest: observedDigest });
  if (observed.type !== "TextFileCreationProjectionSet") refuse(observed.code, observed.message, observed.path);
  if (serializeLines(observed.files) !== serializeLines(expected.files)) {
    refuse("STAGE_CONTENT_MISMATCH", "staged paths, text, or modes differ from their projections", stageDirectory);
  }
  const fileDigests = observed.files.map((file) => Object.freeze({
    type: "TextFileMaterialization",
    version: 1,
    path: file.path,
    mode: file.mode,
    digest: sha256Digest(file.text),
  }));
  return Object.freeze({
    type: "TextFileCreationStageRead",
    version: 1,
    stageDirectory,
    files: observed.files,
    filesDigest: observed.filesDigest,
    fileDigests,
  });
}

function refusal(code, message, refusedPath = null) {
  return Object.freeze({ type: "TextFileCreationStagingRefusal", version: 1, code, message, path: refusedPath });
}

/**
 * Writes an admitted set of text-file projections into a new temporary sibling of parentDirectory,
 * then reads the stage back and proves it, returning a TextFileCreationStageRead (or a specific
 * refusal record). Replaces stage-text-file-creation-projections-service composed with
 * read-text-file-creation-stage-service, now that both are deleted in favor of file-services.
 *
 * @param {{parentDirectory: string, files: object[], filesDigest: string}} request
 * @returns {Promise<object>}
 */
export async function stageTextFileCreationProjections({ parentDirectory, files, filesDigest }) {
  const set = admitTextFileCreationProjectionSet({ type: "TextFileCreationProjectionSet", version: 1, files, filesDigest });
  if (set.type !== "TextFileCreationProjectionSet") return refusal(set.code, set.message, set.path);

  const stageDirectory = await mkdtemp(path.join(parentDirectory, ".text-file-creation-stage-"));
  try {
    for (const file of set.files) {
      const target = path.join(stageDirectory, ...file.path.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFileText(target, file.text, { flag: "wx", mode: file.mode });
    }
    return await readStage(stageDirectory, set);
  } catch (error) {
    await rm(stageDirectory, { recursive: true, force: true });
    if (error instanceof StagingRefusal) return refusal(error.code, error.message, error.refusedPath);
    return refusal("STAGING_FAILED", error.message, stageDirectory);
  }
}
