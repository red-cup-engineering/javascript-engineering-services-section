#!/usr/bin/env node
import { canonical } from "@red-cup-engineering/json-codec-service";
import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

const RULES = Object.freeze([
  ["/services/561-group/services/engineering-services-section/", "red-cup-engineering"],
  ["/services/561-group/services/red-cup-engineering/", "red-cup-engineering"],
  ["/services/561-group/services/lenticule-science/", "lenticule-science"],
  ["/services/561-group/services/board-of-directors/", "harmonious-union"],
  ["/services/561-group/services/rsc-quiescent/services/aagaard/", "aagaard"],
  ["/services/561-group/services/rsc-quiescent/services/agrodao/", "agrodao"],
  ["/services/561-group/services/rsc-quiescent/services/emsweb/", "emsweb"],
  ["/services/561-group/services/rsc-quiescent/services/koios-news/", "koios-news"],
  ["/services/561-group/services/rsc-quiescent/services/turntide-islands/", "turntide-islands"],
  ["/services/561-group/services/rsc-quiescent/", "rsc-quiescent"],
  ["/services/561-group/services/union-officer-academy/", "union-officer-academy"],
  ["/services/561-group/sites/", "561-group"],
  ["/services/561-group/services/", "561-group"],
  ["/services/561-group/lib/", "561-group"],
  ["/services/board-of-directors/", "harmonious-union"],
]);

export function projectJsnodePackageOwner(packagePath) {
  if (typeof packagePath !== "string" || !packagePath) throw new TypeError("packagePath is required");
  const path = "/" + packagePath.replaceAll("\\", "/") + "/";
  const match = RULES.find(([territory]) => path.includes(territory));
  if (!match) throw new Error("no package-owner projection for " + packagePath);
  return Object.freeze({ type: "JsnodePackageOwnerProjection", packagePath, owner: match[1], territory: match[0] });
}

if (import.meta.main) {
  const parsed = parseJavascriptArgv({ argumentVector: process.argv, options: { "package-path": { type: "string" } } });
  if (typeof parsed.options["package-path"] !== "string") throw new TypeError("--package-path is required");
  const result = projectJsnodePackageOwner(parsed.options["package-path"]);
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(result)}\n` });
}
