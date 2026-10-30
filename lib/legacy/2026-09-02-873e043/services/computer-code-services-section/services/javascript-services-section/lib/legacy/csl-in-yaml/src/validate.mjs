// validate.mjs — zero-dependency validation of CSL-JSON reference entries.
//
// This replaces the ajv-based schema check from the original toolkit with a
// hand-rolled validator that enforces the same csl-data contract: required
// fields, the CSL type vocabulary, name/date shapes, and the per-type
// conditional requirements (article-journal needs container-title, webpage
// needs URL+accessed, thesis needs publisher+genre, etc.).

import { isCslType, isValidName, issuedYear, NAME_ROLES, DATE_ROLES } from './csl.mjs';

const isNonEmptyString = (v) => typeof v === 'string' && v.length > 0;
const isIntOrString = (v) => Number.isInteger(v) || isNonEmptyString(v);

const isValidDate = (d) => {
  if (typeof d !== 'object' || d === null) return false;
  const parts = d['date-parts'];
  if (parts !== undefined) {
    if (!Array.isArray(parts) || parts.length < 1 || parts.length > 2) return false;
    for (const p of parts) {
      if (!Array.isArray(p) || p.length < 1 || p.length > 3) return false;
      if (!p.every((n) => Number.isInteger(n))) return false;
    }
    return true;
  }
  // A date given only as a literal/raw/season is tolerated.
  if (isNonEmptyString(d.literal) || isNonEmptyString(d.raw) || isNonEmptyString(d.season)) return true;
  return false;
};

// Per-type conditional requirements (subset of csl-data, matching the toolkit).
const CONDITIONAL_REQUIRED = {
  'article-journal': ['container-title'],
  'chapter': ['container-title'],
  'paper-conference': ['container-title'],
  'thesis': ['publisher', 'genre'],
  'report': ['publisher'],
  'standard': ['publisher'],
  'webpage': ['URL', 'accessed']
};

// Validate a single CSL-JSON entry. Returns { valid, errors: [{path, message}] }.
export const validateEntry = (entry, index = null) => {
  const errors = [];
  const at = index == null ? '' : `references[${index}]`;
  const push = (path, message) => errors.push({ path: at + path, message });

  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return { valid: false, errors: [{ path: at, message: 'entry must be an object' }] };
  }

  // Required core fields.
  if (!isNonEmptyString(entry.id)) push('.id', 'missing required non-empty string "id"');
  if (entry.type === undefined) push('.type', 'missing required "type"');
  else if (!isCslType(entry.type)) push('.type', `"${entry.type}" is not a CSL 1.0.2 type`);
  if (!isNonEmptyString(entry.title) && !isNonEmptyString(entry['title-short'])) {
    push('.title', 'missing required non-empty string "title"');
  }
  if (entry.issued === undefined) push('.issued', 'missing required "issued" date');
  else if (!isValidDate(entry.issued)) push('.issued', 'not a valid CSL date object');

  // At least one of author / editor.
  if (entry.author === undefined && entry.editor === undefined) {
    push('', 'entry must have at least one of "author" or "editor"');
  }

  // Name roles.
  for (const role of NAME_ROLES) {
    const list = entry[role];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.length === 0) {
      push(`.${role}`, `"${role}" must be a non-empty array of CSL name objects`);
      continue;
    }
    list.forEach((n, i) => {
      if (!isValidName(n)) push(`.${role}[${i}]`, 'not a valid CSL name object ({family[,given]} | {literal})');
    });
  }

  // Date roles ("issued" is already checked above as a required field).
  for (const role of DATE_ROLES) {
    if (role === 'issued') continue;
    if (entry[role] === undefined) continue;
    if (!isValidDate(entry[role])) push(`.${role}`, 'not a valid CSL date object');
  }

  // Number-ish fields.
  for (const f of ['volume', 'issue', 'number', 'edition']) {
    if (entry[f] !== undefined && !isIntOrString(entry[f])) {
      push(`.${f}`, `"${f}" must be an integer or string`);
    }
  }

  // Conditional per-type requirements.
  const conds = CONDITIONAL_REQUIRED[entry.type];
  if (conds) {
    for (const req of conds) {
      if (entry[req] === undefined) push(`.${req}`, `type "${entry.type}" requires "${req}"`);
    }
  }

  return { valid: errors.length === 0, errors };
};

// Validate a whole references array. Returns { valid, errors, findings } where
// findings additionally cover cross-entry rules (duplicate ids). Sort-order and
// citekey-format live in lint.mjs since they are policy, not schema.
export const validateReferences = (references) => {
  const errors = [];
  if (!Array.isArray(references)) {
    return { valid: false, errors: [{ path: 'references', message: 'references must be an array of CSL-JSON entries' }] };
  }
  const seen = new Set();
  references.forEach((entry, i) => {
    const r = validateEntry(entry, i);
    errors.push(...r.errors);
    const id = entry && entry.id;
    if (typeof id === 'string') {
      if (seen.has(id)) errors.push({ path: `references[${i}].id`, message: `duplicate id "${id}"` });
      seen.add(id);
    }
  });
  return { valid: errors.length === 0, errors };
};

export { issuedYear };
