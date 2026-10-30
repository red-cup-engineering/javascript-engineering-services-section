import assert from "node:assert/strict";
import test from "node:test";
import { projectJsnodeOperationPackageReadme } from "../scripts/project-jsnode-operation-package-readme.mjs";

test("projects README help solely from admitted package identity, JSDoc, and examples", () => {
  const projection = projectJsnodeOperationPackageReadme({
    type: "JsnodeOperationPackageSpecification",
    version: 1,
    packageName: "@red-cup-engineering/add-one-service",
    operation: {
      commandName: "add-one",
      documentation: {
        signature: "export function addOne(value)",
        description: "Adds one.",
        parameters: [{ name: "value", type: "number", description: "The starting value." }],
        returns: { type: "number", description: "The resulting value." },
        throws: [],
      },
    },
    examples: [{ name: "one becomes two", input: 1, output: 2 }],
  });
  assert.equal(projection.path, "README.md");
  assert.match(projection.text, /Adds one\./u);
  assert.match(projection.text, /export function addOne\(value\)/u);
  assert.match(projection.text, /add-one reads one JSON value per input line/u);
  assert.match(projection.text, /one becomes two/u);
  assert.match(projection.text, /~~~json\n1\n~~~/u);
});

// Regression (2026-09-05): a multi-line @param/@returns/@throws JSDoc
// description used to be concatenated verbatim into a single Markdown
// bullet, so its raw continuation-line text (including a leaked "*   "
// marker) broke onto its own line(s) instead of staying part of the bullet.
test("collapses a multi-line parameter, returns, and throws description to one bullet line", () => {
  const projection = projectJsnodeOperationPackageReadme({
    type: "JsnodeOperationPackageSpecification",
    version: 1,
    packageName: "@red-cup-engineering/add-one-service",
    operation: {
      commandName: "add-one",
      documentation: {
        signature: "export function addOne(value)",
        description: "Adds one.",
        parameters: [{ name: "value", type: "number", description: "A record containing\n *   the starting value\n *   spanning lines." }],
        returns: { type: "number", description: "The resulting\n *   value." },
        throws: [{ type: "TypeError", description: "When value\n *   is not a number." }],
      },
    },
    examples: [{ name: "one becomes two", input: 1, output: 2 }],
  });
  assert.match(projection.text, /^- value \(number\): A record containing the starting value spanning lines\.$/mu);
  assert.match(projection.text, /^number: The resulting value\.$/mu);
  assert.match(projection.text, /^- TypeError: When value is not a number\.$/mu);
  assert.doesNotMatch(projection.text, /\*\s{2,}/u);
});
