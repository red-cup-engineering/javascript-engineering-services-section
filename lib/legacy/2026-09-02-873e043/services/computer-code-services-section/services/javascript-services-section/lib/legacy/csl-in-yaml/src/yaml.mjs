// yaml.mjs — a minimal, zero-dependency YAML reader and writer.
//
// This is NOT a full YAML 1.2 implementation. It covers the block subset that
// Markdown frontmatter and CSL-in-YAML reference blocks actually use:
//
//   - block mappings            key: value
//   - nested block mappings     (by indentation)
//   - block sequences           - item   /   - key: value
//   - flow sequences            [a, b, [1958]]
//   - flow mappings             {family: Grad, given: Harold}
//   - scalars                   plain, 'single'-quoted, "double"-quoted
//   - block scalars             |, |-, |+, > (folded), with indentation
//   - comments                  # ... (outside quotes)
//   - null / booleans / numbers ~, null, true, false, 42, 3.14
//
// It deliberately does not support anchors, aliases, tags, or complex keys.
// Unsupported constructs raise a YamlError with a line number so callers can
// fall back rather than silently corrupt a document.

export class YamlError extends Error {
  constructor(message, line) {
    super(line == null ? message : `${message} (line ${line})`);
    this.name = 'YamlError';
    this.line = line ?? null;
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const stripComment = (line) => {
  // Remove an unquoted trailing "# ..." comment. Walk the string tracking quote
  // state so "#" inside a scalar survives.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble) {
      // A comment marker must be at start-of-line or preceded by whitespace.
      if (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t') {
        return line.slice(0, i);
      }
    }
  }
  return line;
};

const indentOf = (line) => {
  let n = 0;
  while (n < line.length && line[n] === ' ') n++;
  return n;
};

const parseScalar = (raw) => {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
  if (s === 'true' || s === 'True' || s === 'TRUE') return true;
  if (s === 'false' || s === 'False' || s === 'FALSE') return false;
  if (s[0] === '"' && s[s.length - 1] === '"' && s.length >= 2) {
    return unescapeDouble(s.slice(1, -1));
  }
  if (s[0] === "'" && s[s.length - 1] === "'" && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s[0] === '[' || s[0] === '{') return parseFlow(s);
  // Numbers — only when the whole token is numeric (keep "2019-05" a string).
  if (/^[-+]?\d+$/.test(s)) return Number.parseInt(s, 10);
  if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(s) && /[.eE]/.test(s)) {
    return Number.parseFloat(s);
  }
  return s;
};

const unescapeDouble = (s) =>
  s.replace(/\\(["\\/ntr]|u[0-9a-fA-F]{4})/g, (_, esc) => {
    switch (esc[0]) {
      case 'n': return '\n';
      case 't': return '\t';
      case 'r': return '\r';
      case '"': return '"';
      case '\\': return '\\';
      case '/': return '/';
      case 'u': return String.fromCharCode(Number.parseInt(esc.slice(1), 16));
      default: return esc;
    }
  });

// Flow collections: [a, b], {k: v}. Handles nesting and quoted commas.
const parseFlow = (text) => {
  const { value, rest } = readFlowValue(text.trim(), 0);
  if (rest.trim() !== '') throw new YamlError(`trailing content after flow value: ${JSON.stringify(rest)}`);
  return value;
};

const readFlowValue = (text, i) => {
  i = skipWs(text, i);
  const c = text[i];
  if (c === '[') return readFlowSeq(text, i);
  if (c === '{') return readFlowMap(text, i);
  if (c === '"' || c === "'") return readFlowQuoted(text, i);
  // plain scalar up to , ] } (respecting nothing else)
  let j = i;
  while (j < text.length && !',]}'.includes(text[j])) j++;
  const token = text.slice(i, j);
  return { value: parseScalar(token), rest: text.slice(j) };
};

const skipWs = (text, i) => {
  while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
  return i;
};

const readFlowSeq = (text, i) => {
  const arr = [];
  i++; // consume [
  i = skipWs(text, i);
  if (text[i] === ']') return { value: arr, rest: text.slice(i + 1) };
  while (i < text.length) {
    const parsed = readFlowValue(text, i);
    arr.push(parsed.value);
    let rest = parsed.rest;
    rest = rest.replace(/^\s+/, '');
    if (rest[0] === ',') { i = text.length - rest.length + 1; i = skipWs(text, i); continue; }
    if (rest[0] === ']') { return { value: arr, rest: rest.slice(1) }; }
    throw new YamlError(`malformed flow sequence near ${JSON.stringify(rest)}`);
  }
  throw new YamlError('unterminated flow sequence');
};

const readFlowMap = (text, i) => {
  const obj = {};
  i++; // consume {
  i = skipWs(text, i);
  if (text[i] === '}') return { value: obj, rest: text.slice(i + 1) };
  while (i < text.length) {
    i = skipWs(text, i);
    // key (quoted or plain up to ':')
    let key;
    if (text[i] === '"' || text[i] === "'") {
      const k = readFlowQuoted(text, i);
      key = k.value;
      i = text.length - k.rest.length;
      i = skipWs(text, i);
      if (text[i] !== ':') throw new YamlError('expected ":" after quoted flow key');
      i++;
    } else {
      let j = i;
      while (j < text.length && text[j] !== ':') j++;
      key = text.slice(i, j).trim();
      i = j + 1;
    }
    const parsed = readFlowValue(text, i);
    obj[key] = parsed.value;
    let rest = parsed.rest.replace(/^\s+/, '');
    if (rest[0] === ',') { i = text.length - rest.length + 1; continue; }
    if (rest[0] === '}') return { value: obj, rest: rest.slice(1) };
    throw new YamlError(`malformed flow mapping near ${JSON.stringify(rest)}`);
  }
  throw new YamlError('unterminated flow mapping');
};

const readFlowQuoted = (text, i) => {
  const quote = text[i];
  let j = i + 1;
  let out = '';
  while (j < text.length) {
    const c = text[j];
    if (quote === "'" ) {
      if (c === "'" && text[j + 1] === "'") { out += "'"; j += 2; continue; }
      if (c === "'") return { value: out, rest: text.slice(j + 1) };
      out += c; j++;
    } else {
      if (c === '\\') { out += unescapeDouble(text.slice(j, j + 2)); j += 2; continue; }
      if (c === '"') return { value: out, rest: text.slice(j + 1) };
      out += c; j++;
    }
  }
  throw new YamlError('unterminated quoted scalar in flow context');
};

// The recursive-descent block parser. `lines` is an array of {n, indent, text}
// with comments and blanks already handled by the caller via a cursor object.

class Cursor {
  constructor(rawLines) {
    // Each element: { n: 1-based line number, raw: original line }
    this.lines = rawLines;
    this.i = 0;
  }
  peek() { return this.i < this.lines.length ? this.lines[this.i] : null; }
  next() { return this.lines[this.i++]; }
  eof() { return this.i >= this.lines.length; }
}

// Is this a "content" line (not blank, not a pure comment)?
const isContent = (raw) => {
  const stripped = stripComment(raw).trim();
  return stripped.length > 0;
};

const parseBlock = (cursor, minIndent) => {
  // Determine the block's own indent from the first content line at/above min.
  let first = null;
  while (!cursor.eof()) {
    const line = cursor.peek();
    if (!isContent(line.raw)) { cursor.next(); continue; }
    first = line;
    break;
  }
  if (!first) return null;
  const indent = indentOf(stripComment(first.raw));
  if (indent < minIndent) return null;

  const body = stripComment(first.raw).slice(indent);
  if (body.startsWith('- ') || body === '-') {
    return parseSequence(cursor, indent);
  }
  return parseMapping(cursor, indent);
};

const SEQ_RE = /^-(\s+|$)/;

const parseSequence = (cursor, indent) => {
  const arr = [];
  while (!cursor.eof()) {
    const line = cursor.peek();
    if (!isContent(line.raw)) { cursor.next(); continue; }
    const stripped = stripComment(line.raw);
    const curIndent = indentOf(stripped);
    if (curIndent < indent) break;
    if (curIndent > indent) {
      throw new YamlError(`unexpected indentation in sequence`, line.n);
    }
    const afterDash = stripped.slice(indent);
    if (!SEQ_RE.test(afterDash)) break; // a mapping starts at this indent, not seq
    cursor.next();
    const rest = afterDash.replace(SEQ_RE, '');
    if (rest.trim() === '') {
      // Nested block on following deeper lines.
      const child = parseBlock(cursor, indent + 1);
      arr.push(child === null ? null : child);
    } else if (looksLikeMapEntry(rest)) {
      // "- key: value" — the dash introduces a mapping whose first key sits at
      // column indent+2. Re-inject the line minus the dash and parse a mapping.
      const injected = new Cursor([{ n: line.n, raw: ' '.repeat(indent + 2) + rest }]);
      // Also let the mapping consume following deeper lines from the real cursor.
      const merged = mergeCursors(injected, cursor, indent + 2);
      arr.push(parseMapping(merged, indent + 2));
    } else if (SEQ_RE.test(rest)) {
      // "- - x" — a sequence item that is itself a (possibly inline) sequence,
      // e.g. CSL date-parts written as block-of-block. Re-inject and recurse.
      const injected = new Cursor([{ n: line.n, raw: ' '.repeat(indent + 2) + rest }]);
      const merged = mergeCursors(injected, cursor, indent + 2);
      arr.push(parseSequence(merged, indent + 2));
    } else {
      arr.push(parseInlineScalarOrBlock(rest, cursor, { childMinIndent: indent + 2 }, line.n));
    }
  }
  return arr;
};

// Combine one synthetic line with the remaining real cursor lines so a mapping
// that begins on a "- key:" line can keep reading its continuation lines.
const mergeCursors = (head, tail, minIndent) => {
  const collected = [head.lines[0]];
  while (!tail.eof()) {
    const line = tail.peek();
    if (!isContent(line.raw)) { collected.push(line); tail.next(); continue; }
    const ci = indentOf(stripComment(line.raw));
    if (ci < minIndent) break;
    collected.push(line);
    tail.next();
  }
  return new Cursor(collected);
};

const looksLikeMapEntry = (text) => splitKey(text) !== null;

// Split "key: value" respecting quotes. Returns { key, value } or null.
const splitKey = (text) => {
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') depth--;
      else if (c === ':' && depth === 0 && (i + 1 >= text.length || text[i + 1] === ' ' || text[i + 1] === '\t')) {
        return { key: text.slice(0, i), value: text.slice(i + 1) };
      }
    }
  }
  return null;
};

const parseKeyToken = (raw) => {
  const s = raw.trim();
  if (s[0] === '"' && s[s.length - 1] === '"') return unescapeDouble(s.slice(1, -1));
  if (s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'");
  return s;
};

const parseMapping = (cursor, indent) => {
  const obj = {};
  while (!cursor.eof()) {
    const line = cursor.peek();
    if (!isContent(line.raw)) { cursor.next(); continue; }
    const stripped = stripComment(line.raw);
    const curIndent = indentOf(stripped);
    if (curIndent < indent) break;
    if (curIndent > indent) throw new YamlError('unexpected indentation in mapping', line.n);
    const body = stripped.slice(indent);
    if (SEQ_RE.test(body)) break; // sequence at this indent belongs to parent
    const split = splitKey(body);
    if (!split) throw new YamlError(`expected "key: value" but got ${JSON.stringify(body)}`, line.n);
    cursor.next();
    const key = parseKeyToken(split.key);
    obj[key] = parseInlineScalarOrBlock(split.value, cursor, { childMinIndent: indent + 1, sameIndentSeq: indent }, line.n);
  }
  return obj;
};

// Given the text after "key:" (or "- "), decide: block scalar, nested block,
// or inline scalar. `opts.childMinIndent` is the minimum indent for a deeper
// nested block; `opts.sameIndentSeq`, when set, is an indent at which a block
// sequence may legally begin (YAML allows a sequence value to sit at its key's
// own column).
const parseInlineScalarOrBlock = (afterColon, cursor, opts, lineNo) => {
  const { childMinIndent, sameIndentSeq } = opts;
  const trimmed = afterColon.trim();
  if (trimmed === '|' || trimmed === '>' || /^[|>][-+]?\d*$/.test(trimmed)) {
    return parseBlockScalar(trimmed, cursor, childMinIndent);
  }
  if (trimmed === '') {
    // A block sequence may appear at the key's own indentation.
    if (sameIndentSeq != null) {
      const nextContent = peekContent(cursor);
      if (nextContent) {
        const ci = indentOf(stripComment(nextContent.raw));
        const body = stripComment(nextContent.raw).slice(ci);
        if (ci === sameIndentSeq && SEQ_RE.test(body)) {
          return parseSequence(cursor, sameIndentSeq);
        }
      }
    }
    const saved = cursor.i;
    const child = parseBlock(cursor, childMinIndent);
    if (child === null) { cursor.i = saved; return null; }
    return child;
  }
  return parseScalar(trimmed);
};

// Look ahead to the next content line without consuming blanks/comments.
const peekContent = (cursor) => {
  for (let i = cursor.i; i < cursor.lines.length; i++) {
    if (isContent(cursor.lines[i].raw)) return cursor.lines[i];
  }
  return null;
};

const parseBlockScalar = (header, cursor, parentIndent) => {
  const folded = header[0] === '>';
  const chomp = header.includes('-') ? 'strip' : header.includes('+') ? 'keep' : 'clip';
  const collected = [];
  let blockIndent = null;
  while (!cursor.eof()) {
    const line = cursor.peek();
    const raw = line.raw;
    if (raw.trim() === '') { collected.push(''); cursor.next(); continue; }
    const ci = indentOf(raw);
    if (blockIndent === null) {
      if (ci < parentIndent) break;
      blockIndent = ci;
    }
    if (ci < blockIndent) break;
    collected.push(raw.slice(blockIndent));
    cursor.next();
  }
  // Trim trailing blank lines according to chomping.
  while (collected.length > 0 && collected[collected.length - 1] === '') collected.pop();
  let text;
  if (folded) {
    text = collected.reduce((acc, cur, idx) => {
      if (idx === 0) return cur;
      const prev = collected[idx - 1];
      if (prev === '' || cur === '') return acc + '\n' + cur;
      return acc + ' ' + cur;
    }, '');
  } else {
    text = collected.join('\n');
  }
  if (chomp === 'clip' || chomp === 'keep') text += '\n';
  return text;
};

export const parse = (source) => {
  if (typeof source !== 'string') throw new YamlError('parse() expects a string');
  const rawLines = source.replace(/\r\n?/g, '\n').split('\n').map((raw, idx) => ({ n: idx + 1, raw }));
  // Drop a leading document marker line if present.
  const cursor = new Cursor(rawLines);
  const first = cursor.peek();
  if (first && first.raw.trim() === '---') cursor.next();
  if (cursor.eof()) return null;
  const result = parseBlock(cursor, 0);
  return result === undefined ? null : result;
};

// ---------------------------------------------------------------------------
// Dumping
// ---------------------------------------------------------------------------

const needsQuote = (s) => {
  if (s === '') return true;
  if (/^[\s]|[\s]$/.test(s)) return true;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s)) return true;
  if (/:(\s|$)/.test(s)) return true;
  if (/\s#/.test(s)) return true;
  if (/[\n\t]/.test(s)) return true;
  // Tokens that would otherwise be read back as non-strings.
  if (/^(null|Null|NULL|~|true|True|TRUE|false|False|FALSE)$/.test(s)) return true;
  if (/^[-+]?\d+$/.test(s)) return true;
  if (/^[-+]?(\d+\.\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return true;
  return false;
};

const dumpScalar = (value) => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  const s = String(value);
  if (s.includes('\n')) {
    // Emit as a double-quoted scalar with escapes; block scalars are handled by
    // the mapping/sequence writer which has indentation context.
    return dumpDoubleQuoted(s);
  }
  if (needsQuote(s)) {
    if (!s.includes("'")) return `'${s}'`;
    return dumpDoubleQuoted(s);
  }
  return s;
};

const dumpDoubleQuoted = (s) =>
  '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t') + '"';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const isScalar = (v) => v === null || v === undefined || typeof v !== 'object';
const allScalar = (arr) => arr.every(isScalar);

// A flow sequence like [a, b] or [[1958]] — used for compact scalar arrays and
// arrays of scalar arrays (e.g. CSL date-parts).
const dumpFlowSeq = (arr) => {
  const parts = arr.map((item) => {
    if (Array.isArray(item)) return dumpFlowSeq(item);
    if (isPlainObject(item)) return dumpFlowMap(item);
    return dumpScalar(item);
  });
  return `[${parts.join(', ')}]`;
};

const dumpFlowMap = (obj) => {
  const parts = Object.keys(obj).map((k) => `${keyToken(k)}: ${
    Array.isArray(obj[k]) ? dumpFlowSeq(obj[k]) : isPlainObject(obj[k]) ? dumpFlowMap(obj[k]) : dumpScalar(obj[k])
  }`);
  return `{${parts.join(', ')}}`;
};

// Should this array render inline as a flow sequence? Yes for arrays of scalars
// and arrays whose items are themselves flow-eligible scalar arrays.
const flowEligible = (arr) =>
  arr.length > 0 &&
  arr.every((item) => isScalar(item) || (Array.isArray(item) && allScalar(item)));

const dumpNode = (value, indent, opts) => {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]\n`;
    let out = '';
    for (const item of value) {
      if (isPlainObject(item) && Object.keys(item).length > 0) {
        // "- " then the mapping's first key inline, rest indented.
        const inner = dumpMappingInline(item, indent + 2, opts);
        out += `${pad}- ${inner.first}\n${inner.rest}`;
      } else if (Array.isArray(item) && item.length > 0) {
        if (flowEligible(item)) out += `${pad}- ${dumpFlowSeq(item)}\n`;
        else out += `${pad}-\n` + dumpNode(item, indent + 2, opts);
      } else if (Array.isArray(item)) {
        out += `${pad}- []\n`;
      } else if (isPlainObject(item)) {
        out += `${pad}- {}\n`;
      } else {
        out += `${pad}- ${dumpScalar(item)}\n`;
      }
    }
    return out;
  }
  if (isPlainObject(value)) {
    return dumpMapping(value, indent, opts);
  }
  return `${pad}${dumpScalar(value)}\n`;
};

const dumpMapping = (obj, indent, opts) => {
  const pad = ' '.repeat(indent);
  const keys = Object.keys(obj);
  if (keys.length === 0) return `${pad}{}\n`;
  let out = '';
  for (const key of keys) {
    out += dumpEntry(key, obj[key], indent, opts);
  }
  return out;
};

// Like dumpMapping but returns the first key rendered inline (for "- key:").
const dumpMappingInline = (obj, indent, opts) => {
  const keys = Object.keys(obj);
  const pad = ' '.repeat(indent);
  const firstKey = keys[0];
  const firstEntry = dumpEntry(firstKey, obj[firstKey], indent, opts);
  // firstEntry begins with `pad`; strip it for the inline slot.
  const first = firstEntry.slice(pad.length).replace(/\n$/, '');
  let rest = '';
  for (let i = 1; i < keys.length; i++) rest += dumpEntry(keys[i], obj[keys[i]], indent, opts);
  // A multi-line first entry (e.g. nested block) must keep its later lines.
  const firstLines = first.split('\n');
  if (firstLines.length > 1) {
    return { first: firstLines[0], rest: firstLines.slice(1).join('\n') + '\n' + rest };
  }
  return { first, rest };
};

const dumpEntry = (key, value, indent, opts) => {
  const pad = ' '.repeat(indent);
  const k = keyToken(key);
  if (value === null || value === undefined) return `${pad}${k}: null\n`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}${k}: []\n`;
    if (flowEligible(value)) return `${pad}${k}: ${dumpFlowSeq(value)}\n`;
    // Block sequences are indented two spaces past the key so the reader can
    // always distinguish them from a sibling key.
    return `${pad}${k}:\n` + dumpNode(value, indent + 2, opts);
  }
  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) return `${pad}${k}: {}\n`;
    return `${pad}${k}:\n` + dumpMapping(value, indent + 2, opts);
  }
  if (typeof value === 'string' && value.includes('\n') && opts.blockScalars) {
    return `${pad}${k}: |\n` + blockScalarBody(value, indent + 2);
  }
  return `${pad}${k}: ${dumpScalar(value)}\n`;
};

const blockScalarBody = (text, indent) => {
  const pad = ' '.repeat(indent);
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  return body.split('\n').map((l) => (l === '' ? '' : pad + l)).join('\n') + '\n';
};

const keyToken = (key) => {
  const s = String(key);
  if (needsQuote(s) || s.includes(':')) {
    if (!s.includes("'")) return `'${s}'`;
    return dumpDoubleQuoted(s);
  }
  return s;
};

export const dump = (value, options = {}) => {
  const opts = { blockScalars: options.blockScalars ?? true };
  if (value === null || value === undefined) return 'null\n';
  if (Array.isArray(value) || isPlainObject(value)) return dumpNode(value, 0, opts);
  return dumpScalar(value) + '\n';
};
