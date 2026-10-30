import { createHash, randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { link, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { rewriteVerdaccioPackument } from "./verdaccio-version-reset.mjs";
import { rewriteZeroMajorCarrier } from "./zero-major-version-reset.mjs";
const execFile = promisify(execFileCallback);
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest(algorithm === "sha512" ? "base64" : "hex");
const filename = (name, version) => `${name.split("/").at(-1)}-${version}.tgz`;
const storagePath = (storage, name, file) => join(storage, ...name.split("/"), file);

async function hardlinkBackup(source, destination) { await mkdir(dirname(destination), { recursive: true }); try { await link(source, destination); } catch (error) { if (error.code !== "EEXIST") throw error; const [left, right] = await Promise.all([readFile(source), readFile(destination)]); if (!left.equals(right)) throw new Error(`backup collision has different bytes: ${destination}`); } }
async function archiveManifest(archive, scratch) { await execFile("tar", ["-xzf", archive, "-C", scratch]); return JSON.parse(await readFile(join(scratch, "package", "package.json"), "utf8")); }

/** Offline, sequential Verdaccio mutation. Caller stops Verdaccio first. */
export async function applyVerdaccioZeroMajorReset({ storage, packuments, maps, backupRoot, registry = "https://registry.561.group/", failAfter = Infinity } = {}) {
  const stage = await mkdtemp(join(tmpdir(), "verdaccio-zero-major-")); const artifacts = new Map(), staged = [], root = resolve(storage);
  try {
    for (const packument of packuments) for (const [from, manifest] of Object.entries(packument.versions)) {
      const carrier = rewriteZeroMajorCarrier({ manifest }, maps), to = maps.get(packument.name)?.get(from) ?? from;
      if (to === from && carrier.dependencyEdits.length === 0) continue;
      const oldFile = filename(packument.name, from), newFile = filename(packument.name, to), source = storagePath(root, packument.name, oldFile), work = join(stage, `${randomUUID()}`);
      await mkdir(work); const embedded = await archiveManifest(source, work);
      if (embedded.name !== packument.name || embedded.version !== from) throw new Error(`tarball identity mismatch: ${source}`);
      const rewritten = rewriteZeroMajorCarrier({ manifest: embedded }, maps).manifest; rewritten.version = to;
      await writeFile(join(work, "package", "package.json"), `${JSON.stringify(rewritten, null, 2)}\n`);
      const output = join(stage, `${packument.name.replaceAll("/", "_").replaceAll("@", "")}-${newFile}`); await execFile("tar", ["-czf", output, "-C", work, "package"]);
      const bytes = await readFile(output), verified = await archiveManifest(output, join(stage, `${randomUUID()}`));
      if (verified.name !== packument.name || verified.version !== to) throw new Error(`staged tarball identity mismatch: ${packument.name}@${to}`);
      artifacts.set(`${packument.name}\u0000${from}`, { version: to, filename: newFile, tarball: new URL(`${packument.name}/-/${newFile}`, registry).href, integrity: `sha512-${hash("sha512", bytes)}`, shasum: hash("sha1", bytes) });
      staged.push({ name: packument.name, from, to, source, output, target: storagePath(root, packument.name, newFile) }); await rm(work, { recursive: true, force: true });
    }
    const rewritten = packuments.map((packument) => ({ packument, next: rewriteVerdaccioPackument(packument, maps, { artifacts }) }));
    let count = 0;
    for (const entry of staged) { await hardlinkBackup(entry.source, storagePath(backupRoot, entry.name, filename(entry.name, entry.from))); await mkdir(dirname(entry.target), { recursive: true }); await rename(entry.output, entry.target); if (++count === failAfter) throw new Error("injected partial failure"); }
    for (const { packument, next } of rewritten) { const target = storagePath(root, packument.name, "package.json"); const actual = await readFile(target); if (!actual.equals(Buffer.from(JSON.stringify(packument)))) { const parsed = JSON.parse(actual); if (JSON.stringify(parsed) !== JSON.stringify(packument)) throw new Error(`registry metadata changed since plan: ${packument.name}`); } await hardlinkBackup(target, storagePath(backupRoot, packument.name, "package.json")); const temporary = `${target}.zero-major-${randomUUID()}`; await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`); await rename(temporary, target); }
    for (const entry of staged) if (entry.source !== entry.target) await rm(entry.source, { force: true });
    return Object.freeze({ staged: staged.length, artifacts: Object.freeze([...artifacts.values()]) });
  } finally { await rm(stage, { recursive: true, force: true }); }
}
