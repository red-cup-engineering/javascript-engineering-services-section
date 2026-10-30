// csl.mjs — CSL-JSON vocabulary and helpers shared across the tool.
//
// CSL-JSON is the citation model consumed directly by Pandoc citeproc,
// citeproc-js, Zotero, and Mendeley. In this tool every reference entry is a
// CSL-JSON object; a document's `references:` frontmatter is an array of them.

// CSL 1.0.2 item types.
export const CSL_TYPES = Object.freeze([
  'article', 'article-journal', 'article-magazine', 'article-newspaper',
  'bill', 'book', 'broadcast', 'chapter', 'classic', 'collection',
  'dataset', 'document', 'entry', 'entry-dictionary', 'entry-encyclopedia',
  'event', 'figure', 'graphic', 'hearing', 'interview', 'legal_case',
  'legislation', 'manuscript', 'map', 'motion_picture', 'musical_score',
  'pamphlet', 'paper-conference', 'patent', 'performance', 'periodical',
  'personal_communication', 'post', 'post-weblog', 'regulation', 'report',
  'review', 'review-book', 'software', 'song', 'speech', 'standard',
  'thesis', 'treaty', 'webpage'
]);

const CSL_TYPE_SET = new Set(CSL_TYPES);
export const isCslType = (t) => CSL_TYPE_SET.has(t);

// Roles whose values are arrays of CSL name objects.
export const NAME_ROLES = Object.freeze(['author', 'editor', 'translator', 'contributor', 'director', 'recipient']);

// Roles whose values are CSL date objects.
export const DATE_ROLES = Object.freeze(['issued', 'accessed', 'available-date', 'event-date', 'original-date', 'submitted']);

// Citekey grammar per the markdown-document convention: surnameYYYY with an
// optional single trailing lowercase disambiguator. No hyphens.
export const CITEKEY_RE = /^[a-z][a-z0-9]*\d{4}[a-z]?$/;
export const isCitekey = (s) => typeof s === 'string' && CITEKEY_RE.test(s);

// A preferred field order for readable, diff-stable output. Unknown fields are
// appended in their existing order after the known ones.
const FIELD_ORDER = [
  'id', 'type',
  'author', 'editor', 'translator', 'contributor', 'director', 'recipient',
  'title', 'title-short',
  'container-title', 'collection-title', 'original-title',
  'issued', 'original-date', 'accessed', 'event-date', 'submitted',
  'volume', 'issue', 'number', 'chapter-number', 'edition', 'version',
  'page', 'page-first', 'number-of-pages', 'number-of-volumes',
  'publisher', 'publisher-place', 'event', 'event-place', 'genre', 'medium',
  'DOI', 'URL', 'ISBN', 'ISSN', 'PMID', 'PMCID',
  'language', 'abstract', 'note', 'annote', 'keyword', 'status'
];

export const orderEntry = (entry) => {
  const out = {};
  for (const key of FIELD_ORDER) {
    if (Object.prototype.hasOwnProperty.call(entry, key)) out[key] = entry[key];
  }
  for (const key of Object.keys(entry)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = entry[key];
  }
  return out;
};

// Extract the canonical issued year from a CSL date object, or null.
export const issuedYear = (date) => {
  if (!date || typeof date !== 'object') return null;
  const parts = date['date-parts'];
  if (Array.isArray(parts) && Array.isArray(parts[0]) && Number.isInteger(parts[0][0])) {
    return parts[0][0];
  }
  return null;
};

// Build a CSL date object from a year (and optional month/day).
export const cslDate = (year, month, day) => {
  const part = [year];
  if (month != null) part.push(month);
  if (day != null) part.push(day);
  return { 'date-parts': [part] };
};

// A CSL name is valid when it has a non-empty family OR a non-empty literal.
export const isValidName = (name) => {
  if (typeof name !== 'object' || name === null) return false;
  if (typeof name.family === 'string' && name.family.length > 0) return true;
  if (typeof name.literal === 'string' && name.literal.length > 0) return true;
  return false;
};

// Turn a "Surname, Given" or "Given Surname" or "Institution" string into a
// CSL name object. Personal names split on the first comma; comma-free
// multi-word strings are treated as "Given ... Surname"; single tokens and
// obvious institutions become {literal}.
export const nameFromString = (raw) => {
  const s = String(raw).trim();
  if (s === '') return { literal: '' };
  if (s.includes(',')) {
    const [family, ...rest] = s.split(',');
    const given = rest.join(',').trim();
    const name = { family: family.trim() };
    if (given) name.given = given;
    return name;
  }
  const parts = s.split(/\s+/);
  // Heuristic: a multi-word, capitalized run with a lowercase word (of, for,
  // and) or 3+ tokens where the head is not an initial reads as an institution.
  const looksInstitutional = /\b(of|for|and|the|association|institute|organization|committee|consortium|group|university|press|inc\.?|ltd\.?|corp\.?)\b/i.test(s);
  if (looksInstitutional || parts.length === 1) return { literal: s };
  const family = parts.pop();
  return { family, given: parts.join(' ') };
};

// Normalize a surname to a citekey-safe token: lowercase, ASCII-folded, no
// punctuation or spaces.
export const surnameToken = (name) => {
  const source = typeof name === 'string' ? name : (name.family ?? name.literal ?? '');
  const head = String(source).split(',')[0];
  return head
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

// Compose a citekey from name objects and a year, disambiguating against a set
// of taken keys with a trailing letter (surnameYYYY, surnameYYYYa, ...).
// Multi-author works use the first author's surname (no hyphen, per the
// no-hyphen citekey grammar).
export const makeCitekey = (names, year, taken = new Set()) => {
  const tokens = (names ?? []).map(surnameToken).filter((t) => t.length > 0);
  const base = tokens.length > 0 ? `${tokens[0]}${year}` : `anon${year}`;
  if (!taken.has(base)) return base;
  for (const suffix of 'abcdefghijklmnopqrstuvwxyz') {
    const candidate = `${base}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`csl-in-yaml: too many citekey collisions on ${base}`);
};

// Stable comparison of two ids in ASCII order (matches the sort-order rule).
export const compareIds = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
