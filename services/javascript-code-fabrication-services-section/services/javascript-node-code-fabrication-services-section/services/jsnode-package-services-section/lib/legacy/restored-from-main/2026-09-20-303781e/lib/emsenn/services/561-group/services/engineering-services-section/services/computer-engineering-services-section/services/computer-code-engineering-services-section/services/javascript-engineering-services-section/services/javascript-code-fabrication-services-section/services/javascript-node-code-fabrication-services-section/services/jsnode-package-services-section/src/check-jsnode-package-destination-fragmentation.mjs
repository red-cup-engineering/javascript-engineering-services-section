import { walkPosixPaths } from "@red-cup-engineering/path-walking-service";

/**
 * Checks whether a proposed package destination's parent directory already exhibits the sibling single-function-package fragmentation shape org-layering.md's "A services-section IS the package" rule names: the parent itself carries no `package.json` of its own (it is a bare namespace folder, not itself a services-section package) while it already holds one or more sibling directories that are each themselves a standalone single-function package (their own `package.json`, a directory name that does not end in "-services-section").
 * @param {string} parentDirectory An absolute directory path — the directory a new package's destination would be created inside.
 * @returns {Promise<{fragmenting: boolean, siblingPackages: string[]}>} Whether the parent already exhibits the fragmentation shape, and the offending sibling directory names found.
 */
export async function checkJsnodePackageDestinationFragmentation(parentDirectory) {
  const siblingDirectoryNames = [];
  const walk = await walkPosixPaths({
    root: parentDirectory,
    maxDepth: 1,
    result: "paths",
    missing: "empty",
    inspectEntry: (entry) => {
      if (entry.depth === 0 && entry.kind === "directory") siblingDirectoryNames.push(entry.name);
    },
  });
  if (walk.files.includes("package.json")) return { fragmenting: false, siblingPackages: [] };
  const siblingPackages = siblingDirectoryNames
    .filter((name) => !name.endsWith("-services-section"))
    .filter((name) => walk.files.includes(`${name}/package.json`));
  return { fragmenting: siblingPackages.length > 0, siblingPackages };
}
