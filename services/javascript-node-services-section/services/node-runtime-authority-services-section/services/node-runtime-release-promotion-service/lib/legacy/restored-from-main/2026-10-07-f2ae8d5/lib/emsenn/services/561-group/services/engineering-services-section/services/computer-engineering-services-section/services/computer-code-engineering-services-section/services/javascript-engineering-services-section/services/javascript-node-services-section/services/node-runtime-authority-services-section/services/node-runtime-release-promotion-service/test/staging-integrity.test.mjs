import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { materializeNodeRuntimeRelease } from "../src/materialize-release.mjs";
import { blobId, releaseIdentity, selectionEntries, stageFromPrevious, verifyStagedEntries } from "../src/release-source.mjs";

const git = (cwd, ...arguments_) => execFileSync("git", ["-c", "user.email=t@example.invalid", "-c", "user.name=t", ...arguments_], { cwd, encoding: "utf8" }).trim();
const ARCHIVES = [[".", ":(exclude,glob)**/data/state/**"]];
const DERIVED = ["gen/descriptors.mjs"];
const FILES = 1500;
const body = (index, version) => `export const file${index} = ${JSON.stringify(`v${version}-${index}`)};\n`;
const pathOf = (index) => `pkg${index % 40}/src/dir${index % 7}/file${index}.mjs`;

async function commit(repository, version, every) {
  for (let index = 0; index < FILES; index += 1) {
    if (version === 1 || index % every === 0) {
      await mkdir(dirname(join(repository, pathOf(index))), { recursive: true });
      await writeFile(join(repository, pathOf(index)), body(index, version));
    }
  }
  await mkdir(join(repository, "gen"), { recursive: true });
  await writeFile(join(repository, "gen/descriptors.mjs"), `export default ${version};\n`);
  git(repository, "add", "-A");
  git(repository, "commit", "--quiet", "-m", `v${version}`);
  return git(repository, "rev-parse", "HEAD");
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "staging-integrity-"));
  const repository = join(root, "repository");
  await mkdir(repository);
  git(repository, "init", "--quiet");
  const first = await commit(repository, 1, 1);
  const second = await commit(repository, 2, 3); // a third of the files change, spread over every carry run
  await mkdir(join(root, "releases"));
  const running = await materializeNodeRuntimeRelease({
    stagedRoot: await (async () => {
      const stage = join(root, "stage-1");
      execFileSync("sh", ["-c", `mkdir -p '${stage}' && git archive --format=tar ${first} | tar -x -C '${stage}'`], { cwd: repository });
      return stage;
    })(),
    releaseRoot: join(root, "releases"), derived: DERIVED, identity: releaseIdentity({ repository, commit: first, archives: ARCHIVES, derived: DERIVED }), source: { repository: "r", commit: first, archives: ARCHIVES },
  });
  return { root, repository, first, second, running: running.release };
}

test("a parallel stage between two commits always holds the commit's blobs, whatever the running release holds at a changed path", async () => {
  const f = await fixture();
  try {
    // The running release's copies of changed paths are made wrong, in the way a stale or edited
    // release would have them: a stage must not inherit them by link.
    execFileSync("chmod", ["-R", "u+w", f.running]);
    for (let index = 0; index < FILES; index += 3) writeFileSync(join(f.running, pathOf(index)), body(index, 1).replace("v1", "vX"));
    const after = selectionEntries({ repository: f.repository, commit: f.second, archives: ARCHIVES });
    for (let round = 0; round < 5; round += 1) {
      const stage = join(f.root, `stage-${round}`);
      const applied = await stageFromPrevious({ repository: f.repository, previousCommit: f.first, commit: f.second, archives: ARCHIVES, derived: DERIVED, previousRelease: f.running, stage, selection: after, sampleSize: 1e9 });
      assert.equal(applied.verified, applied.written);
      assert.equal(applied.carried + applied.written, after.length, "every file is carried or written, none both");
      for (const entry of after) assert.equal(blobId(readFileSync(join(stage, entry.path))), entry.oid, `${entry.path} in round ${round}`);
      // Changed paths are their own inodes; unchanged ones are carried.
      assert.notEqual((await stat(join(stage, pathOf(0)))).ino, (await stat(join(f.running, pathOf(0)))).ino);
      assert.equal((await stat(join(stage, pathOf(1)))).ino, (await stat(join(f.running, pathOf(1)))).ino);
      await rm(stage, { recursive: true, force: true });
    }
  } finally {
    execFileSync("chmod", ["-R", "u+w", f.root]);
    await rm(f.root, { recursive: true, force: true });
  }
});

test("a carried file whose bytes are not its blob's is refused with its path, and so is any mismatch in a staged tree", async () => {
  const f = await fixture();
  try {
    execFileSync("chmod", ["-R", "u+w", f.running]);
    // Same size, different bytes, at a path the commit does not change.
    writeFileSync(join(f.running, pathOf(1)), body(1, 1).replace("v1", "vZ"));
    await assert.rejects(
      stageFromPrevious({ repository: f.repository, previousCommit: f.first, commit: f.second, archives: ARCHIVES, derived: DERIVED, previousRelease: f.running, stage: join(f.root, "stage-bad"), sampleSize: 1e9 }),
      (error) => error.message.includes("does not hold the bytes of its commit") && error.message.includes(`${pathOf(1)}: bytes differ`),
    );
    const stage = join(f.root, "stage-ok");
    const entries = selectionEntries({ repository: f.repository, commit: f.second, archives: ARCHIVES }).slice(0, 50);
    execFileSync("sh", ["-c", `mkdir -p '${stage}' && git archive --format=tar ${f.second} | tar -x -C '${stage}'`], { cwd: f.repository });
    assert.equal(verifyStagedEntries({ stage, entries }), 50);
    writeFileSync(join(stage, entries[3].path), "tampered\n");
    chmodSync(join(stage, entries[4].path), 0o755);
    await rm(join(stage, entries[5].path));
    assert.throws(() => verifyStagedEntries({ stage, entries }), (error) => /3 of 50/.test(error.message) && error.message.includes(`${entries[3].path}: bytes differ`) && error.message.includes(`${entries[4].path}: mode differs`) && error.message.includes(`${entries[5].path}: missing`));
    assert.ok(readdirSync(stage).length > 0);
  } finally {
    execFileSync("chmod", ["-R", "u+w", f.root]);
    await rm(f.root, { recursive: true, force: true });
  }
});
