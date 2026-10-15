import { spawnSync } from "node:child_process";
import { relative, resolve } from "node:path";

import { resolvePriorityPathsConfig } from "@red-cup-engineering/searching-filepath-service";

// A renamed path (a bin, a service directory, a doc) leaves stale literal
// references behind it — that is the whole reason this tool exists. Finding
// them is a full-text content grep, exactly the sweep searching-filepath-service's own
// staged token search says up front it is *not* ("Use to find where to look
// first before committing to a full-text sweep."). None of searching-filepath-service's
// composed services do plain literal content matching over arbitrary file
// content (matchFilenameToken tests only the path string; matchMarkdownToken
// tests only frontmatter/headings) so this module does not force that shape.
// It reuses what searching-filepath-service already has that *does* apply — the same
// vault-configured excludes (`resolvePriorityPathsConfig`, sourced the same
// three ways: --config, <root>/etc/priority-paths.json, or the shipped
// example) — and gets the actual line-by-line literal search from `rg`,
// following the same spawnSync(rg, ..., { encoding: "utf8", maxBuffer }) /
// exit-status-0-or-1-is-not-an-error convention already established in
// codex-actuator-client-service/src/client.mjs's selectBoundedEvidence.

function excludesToGlobs(excludes) {
  return excludes.flatMap((pattern) => ["--glob", `!${pattern}`]);
}

/**
 * Run `rg` for literal (fixed-string) occurrences of `old` under `root` and
 * yield one match record per matching line, in the same
 * `{path, matchKind, matchedText}` vocabulary matchFilenameToken/
 * matchMarkdownToken already use, plus `line` (1-based), the one field a
 * content-line match needs that a filename/heading match never did.
 * `path` is root-relative POSIX, matching walkPosixPaths' own convention.
 *
 * Case-sensitive by default (unlike the token search's default fold) —
 * a stale *path* reference is a filesystem string, and folding case here
 * would trade false negatives (a real dead path in a different case) for
 * false positives that don't exist on a case-sensitive filesystem. Opt into
 * `options.ignoreCase` to fold.
 */
export function findStaleReferences({ old, root, excludes = [], options = {}, searchExecutable = "rg" } = {}) {
  if (typeof old !== "string" || old === "") throw new TypeError("old is required");
  if (typeof root !== "string" || !root) throw new TypeError("root is required");
  if (!Array.isArray(excludes)) throw new TypeError("excludes must be an array");

  const absoluteRoot = resolve(root);
  const args = [
    "--json",
    "--fixed-strings",
    ...(options.ignoreCase ? ["--ignore-case"] : []),
    ...excludesToGlobs(excludes),
    "--",
    old,
    absoluteRoot,
  ];

  const result = spawnSync(searchExecutable, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (![0, 1].includes(result.status)) {
    throw new Error((result.stderr || `${searchExecutable} exited ${result.status}`).trim());
  }

  const matches = [];
  for (const line of result.stdout.split(/\r?\n/u)) {
    if (!line) continue;
    const record = JSON.parse(line);
    if (record.type !== "match") continue;
    const path = relative(absoluteRoot, record.data.path.text);
    for (const submatch of record.data.submatches) {
      matches.push({
        path,
        line: record.data.line_number,
        matchKind: "content-literal",
        matchedText: submatch.match.text,
      });
    }
  }

  matches.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
  return Object.freeze(matches.map((match) => Object.freeze(match)));
}

/**
 * Convenience wrapper: resolve the same vault-configured excludes
 * `search-file-path` uses (--config, then `<root>/etc/priority-paths.json`, then
 * searching-filepath-service's shipped example) and run `findStaleReferences` with
 * them, so the two tools agree on what counts as noise (node_modules, .git,
 * legacy, _archive, archive, package-registry*, .tmp by default) without
 * this app carrying a second copy of that list.
 */
export async function checkStaleReferences({ old, root, configPath, extraExcludes = [], options = {}, searchExecutable = "rg" } = {}) {
  const config = await resolvePriorityPathsConfig({ root, configPath });
  const excludes = [...config.excludes, ...extraExcludes];
  return findStaleReferences({ old, root, excludes, options, searchExecutable });
}
