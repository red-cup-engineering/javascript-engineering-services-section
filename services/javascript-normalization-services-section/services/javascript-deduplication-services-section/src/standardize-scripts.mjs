import path from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execute } from "@red-cup-engineering/eavt-services-section";
import { semanticId } from "@red-cup-engineering/computer-content-engineering-services-section/semiotic-content-address";
import { projectScriptOntoOperation, KERNEL_SPECIFIER } from "./operation-form.mjs";

/** The kernel package every operation-form script depends on, at the exact pin the tree consumes. */
export const KERNEL_PACKAGE = KERNEL_SPECIFIER.split("/").slice(0, 2).join("/");
export const KERNEL_VERSION = "0.2.0";

function nearestPackage(file, root) {
  let dir = path.dirname(path.resolve(file));
  while (dir.startsWith(path.resolve(root))) {
    const manifest = path.join(dir, "package.json");
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, "utf8"));
      const pnpm = path.join(dir, "pnpm-lock.yaml"), npm = path.join(dir, "package-lock.json");
      const manager = existsSync(pnpm) ? "pnpm" : "npm";
      return { dir, name: parsed.name ?? dir, hasTest: typeof parsed.scripts?.test === "string" && existsSync(path.join(dir, "node_modules")), manifestPath: manifest, lockPath: existsSync(pnpm) ? pnpm : existsSync(npm) ? npm : null, manager };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function tail(text, max = 600) { return text.length <= max ? text : text.slice(text.length - max); }

/**
 * Projects every listed script onto the operation form and, when applying, writes each package's
 * projected scripts together and keeps them only if `node --check` passes on every one and the
 * package's own `npm test` (when it has one installed) still passes; otherwise every file in that
 * package is restored byte for byte. One receipt row per file is appended to `receiptTrace`.
 */
export function standardizeScripts(root, files, options = {}) {
  const apply = options.apply === true;
  const at = new Date().toISOString();
  const run = semanticId({ kind: "javascript-deduplication.script-standardization-run", root: path.resolve(root), at });
  const outcomes = [];
  const projectedByPackage = new Map();
  const packages = new Map();
  for (const file of files) {
    const absolute = path.resolve(root, file);
    let source;
    try { source = readFileSync(absolute, "utf8"); } catch { continue; }
    const pkg = nearestPackage(absolute, root);
    const result = projectScriptOntoOperation(source, absolute);
    if (!result.ok) {
      outcomes.push({ file, package: pkg?.name ?? null, act: "refused", refusal: result.refusal });
      continue;
    }
    const outcome = {
      file, package: pkg?.name ?? null, act: "projected",
      removedDeclarations: result.value.removedDeclarations, removedImports: result.value.removedImports,
      bytesBefore: Buffer.byteLength(source), bytesAfter: Buffer.byteLength(result.value.text),
    };
    const key = pkg?.dir ?? path.dirname(absolute);
    if (pkg) packages.set(key, pkg);
    const list = projectedByPackage.get(key) ?? [];
    list.push({ file: absolute, before: source, after: result.value.text, outcome });
    projectedByPackage.set(key, list);
    if (!apply) outcomes.push(outcome);
  }
  if (apply) {
    let index = 0;
    for (const [dir, entries] of projectedByPackage) {
      index++;
      const pkg = packages.get(dir);
      if (options.progress) process.stderr.write(`standardize-scripts: [${index}/${projectedByPackage.size}] ${pkg?.name ?? dir}: ${entries.length} script(s)\n`);
      // A package whose own tests are already red cannot verify this change; leave it untouched and say so.
      if (pkg?.hasTest) {
        const baseline = spawnSync("npm", ["test", "--silent"], { cwd: pkg.dir, encoding: "utf8", env: { ...process.env, CI: "1" } });
        if (baseline.status !== 0) {
          for (const entry of entries) outcomes.push({ ...entry.outcome, act: "unverifiable", gate: "npm-test", gateOutput: `baseline npm test already fails in ${pkg.name}: ${tail(`${baseline.stdout}\n${baseline.stderr}`)}` });
          if (options.progress) process.stderr.write(`standardize-scripts: ${pkg.name}: skipped, baseline tests red\n`);
          continue;
        }
      }
      const manifestBefore = pkg ? readFileSync(pkg.manifestPath, "utf8") : null;
      const lockBefore = pkg?.lockPath ? readFileSync(pkg.lockPath, "utf8") : null;
      let failure;
      // The kernel becomes a declared dependency of the package, at the exact pin, before any script imports it.
      if (pkg) {
        const manifest = JSON.parse(manifestBefore);
        if (manifest.dependencies?.[KERNEL_PACKAGE] === undefined) {
          manifest.dependencies = Object.fromEntries(Object.entries({ ...(manifest.dependencies ?? {}), [KERNEL_PACKAGE]: KERNEL_VERSION }).sort(([a], [b]) => a.localeCompare(b)));
          writeFileSync(pkg.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
          if (existsSync(path.join(pkg.dir, "node_modules")) || pkg.lockPath !== null) {
            const install = pkg.manager === "pnpm"
              ? spawnSync("pnpm", ["install", "--no-frozen-lockfile", "--ignore-scripts"], { cwd: pkg.dir, encoding: "utf8" })
              : spawnSync("npm", ["install", "--no-audit", "--no-fund", "--ignore-scripts"], { cwd: pkg.dir, encoding: "utf8" });
            if (install.status !== 0) failure = `declaring ${KERNEL_PACKAGE}@${KERNEL_VERSION} in ${pkg.name}: ${tail(`${install.stdout}\n${install.stderr}`)}`;
          }
        }
      }
      let gate = "node-check";
      if (failure === undefined) {
        for (const entry of entries) writeFileSync(entry.file, entry.after);
        for (const entry of entries) {
          const check = spawnSync(process.execPath, ["--check", entry.file], { encoding: "utf8" });
          if (check.status !== 0) { failure = `node --check ${path.relative(root, entry.file)}: ${tail(check.stderr)}`; break; }
        }
      }
      if (failure === undefined && pkg?.hasTest) {
        gate = "npm-test";
        const test = spawnSync("npm", ["test", "--silent"], { cwd: pkg.dir, encoding: "utf8", env: { ...process.env, CI: "1" } });
        if (test.status !== 0) failure = `npm test in ${pkg.name}: ${tail(`${test.stdout}\n${test.stderr}`)}`;
      }
      if (failure !== undefined) {
        for (const entry of entries) writeFileSync(entry.file, entry.before);
        if (pkg && manifestBefore !== null) writeFileSync(pkg.manifestPath, manifestBefore);
        if (pkg?.lockPath && lockBefore !== null) writeFileSync(pkg.lockPath, lockBefore);
        for (const entry of entries) outcomes.push({ ...entry.outcome, act: "reverted", gate, gateOutput: failure });
      } else {
        for (const entry of entries) outcomes.push({ ...entry.outcome, act: "applied", gate: pkg?.hasTest ? "npm-test" : "node-check" });
      }
      if (options.progress) process.stderr.write(`standardize-scripts: ${pkg?.name ?? dir}: ${failure === undefined ? "kept" : "reverted"}\n`);
    }
  }
  const counts = {};
  const refusals = {};
  let bytesRemoved = 0;
  for (const outcome of outcomes) {
    counts[outcome.act] = (counts[outcome.act] ?? 0) + 1;
    if (outcome.refusal) refusals[outcome.refusal.code] = (refusals[outcome.refusal.code] ?? 0) + 1;
    if (outcome.act === "applied") bytesRemoved += (outcome.bytesBefore ?? 0) - (outcome.bytesAfter ?? 0);
    if (options.receiptTrace) {
      execute({ operation: "append", path: options.receiptTrace, row: {
        e: semanticId({ kind: "javascript-deduplication.script", file: outcome.file }),
        a: "javascript-deduplication.standardized",
        v: { act: outcome.act, package: outcome.package, refusal: outcome.refusal?.code ?? null, gate: outcome.gate ?? null, bytesBefore: outcome.bytesBefore ?? null, bytesAfter: outcome.bytesAfter ?? null },
        t: { run, at },
      } });
    }
  }
  return Object.freeze({ kind: "javascript-deduplication.script-standardization", apply, counts, refusals, bytesRemoved, outcomes: Object.freeze(outcomes) });
}
