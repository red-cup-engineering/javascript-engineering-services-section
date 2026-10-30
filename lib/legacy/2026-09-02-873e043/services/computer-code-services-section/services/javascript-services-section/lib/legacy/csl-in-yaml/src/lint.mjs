// lint.mjs — citation-discipline checks for a CSL-in-YAML document.
//
// The rules encode a single convention:
//   * every external work is one CSL-JSON entry in frontmatter `references:`;
//   * the references array is sorted by id and ids are unique;
//   * citekeys are surnameYYYY (no hyphens);
//   * the only in-body citation form is the bare  @citekey;
//   * every  @citekey  in the body resolves to a references id;
//   * there is no hand-written bibliography section in the body (it is renderer
//     output from the frontmatter).
//
// Findings are objects: { rule, severity, message, line?, match?, ... }.

import { CITEKEY_RE, isValidName, isCslType } from './csl.mjs';

// Bare @citekey: an @ not preceded by [, @, or a word char; citekey then a word
// boundary.
const BARE_CITE_RE = /(?<![@[\w])@([a-z][a-z0-9]*\d{4}[a-z]?)\b/g;
// Any [@…] bracketed form (single, multi, locator, suppress-author, nocite).
const FORBIDDEN_BRACKETED_CITE_RE = /\[\s*-?@[a-z][a-z0-9]*[^\]]*\]/g;
// Bracketed author-year: [Author 1977], [Author and Other 1980].
const FORBIDDEN_BRACKETED_AUTHOR_RE = /\[([A-Z][A-Za-z'’.\-]+(?:\s+(?:and|&|et\s+al\.?)\s+[A-Z][A-Za-z'’.\-]+)?(?:\s+[A-Z][A-Za-z'’.\-]+)?)\s+(\d{4}[a-z]?)\]/g;
// Parenthetical author-year: (Author 1977).
const FORBIDDEN_PAREN_AUTHOR_RE = /\(([A-Z][A-Za-z'’.\-]+(?:\s+(?:and|&|et\s+al\.?)\s+[A-Z][A-Za-z'’.\-]+)?(?:\s+[A-Z][A-Za-z'’.\-]+)?)\s+(\d{4}[a-z]?)\)/g;

const FORBIDDEN_HEADINGS = [
  /^references$/i, /^bibliography$/i, /^sources$/i, /^sources\s+read$/i,
  /^sources\s+cited(\s+.*)?$/i, /^works\s+cited$/i, /^citations$/i
];

// Mask body positions inside fenced code blocks and inline code spans.
const buildMask = (body) => {
  const mask = new Uint8Array(body.length);
  const lines = body.split('\n');
  let inFence = false;
  let fenceMarker = '';
  let cursor = 0;
  for (const line of lines) {
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    let toggled = false;
    if (fenceMatch) {
      const marker = fenceMatch[2][0];
      if (!inFence) { inFence = true; fenceMarker = marker; toggled = true; }
      else if (marker === fenceMarker) { inFence = false; fenceMarker = ''; toggled = true; }
    }
    const lineLen = line.length;
    if (inFence || (toggled && fenceMarker === '')) {
      for (let i = 0; i < lineLen; i++) mask[cursor + i] = 1;
    }
    cursor += lineLen + 1;
  }
  let inInline = false;
  for (let i = 0; i < body.length; i++) {
    if (mask[i]) { inInline = false; continue; }
    if (body[i] === '`') { inInline = !inInline; mask[i] = 1; continue; }
    if (inInline) mask[i] = 1;
    if (body[i] === '\n') inInline = false;
  }
  return mask;
};

const isMasked = (mask, start, end) => {
  for (let i = start; i < end; i++) if (mask[i]) return true;
  return false;
};

const lineOf = (body, index) => {
  let line = 1;
  for (let i = 0; i < index && i < body.length; i++) if (body[i] === '\n') line++;
  return line;
};

const scanForbidden = (body, mask, re, rule, message, hits) => {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(body)) !== null) {
    const start = m.index, end = m.index + m[0].length;
    if (isMasked(mask, start, end)) continue;
    hits.push({ rule, severity: 'error', message, line: lineOf(body, start), match: m[0] });
  }
};

export const lintBody = (body, refKeys) => {
  const hits = [];
  const mask = buildMask(body);

  scanForbidden(body, mask, FORBIDDEN_BRACKETED_CITE_RE, 'forbidden-bracketed-citation',
    'bracketed citation forms are forbidden; use the bare @citekey', hits);
  scanForbidden(body, mask, FORBIDDEN_BRACKETED_AUTHOR_RE, 'forbidden-bracketed-author-year',
    'bracketed author-year citation is forbidden; convert to a bare @citekey and add a references entry', hits);
  scanForbidden(body, mask, FORBIDDEN_PAREN_AUTHOR_RE, 'forbidden-parenthetical-author-year',
    'parenthetical author-year citation is forbidden; convert to a bare @citekey and add a references entry', hits);

  // Every bare @citekey must resolve.
  BARE_CITE_RE.lastIndex = 0;
  let m;
  while ((m = BARE_CITE_RE.exec(body)) !== null) {
    const start = m.index, end = m.index + m[0].length;
    if (isMasked(mask, start, end)) continue;
    if (!refKeys.has(m[1])) {
      hits.push({
        rule: 'unresolved-citekey', severity: 'error',
        message: `citekey @${m[1]} does not appear as an id in frontmatter.references`,
        line: lineOf(body, start), match: m[0], citekey: m[1]
      });
    }
  }

  // Forbidden bibliography headings.
  const lines = body.split('\n');
  let inFence = false, fenceMarker = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[2][0];
      if (!inFence) { inFence = true; fenceMarker = marker; }
      else if (marker === fenceMarker) { inFence = false; fenceMarker = ''; }
      continue;
    }
    if (inFence) continue;
    const hMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!hMatch) continue;
    const text = hMatch[2].trim();
    if (FORBIDDEN_HEADINGS.some((re) => re.test(text))) {
      hits.push({
        rule: 'forbidden-bibliography-heading', severity: 'error',
        message: 'a body bibliography section is forbidden; the bibliography is rendered from frontmatter references',
        line: i + 1, match: line.trim()
      });
    }
  }

  return hits;
};

export const lintFrontmatter = (frontmatter) => {
  const hits = [];
  const references = frontmatter?.references;
  if (references === undefined) return hits;

  if (!Array.isArray(references)) {
    hits.push({ rule: 'references-shape', severity: 'error', message: 'frontmatter.references must be an array of CSL-JSON entries' });
    return hits;
  }

  const seenIds = new Set();
  let prevId = null;
  let outOfOrder = false;

  references.forEach((entry, i) => {
    if (typeof entry !== 'object' || entry === null) {
      hits.push({ rule: 'reference-entry-shape', severity: 'error', message: `references[${i}] must be an object (CSL-JSON entry)`, index: i });
      return;
    }
    const id = entry.id;
    if (typeof id !== 'string' || id.length === 0) {
      hits.push({ rule: 'reference-id-missing', severity: 'error', message: `references[${i}] is missing required string field "id"`, index: i });
      return;
    }
    if (!CITEKEY_RE.test(id)) {
      hits.push({ rule: 'citekey-format', severity: 'error', message: `citekey ${JSON.stringify(id)} does not match ^[a-z][a-z0-9]*\\d{4}[a-z]?$`, index: i, citekey: id });
    }
    if (entry.type !== undefined && !isCslType(entry.type)) {
      hits.push({ rule: 'type-vocabulary', severity: 'error', message: `references[${i}] type ${JSON.stringify(entry.type)} is not a CSL 1.0.2 type`, index: i, citekey: id });
    }
    if (seenIds.has(id)) {
      hits.push({ rule: 'citekey-duplicate', severity: 'error', message: `citekey ${JSON.stringify(id)} appears more than once`, index: i, citekey: id });
    } else {
      seenIds.add(id);
    }
    if (prevId !== null && id < prevId) outOfOrder = true;
    prevId = id;

    for (const role of ['author', 'editor', 'translator']) {
      const list = entry[role];
      if (list === undefined) continue;
      if (!Array.isArray(list)) {
        hits.push({ rule: `${role}-shape`, severity: 'error', message: `references[${i}].${role} must be an array of CSL name objects`, index: i, citekey: id });
        continue;
      }
      list.forEach((n, j) => {
        if (!isValidName(n)) {
          hits.push({ rule: `${role}-format`, severity: 'error', message: `references[${i}].${role}[${j}] is not a valid CSL name object ({family[,given]} | {literal})`, index: i, citekey: id });
        }
      });
    }

    if (typeof entry.URL === 'string' && entry.accessed === undefined) {
      hits.push({ rule: 'naked-url', severity: 'warning', message: `references[${i}] has URL without an accessed date`, index: i, citekey: id });
    }
  });

  if (outOfOrder) {
    hits.push({ rule: 'references-sort-order', severity: 'error', message: 'references must be sorted by id in ASCII order' });
  }
  return hits;
};

// Lint a whole document ({ frontmatter, body }). Returns { findings }.
export const lintDocument = (document) => {
  const frontmatter = document.frontmatter ?? {};
  const body = document.body ?? '';
  const references = Array.isArray(frontmatter.references) ? frontmatter.references : [];
  const refKeys = new Set(
    references
      .filter((e) => typeof e === 'object' && e !== null && typeof e.id === 'string')
      .map((e) => e.id)
  );
  const findings = [...lintFrontmatter(frontmatter), ...lintBody(body, refKeys)];
  return { findings };
};
