/**
 * The packages of a repository and the files each owns, read from its tracked file list: the one resolution of
 * packages and nested roots the house's package codemods share (sync-package-manifest, the test-plan reader), so
 * they agree on which package a file belongs to.
 *
 * A package is a tracked `package.json` outside legacy, vendor, node_modules and test trees (tests, fixtures and
 * examples may carry manifests of their own; they are data, not packages). A file belongs to the deepest package
 * whose directory holds it.
 */
const NOT_PACKAGE = /(?:^|\/)(?:legacy|vendor|vendored|node_modules|test|tests|__tests__|fixtures|examples)\//u;

/** The package roots (repository-relative directories, "." for the root) among tracked file paths, sorted. */
export function packageRoots(trackedFiles) {
  return [...new Set(trackedFiles.filter((file) => /(?:^|\/)package\.json$/u.test(file) && !NOT_PACKAGE.test(file))
    .map((file) => file.replace(/\/?package\.json$/u, "") || "."))].sort();
}

const holds = (root, file) => root === "." || file === root || file.startsWith(`${root}/`);

/** The packages nested inside `root`, as paths relative to it. */
export function nestedRootsOf(root, roots) {
  return roots.filter((other) => other !== root && other !== "." && holds(root, other)).map((other) => root === "." ? other : other.slice(root.length + 1));
}

/** The tracked files `root` owns, outside every package nested in it, as `{ path, file }`: package-relative and repository-relative. */
export function ownedFiles(root, roots, trackedFiles) {
  const nested = nestedRootsOf(root, roots).map((relative) => root === "." ? relative : `${root}/${relative}`);
  return trackedFiles.filter((file) => holds(root, file) && !nested.some((other) => holds(other, file)))
    .map((file) => ({ path: root === "." ? file : file.slice(root.length + 1), file }));
}
