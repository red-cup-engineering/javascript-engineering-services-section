import assert from "node:assert/strict";
import test from "node:test";
import { checkJavascriptExportCommentDiscipline, egregiousJavascriptExportCommentDisciplineReason } from "../scripts/check-javascript-export-comment-discipline.mjs";

function file(path, text) {
  return { type: "TextFileRead", path, text };
}

test("passes a compactly documented export with no loose comments", () => {
  const report = checkJavascriptExportCommentDiscipline(file("a.mjs", [
    "/**",
    " * Adds two numbers.",
    " *",
    " * @param {number} a The first addend.",
    " * @param {number} b The second addend.",
    " * @returns {number} The sum.",
    " */",
    "export function add(a, b) {",
    "  return a + b;",
    "}",
    "",
  ].join("\n")));
  assert.equal(report.conformant, true);
  assert.deepEqual(report.violations, []);
  assert.deepEqual(report.looseComments, []);
});

test("flags a prose-essay loose comment and missing export documentation", () => {
  const report = checkJavascriptExportCommentDiscipline(file("b.mjs", [
    "// line one of an unbroken prose explanation",
    "// line two of the same explanation",
    "// line three of the same explanation",
    "// line four of the same explanation",
    "// line five of the same explanation",
    "export function add(a, b) {",
    "  return a + b;",
    "}",
    "",
  ].join("\n")));
  assert.equal(report.conformant, false);
  const codes = report.violations.map((violation) => violation.code);
  assert.ok(codes.includes("PROSE_ESSAY_COMMENT"));
  assert.ok(codes.includes("MISSING_EXPORT_DESCRIPTION"));
  assert.ok(codes.includes("MISSING_EXPORT_RETURNS"));
});

test("flags a parameter missing a JSDoc type", () => {
  const report = checkJavascriptExportCommentDiscipline(file("c.mjs", [
    "/**",
    " * Adds two numbers.",
    " *",
    " * @param a The first addend.",
    " * @returns {number} The sum.",
    " */",
    "export function add(a, b) {",
    "  return a + b;",
    "}",
    "",
  ].join("\n")));
  const parameterViolation = report.violations.find((violation) => violation.code === "MISSING_PARAMETER_TYPE");
  assert.ok(parameterViolation);
  assert.equal(parameterViolation.parameterName, "a");
});

test("flags an excessive loose-comment-to-code ratio from many short comments", () => {
  const lines = [];
  for (let index = 0; index < 8; index += 1) {
    lines.push(`// short note ${index}`, "");
  }
  lines.push("export const value = 1;", "");
  const report = checkJavascriptExportCommentDiscipline(file("d.mjs", lines.join("\n")));
  const ratioViolation = report.violations.find((violation) => violation.code === "EXCESSIVE_COMMENT_RATIO");
  assert.ok(ratioViolation);
  assert.ok(report.looseComments.every((comment) => comment.lineCount <= 4));
});

test("does not flag TypeDoc attached to a class method as loose prose", () => {
  const report = checkJavascriptExportCommentDiscipline(file("h.mjs", [
    "export class Calculator {",
    "  /**",
    "   * Adds two numbers.",
    "   *",
    "   * @param {number} a The first addend.",
    "   * @param {number} b The second addend.",
    "   * @returns {number} The sum.",
    "   */",
    "  add(a, b) {",
    "    return a + b;",
    "  }",
    "}",
    "",
  ].join("\n")));
  assert.deepEqual(report.looseComments, []);
});

test("does not flag a JSDoc block attached to a non-exported declaration as loose prose", () => {
  const report = checkJavascriptExportCommentDiscipline(file("i.mjs", [
    "/**",
    " * A private helper, not exported.",
    " */",
    "function helper() {",
    "  return 1;",
    "}",
    "export const value = helper();",
    "",
  ].join("\n")));
  assert.deepEqual(report.looseComments, []);
});

test("throws TypeError for a non-TextFileRead input", () => {
  assert.throws(() => checkJavascriptExportCommentDiscipline({ path: "x.mjs", text: "" }), TypeError);
});

test("egregious reason is null for a strict violation that does not cross the egregious thresholds", () => {
  const report = checkJavascriptExportCommentDiscipline(file("e.mjs", [
    "// line one of an unbroken prose explanation",
    "// line two of the same explanation",
    "// line three of the same explanation",
    "// line four of the same explanation",
    "// line five of the same explanation",
    "// line six of the same explanation",
    "export function add(a, b) {",
    "  const x1 = 1;",
    "  const x2 = 1;",
    "  const x3 = 1;",
    "  const x4 = 1;",
    "  const x5 = 1;",
    "  const x6 = 1;",
    "  const x7 = 1;",
    "  const x8 = 1;",
    "  return a + b;",
    "}",
    "",
  ].join("\n")));
  assert.equal(report.conformant, false);
  assert.equal(egregiousJavascriptExportCommentDisciplineReason(report), null);
});

test("egregious reason names a loose comment block over the egregious line threshold", () => {
  const lines = [];
  for (let index = 0; index < 10; index += 1) lines.push(`// prose line ${index} explaining at length`);
  lines.push("export function add(a, b) {", "  return a + b;", "}", "");
  const report = checkJavascriptExportCommentDiscipline(file("f.mjs", lines.join("\n")));
  assert.match(egregiousJavascriptExportCommentDisciplineReason(report), /10-line loose comment/);
});

test("egregious reason names an egregious loose-comment-to-code ratio without any single block over the line threshold", () => {
  const lines = [];
  for (let index = 0; index < 8; index += 1) lines.push(`// short note ${index}`, "");
  lines.push("export const value = 1;", "");
  const report = checkJavascriptExportCommentDiscipline(file("g.mjs", lines.join("\n")));
  assert.match(egregiousJavascriptExportCommentDisciplineReason(report), /loose-comment-to-code ratio/);
});

test("egregious reason throws TypeError for a non-report input", () => {
  assert.throws(() => egregiousJavascriptExportCommentDisciplineReason({ type: "Wrong" }), TypeError);
});
