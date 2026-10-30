import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { derivedCommitSync, gitTextSync } from "../src/git-objects.mjs";

function repository() {
  const root = mkdtempSync(join(tmpdir(), "derived-commit-"));
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.name", "queue"]);
  execFileSync("git", ["-C", root, "config", "user.email", "queue@example.invalid"]);
  return root;
}

test("a derived commit is the same commit whenever it is made again, dated at its latest parent", () => {
  const root = repository();
  const empty = gitTextSync(root, ["hash-object", "-t", "tree", "-w", "--stdin"], { input: "" });
  const at = (seconds) => ({ GIT_AUTHOR_DATE: `@${seconds} +0000`, GIT_COMMITTER_DATE: `@${seconds} +0000` });
  const left = gitTextSync(root, ["commit-tree", empty], { input: "left\n", env: at(1000) });
  const right = gitTextSync(root, ["commit-tree", empty], { input: "right\n", env: at(2000) });
  const first = derivedCommitSync(root, empty, [left, right], "Integrate x into main\n");
  const again = derivedCommitSync(root, empty, [left, right], "Integrate x into main\n");
  assert.equal(again, first);
  assert.equal(gitTextSync(root, ["show", "-s", "--format=%ct %at", first]), "2000 2000");
  assert.notEqual(derivedCommitSync(root, empty, [right, left], "Integrate x into main\n"), first, "parent order is part of the commit");
});
