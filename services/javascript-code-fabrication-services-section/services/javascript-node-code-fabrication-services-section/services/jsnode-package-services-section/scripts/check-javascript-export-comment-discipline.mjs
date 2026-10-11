#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { parseJavaScript } from "@red-cup-engineering/javascript-node-services-section/javascript-parser";
import { freezeJson } from "@red-cup-engineering/json-services-section";
import { parseJavascriptArgv } from "@red-cup-engineering/javascript-node-services-section/argv";
import { parseLines, serializeLines } from "@red-cup-engineering/jsonl-services-section";
import { readJavascriptFileExportDocumentation } from "@red-cup-engineering/read-javascript-file-export-documentation-service";
import { admitJavascriptExportDescription } from "@red-cup-engineering/read-javascript-file-export-documentation-service/description";
import { requireTextFileRead } from "@red-cup-engineering/computer-file-engineering-services-section/require-text-file-read";

const LOOSE_COMMENT_MAX_LINES = 4;
const COMMENT_TO_CODE_RATIO_MAX = 0.3;
const EGREGIOUS_LOOSE_COMMENT_MAX_LINES = 8;
const EGREGIOUS_RATIO_MAX = 0.6;

function scanCommentTokens(text) {
  return parseJavaScript(text).comments
    .filter((comment) => comment.type === "Line" || comment.type === "Block")
    .map((comment) => ({ start: comment.start, end: comment.end, kind: comment.type === "Line" ? "line" : "block" }));
}

function onlySingleNewlineBetween(text, fromEnd, toStart) {
  const between = text.slice(fromEnd, toStart);
  if (between.trim() !== "") return false;
  return (between.match(/\n/gu) ?? []).length <= 1;
}

function groupCommentTokens(text, tokens) {
  const groups = [];
  for (const token of tokens) {
    const previous = groups.at(-1);
    if (token.kind === "line" && previous?.kind === "line" && onlySingleNewlineBetween(text, previous.end, token.start)) {
      previous.end = token.end;
      continue;
    }
    groups.push({ ...token });
  }
  return groups;
}

function computeLineOffsets(text) {
  const offsets = [0];
  for (let index = 0; index < text.length; index += 1) if (text[index] === "\n") offsets.push(index + 1);
  return offsets;
}

function lineOfOffset(lineOffsets, offset) {
  let low = 0;
  let high = lineOffsets.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lineOffsets[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

function isAttachedDeclarationDoc(text, group) {
  if (group.kind !== "block" || text.slice(group.start, group.start + 3) !== "/**") return false;
  const following = text.slice(group.end).match(/^\s*/u)[0];
  const rest = text.slice(group.end + following.length);
  return rest.length > 0;
}

function classifyLines(text, groups) {
  const lines = text.split("\n");
  const lineOffsets = computeLineOffsets(text);
  const coverage = lines.map(() => []);
  for (const group of groups) {
    const startLine = lineOfOffset(lineOffsets, group.start);
    const endLine = lineOfOffset(lineOffsets, group.end);
    for (let line = startLine; line <= endLine; line += 1) {
      const lineStart = lineOffsets[line];
      const lineEnd = line + 1 < lineOffsets.length ? lineOffsets[line + 1] - 1 : text.length;
      const from = Math.max(group.start, lineStart) - lineStart;
      const to = Math.min(group.end, lineEnd) - lineStart;
      coverage[line].push([from, to]);
    }
  }
  let commentLineCount = 0;
  let codeLineCount = 0;
  let blankLineCount = 0;
  for (let line = 0; line < lines.length; line += 1) {
    const content = lines[line];
    if (content.trim() === "") {
      blankLineCount += 1;
      continue;
    }
    const ranges = coverage[line].sort((left, right) => left[0] - right[0]);
    let remaining = "";
    let cursor = 0;
    for (const [from, to] of ranges) {
      remaining += content.slice(cursor, from);
      cursor = Math.max(cursor, to);
    }
    remaining += content.slice(cursor);
    if (remaining.trim() === "") commentLineCount += 1;
    else codeLineCount += 1;
  }
  return { commentLineCount, codeLineCount, blankLineCount, totalLines: lines.length };
}

function exportViolations(exportDoc) {
  const violations = [];
  try {
    admitJavascriptExportDescription(exportDoc.description);
  } catch {
    violations.push({ code: "MISSING_EXPORT_DESCRIPTION", exportName: exportDoc.name, message: `exported ${exportDoc.name} has no JSDoc description` });
  }
  if (exportDoc.returns === null) {
    violations.push({ code: "MISSING_EXPORT_RETURNS", exportName: exportDoc.name, message: `exported ${exportDoc.name} has no JSDoc @returns` });
  } else if (exportDoc.returns.type === null) {
    violations.push({ code: "MISSING_RETURNS_TYPE", exportName: exportDoc.name, message: `exported ${exportDoc.name} @returns has no {type}` });
  }
  for (const parameter of exportDoc.parameters) {
    if (parameter.type === null) {
      violations.push({
        code: "MISSING_PARAMETER_TYPE",
        exportName: exportDoc.name,
        parameterName: parameter.name,
        message: `exported ${exportDoc.name} parameter ${parameter.name} has no JSDoc {type}`,
      });
    }
  }
  return violations;
}

/**
 * Checks one JavaScript file's exported functions for typed JSDoc and flags loose prose comments.
 *
 * @summary Checks exported-function JSDoc and comment-to-code discipline for one JavaScript file.
 * @param {object} reading A TextFileRead carrying the JavaScript path and source text.
 * @returns {object} A JavascriptExportCommentDisciplineReport.
 * @throws {TypeError} When the input is not a TextFileRead carrier.
 * @throws {SyntaxError} When the carried JavaScript does not parse.
 */
export function checkJavascriptExportCommentDiscipline(reading) {
  const { path, text } = requireTextFileRead(reading);
  const exportDocumentation = readJavascriptFileExportDocumentation({ type: "TextFileRead", path, text });
  const commentGroups = groupCommentTokens(text, scanCommentTokens(text));
  const looseGroups = commentGroups.filter((group) => !isAttachedDeclarationDoc(text, group));
  const lineOffsets = computeLineOffsets(text);
  const looseComments = [];
  const violations = [];

  for (const group of looseGroups) {
    const startLine = lineOfOffset(lineOffsets, group.start) + 1;
    const endLine = lineOfOffset(lineOffsets, group.end) + 1;
    const lineCount = endLine - startLine + 1;
    looseComments.push({ startLine, endLine, lineCount, kind: group.kind });
    if (lineCount > LOOSE_COMMENT_MAX_LINES) {
      violations.push({
        code: "PROSE_ESSAY_COMMENT",
        startLine,
        endLine,
        message: `loose comment at lines ${startLine}-${endLine} (${lineCount} lines) exceeds the ${LOOSE_COMMENT_MAX_LINES}-line threshold for a comment not attached to exported JSDoc`,
      });
    }
  }

  for (const exportDoc of exportDocumentation) violations.push(...exportViolations(exportDoc));

  const { commentLineCount, codeLineCount, blankLineCount, totalLines } = classifyLines(text, commentGroups);
  const { commentLineCount: looseCommentLineCount } = classifyLines(text, looseGroups);
  const commentToCodeRatio = codeLineCount === 0 ? looseCommentLineCount : looseCommentLineCount / codeLineCount;
  if (commentToCodeRatio > COMMENT_TO_CODE_RATIO_MAX) {
    violations.push({
      code: "EXCESSIVE_COMMENT_RATIO",
      message: `loose-comment-to-code ratio ${commentToCodeRatio.toFixed(2)} exceeds ${COMMENT_TO_CODE_RATIO_MAX}`,
    });
  }

  return freezeJson({
    type: "JavascriptExportCommentDisciplineReport",
    version: 1,
    path,
    exports: exportDocumentation.map((exportDoc) => ({
      name: exportDoc.name,
      hasDescription: (() => {
        try { admitJavascriptExportDescription(exportDoc.description); return true; } catch { return false; }
      })(),
      hasReturns: exportDoc.returns !== null,
      hasReturnsType: exportDoc.returns?.type != null,
      parametersMissingType: exportDoc.parameters.filter((parameter) => parameter.type === null).map((parameter) => parameter.name),
    })),
    looseComments,
    commentLineCount,
    looseCommentLineCount,
    codeLineCount,
    blankLineCount,
    totalLines,
    looseCommentToCodeRatio: commentToCodeRatio,
    violations,
    conformant: violations.length === 0,
  });
}

/**
 * Names the single most egregious loose-comment violation in a comment discipline report, for a caller that gates on severe cases only rather than every strict violation.
 *
 * @summary Names the most egregious loose-comment violation in a JavascriptExportCommentDisciplineReport, or null.
 * @param {object} report A JavascriptExportCommentDisciplineReport from checkJavascriptExportCommentDiscipline.
 * @returns {string|null} A human-readable reason naming the egregious violation, or null when none crosses the egregious thresholds.
 * @throws {TypeError} When the report is not a JavascriptExportCommentDisciplineReport.
 */
export function egregiousJavascriptExportCommentDisciplineReason(report) {
  if (!report || report.type !== "JavascriptExportCommentDisciplineReport") throw new TypeError("report must be a JavascriptExportCommentDisciplineReport");
  const proseEssay = report.looseComments.find((comment) => comment.lineCount > EGREGIOUS_LOOSE_COMMENT_MAX_LINES);
  if (proseEssay) {
    return `a ${proseEssay.lineCount}-line loose comment at lines ${proseEssay.startLine}-${proseEssay.endLine} exceeds the egregious ${EGREGIOUS_LOOSE_COMMENT_MAX_LINES}-line threshold`;
  }
  if (report.looseCommentToCodeRatio > EGREGIOUS_RATIO_MAX) {
    return `a loose-comment-to-code ratio of ${report.looseCommentToCodeRatio.toFixed(2)} exceeds the egregious ${EGREGIOUS_RATIO_MAX} threshold`;
  }
  return null;
}

function helpText(documentation) {
  const lines = [`${documentation.name} — ${documentation.description}`, "", documentation.signature];
  if (documentation.parameters.length > 0) {
    lines.push("", "Parameters:");
    for (const parameter of documentation.parameters) lines.push(`  ${parameter.name}${parameter.type ? ` {${parameter.type}}` : ""}  ${parameter.description}`);
  }
  if (documentation.returns) lines.push("", `Returns${documentation.returns.type ? ` {${documentation.returns.type}}` : ""}: ${documentation.returns.description}`);
  if (documentation.throws.length > 0) {
    lines.push("", "Refusals:");
    for (const refusal of documentation.throws) lines.push(`  ${refusal.type ? `{${refusal.type}} ` : ""}${refusal.description}`);
  }
  return `${lines.join("\n")}\n`;
}

if (import.meta.main) {
  const parsed = parseJavascriptArgv({
    type: "JavascriptArgvParsingRequest",
    version: 1,
    argumentVector: { type: "JavascriptArgumentVector", version: 1, arguments: process.argv },
    options: { help: { type: "boolean", short: "h", default: false } },
    allowPositionals: false,
    strict: true,
  });
  if (parsed.options.help) {
    const source = await readFile(new URL(import.meta.url), "utf8");
    const [documentation] = readJavascriptFileExportDocumentation({
      type: "TextFileRead",
      path: "scripts/check-javascript-export-comment-discipline.mjs",
      text: source,
    });
    if (!process.stdout.write(helpText(documentation))) await once(process.stdout, "drain");
  } else {
    process.stdin.setEncoding("utf8");
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    const output = serializeLines(parseLines(text).map(checkJavascriptExportCommentDiscipline));
    if (!process.stdout.write(output)) await once(process.stdout, "drain");
  }
}
