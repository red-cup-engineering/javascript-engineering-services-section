import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, readlink, rename, stat, symlink, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

const DIGEST = /^[0-9a-f]{64}$/u;
const POINTER = /^[a-z][a-z0-9-]*$/u;

async function exists(path) {
  try { await stat(path); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== "..");
}

async function releaseDigest(root) {
  const hash = createHash("sha256");
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name === "release-receipt.json") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        hash.update(relative(root, path)); hash.update("\0"); hash.update(await readFile(path)); hash.update("\0");
      }
    }
  }
  await visit(root);
  return hash.digest("hex");
}

async function atomicRelativeLink(directory, name, target) {
  const temporaryName = `.${name}.${randomUUID()}`;
  const temporary = join(directory, temporaryName);
  await symlink(target, temporary);
  await rename(temporary, join(directory, name));
}

export async function promoteNodeRuntimeRelease({ releaseRoot, digest, pointerName = "current", receiptRoot }) {
  if (!releaseRoot || !receiptRoot) throw new Error("releaseRoot and receiptRoot are required");
  if (!DIGEST.test(digest ?? "")) throw new Error("digest must be one lowercase SHA-256 hex value");
  if (!POINTER.test(pointerName)) throw new Error("pointerName must be a lowercase deployment name");
  const root = resolve(releaseRoot);
  const release = resolve(root, digest);
  if (!inside(root, release) || basename(release) !== digest || !(await exists(release))) throw new Error("release is absent or outside the admitted root");
  const materialization = JSON.parse(await readFile(join(release, "release-receipt.json"), "utf8"));
  const observedDigest = await releaseDigest(release);
  if (materialization.artifactDigest !== digest || observedDigest !== digest) throw new Error("release bytes do not satisfy the selected digest");

  let fromDigest = null;
  try {
    const prior = await readlink(join(root, pointerName));
    if (DIGEST.test(prior)) fromDigest = prior;
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "EINVAL") throw error;
  }
  if (fromDigest && fromDigest !== digest) await atomicRelativeLink(root, "previous", fromDigest);
  await atomicRelativeLink(root, pointerName, digest);

  const receipt = {
    type: "NodeRuntimeReleasePromotionReceipt",
    version: 1,
    pointer: join(root, pointerName),
    fromDigest,
    toDigest: digest,
    observedDigest,
    changed: fromDigest !== digest,
    recordedAt: new Date().toISOString(),
  };
  const receipts = resolve(receiptRoot);
  await mkdir(receipts, { recursive: true });
  const receiptPath = join(receipts, `${receipt.recordedAt.replaceAll(":", "-")}-${digest}.json`);
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  return { ...receipt, receiptPath };
}
