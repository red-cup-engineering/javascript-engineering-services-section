// frontmatter.mjs — split a Markdown document into its YAML frontmatter and
// body, and stitch them back together. Zero dependencies.

import { parse, dump } from './yaml.mjs';

const FRONTMATTER_RE = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

// Returns { frontmatter, body, hasFrontmatter, raw }.
// `frontmatter` is the parsed object (or {} when absent / empty).
export const splitDocument = (text) => {
  const m = text.match(FRONTMATTER_RE);
  if (!m) {
    return { frontmatter: {}, body: text, hasFrontmatter: false, rawFrontmatter: null };
  }
  const rawFrontmatter = m[1];
  const parsed = parse(rawFrontmatter);
  const frontmatter = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  return {
    frontmatter,
    body: text.slice(m[0].length),
    hasFrontmatter: true,
    rawFrontmatter
  };
};

// Reassemble a document from a frontmatter object and body string.
export const joinDocument = (frontmatter, body, options = {}) => {
  const hasKeys = frontmatter && Object.keys(frontmatter).length > 0;
  if (!hasKeys) return body ?? '';
  const yaml = dump(frontmatter, options).replace(/\n$/, '');
  return `---\n${yaml}\n---\n${body ?? ''}`;
};
