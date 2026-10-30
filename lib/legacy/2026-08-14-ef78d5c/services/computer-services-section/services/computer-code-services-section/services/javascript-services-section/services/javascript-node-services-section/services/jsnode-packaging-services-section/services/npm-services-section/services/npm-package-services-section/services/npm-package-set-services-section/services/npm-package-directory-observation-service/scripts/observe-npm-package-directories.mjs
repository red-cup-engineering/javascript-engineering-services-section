#!/usr/bin/env node
import { canonical } from "@red-cup-engineering/json-codec-service";
import { selectNpmPackageManifestPaths } from "@red-cup-engineering/npm-package-manifest-path-selection-service";
import { parseJavascriptArgv } from "@red-cup-engineering/parse-javascript-argv-service";
import { walkPosixPaths } from "@red-cup-engineering/path-walking-service";
import { projectFilepathDirectory } from "@red-cup-engineering/project-filepath-directory-service";
import { projectRegularFilePaths } from "@red-cup-engineering/regular-file-path-projection-service";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { writeJavascriptNodeStandardOutputText } from "@red-cup-engineering/write-javascript-node-standard-output-text-service";

export async function observeNpmPackageDirectories({ root, excludes = [] } = {}) {
  const walk = await walkPosixPaths({ root, excludes });
  const manifestPaths = selectNpmPackageManifestPaths(projectRegularFilePaths(walk));
  const directories = manifestPaths.map((path) => resolveFilepath([walk.root, projectFilepathDirectory(path)]));
  return Object.freeze({ type: "NpmPackageDirectoryObservation", root: walk.root, directories: Object.freeze(directories) });
}

if (import.meta.main) {
  const parsed = parseJavascriptArgv({ argumentVector: process.argv, options: { exclude: { type: "string", multiple: true } }, allowPositionals: true });
  if (parsed.positionals.length !== 1) throw new TypeError("usage: observe-npm-package-directories [--exclude SEGMENT]... ROOT");
  const observation = await observeNpmPackageDirectories({ root: parsed.positionals[0], excludes: parsed.options.exclude ?? [] });
  await writeJavascriptNodeStandardOutputText({ standardOutput: process.stdout, text: `${canonical(observation)}\n` });
}
