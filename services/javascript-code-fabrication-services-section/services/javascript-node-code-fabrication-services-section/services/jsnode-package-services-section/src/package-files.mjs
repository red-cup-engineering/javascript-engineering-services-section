/**
 * A package directory's files, as package-relative paths: the tracked and untracked-but-not-ignored files git
 * lists when the directory is in a checkout, else every file under it (an assembled workspace or release has
 * no git). node_modules and .git are never walked.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/** The package-relative files of the package at `directory`. */
export function packageFiles(directory) {
  try {
    const listed = execFileSync("git", ["-C", directory, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."], { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
    return listed.split("\0").filter(Boolean).filter((path) => existsSync(join(directory, path)));
  } catch {
    const files = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.isFile()) files.push(relative(directory, path).split("\\").join("/"));
      }
    };
    walk(directory);
    return files;
  }
}

/** Whether a package named `name` resolves from `directory`: a node_modules/<name>/package.json up the tree. */
export function packageResolvesFrom(directory, name) {
  for (let dir = directory; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "node_modules", ...name.split("/"), "package.json"))) return true;
    if (dirname(dir) === dir) return false;
  }
}
