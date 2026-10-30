#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const retiredScopes = [
  "emsweb",
  "harmonious-union",
  "koios-news",
  "red-cup-science",
  "rsc-quiescent",
  "turntide-islands",
  "union-officer-academy",
];

const pattern = `@(${retiredScopes.join("|")})(/|:registry=)`;
const pathspecs = [
  "--",
  ":(glob)**/package.json",
  ":(glob)**/package-lock.json",
  ":(glob)**/*.js",
  ":(glob)**/*.mjs",
  ":(glob)**/*.ts",
  ":(glob)**/*.mts",
  ":(glob)**/*.json",
  ":(glob)**/*.yaml",
  ":(glob)**/*.yml",
  ":(glob)**/*.toml",
  ":(glob)**/README.md",
  ":(glob)**/.npmrc",
  ":(exclude,glob)**/lib/legacy/**",
  ":(exclude,glob)**/content/assets/legacy/**",
  ":(exclude,glob)**/data/logs/**",
  ":(exclude,glob)**/data/storage/**",
  ":(exclude,glob)**/node_modules/**",
];

const result = spawnSync(
  "git",
  ["grep", "-n", "-I", "-E", pattern, ...pathspecs],
  { encoding: "utf8" },
);

if (result.status === 1) {
  console.log("namespace policy ok: no retired npm scopes in active source");
  process.exit(0);
}
if (result.status !== 0) {
  process.stderr.write(result.stderr || "git grep failed\n");
  process.exit(result.status ?? 2);
}

process.stderr.write(result.stdout);
process.stderr.write(
  "Retired npm scopes found. Use only @561-group, @causeway-services, " +
    "@coesite-operations, @emsenn, @lenticule-science, or " +
    "@red-cup-engineering.\n",
);
process.exit(1);
