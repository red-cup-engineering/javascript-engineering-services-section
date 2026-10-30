import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { dataKindDirectory } from "@red-cup-engineering/eavt-services-section/data-artifact-address";

/**
 * Moves every planned file whose destination the law derived (`to` not null) with `git mv` inside the section's own
 * repository, and writes the misfiled-resources register as a service record of the data law (`dataKindDirectory`).
 * Items without a destination are left in place and listed in the register, grouped by rule and directory with
 * counts, for their owners. A plan that moves nothing writes nothing.
 * @param {{root: string, plan: {section: string, items: object[]}}} request The repository root and a normalization plan.
 * @returns {{moved: number, owed: number, register: string | null}}
 */
export function applyServicesSectionNormalization({ root, plan }) {
  const section = resolve(root, plan.section);
  const git = (...args) => execFileSync("git", ["-C", section, ...args], { encoding: "utf8" });
  const sha256 = (file) => createHash("sha256").update(readFileSync(resolve(section, file))).digest("hex");
  const moved = [];
  const owed = [];
  const seen = new Set();
  for (const item of plan.items) {
    if (item.to === null) { owed.push(item); continue; }
    if (seen.has(item.from)) continue;
    seen.add(item.from);
    const sourceSha256 = sha256(item.from);
    mkdirSync(dirname(resolve(section, item.to)), { recursive: true });
    git("mv", "--", item.from, item.to);
    const destinationSha256 = sha256(item.to);
    moved.push({ from: item.from, to: item.to, rule: item.rule, sourceSha256, destinationSha256, byteIdentical: destinationSha256 === sourceSha256 });
  }
  if (moved.length === 0) return { moved: 0, owed: owed.length, register: null };
  const date = new Date().toISOString().slice(0, 10);
  const name = plan.section.split("/").filter(Boolean).at(-1);
  const register = `${dataKindDirectory("", "record", "misfiled-resource")}/${date}-${name}-normalization.json`;
  const owedByDirectory = new Map();
  for (const item of owed) {
    const key = JSON.stringify([item.rule, item.reason, dirname(item.from)]);
    owedByDirectory.set(key, { rule: item.rule, reason: item.reason, directory: dirname(item.from), count: (owedByDirectory.get(key)?.count ?? 0) + 1 });
  }
  mkdirSync(dirname(resolve(section, register)), { recursive: true });
  writeFileSync(resolve(section, register), JSON.stringify({ id: `${date}-${name}-normalization`, kind: "misfiled-resources-register", by: "apply-services-section-normalization", date, moved, owed: [...owedByDirectory.values()] }, null, 2) + "\n");
  git("add", "--", register);
  return { moved: moved.length, owed: owed.length, register };
}

export const operationDefinition = Object.freeze({
  name: "applyServicesSectionNormalization",
  description: "Moves each planned file whose destination the law derived with git mv inside the section's repository, and registers what remains owed.",
  inputSchema: { type: "object", required: ["root", "plan"], properties: { root: { type: "string", minLength: 1 }, plan: { type: "object", required: ["section", "items"] } } },
  outputSchema: { type: "object", required: ["moved", "owed", "register"] },
});

// apply-services-section-normalization <repository root> <plan.json>
if (import.meta.main) {
  const [root, planFile] = process.argv.slice(2);
  if (!root || !planFile) { console.error("usage: apply-services-section-normalization <repository root> <plan.json>"); process.exit(2); }
  console.log(JSON.stringify(applyServicesSectionNormalization({ root, plan: JSON.parse(readFileSync(planFile, "utf8")) })));
}
