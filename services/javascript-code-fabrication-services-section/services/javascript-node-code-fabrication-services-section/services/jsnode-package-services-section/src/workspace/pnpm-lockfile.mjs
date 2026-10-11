/**
 * codecs/text/pnpm-lockfile — the `importers:` subtree of a pnpm-lock.yaml v9
 * document, decoded to a normal form.
 *
 * A pnpm lockfile's `packages:`/`snapshots:` registry-resolution sections use
 * flow-map keys, parenthesized peer-resolution suffixes, and content hashes —
 * a wire shape well outside `codecs/text/yaml`'s frontmatter subset. This
 * codec accepts only the bounded, regular shape of the `importers:` subtree
 * (workspace-relative importer keys, each with `dependencies`/
 * `devDependencies`/`optionalDependencies` maps of `{specifier, version}`)
 * and rejects a document that lacks it. Pure string -> value; TypeError is
 * the only failure mode, same discipline as `codecs/text/yaml`.
 */

const DEPENDENCY_FIELDS = Object.freeze(["dependencies", "devDependencies", "optionalDependencies"]);

function indentOf(line) {
  return line.length - line.trimStart().length;
}

function isBlank(line) {
  return line === undefined || line.trim() === "";
}

function unquoteKey(token) {
  if (token.startsWith("'") && token.endsWith("'") && token.length >= 2) return token.slice(1, -1);
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) return token.slice(1, -1);
  return token;
}

/** Split a `key: rest` or bare `key:` line into its key and remaining text,
 *  honoring a single- or double-quoted key. Returns null when the line is not
 *  a key line at all. */
function splitKeyLine(body) {
  if (body.startsWith("'") || body.startsWith('"')) {
    const quote = body[0];
    const close = body.indexOf(quote, 1);
    if (close === -1) return null;
    const after = body.slice(close + 1);
    if (!after.startsWith(":")) return null;
    return { key: unquoteKey(body.slice(0, close + 1)), rest: after.slice(1) };
  }
  const colon = body.indexOf(":");
  if (colon === -1) return null;
  return { key: body.slice(0, colon), rest: body.slice(colon + 1) };
}

function requireLockfileVersion(lines) {
  const line = lines.find((candidate) => candidate.startsWith("lockfileVersion:"));
  if (line === undefined) throw new TypeError("pnpm-lockfile: missing lockfileVersion — not a pnpm-lock.yaml document");
  return unquoteKey(line.slice("lockfileVersion:".length).trim());
}

function dependencyBlock(lines, cursor, indent, field) {
  const uses = [];
  for (;;) {
    const line = lines[cursor.pos];
    if (isBlank(line)) { cursor.pos += 1; continue; }
    if (line === undefined || indentOf(line) !== indent) break;
    const split = splitKeyLine(line.slice(indent));
    if (split === null) break;
    cursor.pos += 1;
    let specifier = "";
    let version = "";
    while (indentOf(lines[cursor.pos] ?? "") > indent || isBlank(lines[cursor.pos])) {
      const detailLine = lines[cursor.pos];
      if (isBlank(detailLine)) { cursor.pos += 1; continue; }
      if (detailLine === undefined) break;
      const detail = splitKeyLine(detailLine.trim());
      if (detail?.key === "specifier") specifier = detail.rest.trim();
      else if (detail?.key === "version") version = detail.rest.trim();
      cursor.pos += 1;
    }
    uses.push(Object.freeze({
      name: split.key,
      field,
      specifier,
      version,
      workspaceLink: version.startsWith("link:"),
    }));
  }
  return Object.freeze(uses);
}

function importerDependencies(lines, cursor, importerIndent) {
  const fieldIndent = importerIndent + 2;
  const uses = [];
  for (;;) {
    const line = lines[cursor.pos];
    if (isBlank(line)) { cursor.pos += 1; continue; }
    if (line === undefined || indentOf(line) !== fieldIndent) break;
    const key = line.slice(fieldIndent).replace(/:\s*$/u, "");
    if (!(DEPENDENCY_FIELDS).includes(key)) break;
    cursor.pos += 1;
    uses.push(...dependencyBlock(lines, cursor, fieldIndent + 2, key));
  }
  return Object.freeze(uses);
}

/** Decode the `importers:` subtree of a pnpm-lock.yaml v9 document. Throws
 *  when the document has no `lockfileVersion` or `importers:` root key — the
 *  representation this codec witnesses as membership. */
export function decodePnpmLockfileImporters(text) {
  if (typeof text !== "string") throw new TypeError("pnpm-lockfile: document must be a string");
  const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  const lockfileVersion = requireLockfileVersion(lines);

  const importersLineIndex = lines.findIndex((line) => line === "importers:");
  if (importersLineIndex === -1) throw new TypeError("pnpm-lockfile: missing importers: root key");

  const cursor = { pos: importersLineIndex + 1 };
  const importers = [];
  const importerIndent = 2;
  for (;;) {
    const line = lines[cursor.pos];
    if (isBlank(line)) { cursor.pos += 1; continue; }
    if (line === undefined || indentOf(line) !== importerIndent) break;
    const split = splitKeyLine(line.slice(importerIndent));
    if (split === null) break;
    cursor.pos += 1;
    const dependencies = split.rest.trim() === "{}" ? Object.freeze([]) : importerDependencies(lines, cursor, importerIndent);
    importers.push(Object.freeze({ path: split.key, dependencies }));
  }

  return Object.freeze({ lockfileVersion, importers: Object.freeze(importers) });
}

/** A top-level section's entries (two-space-indented keys), each with the lines it spans. */
function sectionEntries(lines, start) {
  const entries = new Map();
  const lead = [];
  let key;
  let end = start;
  for (; end < lines.length && (isBlank(lines[end]) || indentOf(lines[end]) > 0); end += 1) {
    const line = lines[end];
    if (!isBlank(line) && indentOf(line) === 2) {
      key = splitKeyLine(line.slice(2))?.key;
      if (key === undefined) throw new TypeError(`pnpm-lockfile: unreadable entry at line ${end + 1}`);
      entries.set(key, []);
    }
    (key === undefined ? lead : entries.get(key)).push(line);
  }
  return { lead, entries, end };
}

/** Each top-level section of the document, in order, with its entries. */
function sections(text) {
  const lines = text.split("\n");
  const parts = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (/^[^\s#][^:]*:\s*$/u.test(line)) {
      const { lead, entries, end } = sectionEntries(lines, index + 1);
      parts.push({ name: line.slice(0, -1).trim(), head: line, lead, entries });
      index = end;
    } else {
      parts.push({ text: line });
      index += 1;
    }
  }
  return parts;
}

/** Entries of `entries` with `key` set to `block`, a new key placed before the first greater one. */
function withEntry(entries, key, block) {
  if (entries.has(key) || [...entries.keys()].every((other) => other < key)) return new Map(entries).set(key, block);
  const placed = new Map();
  for (const [other, lines] of entries) {
    if (!placed.has(key) && other > key) placed.set(key, block);
    placed.set(other, lines);
  }
  return placed;
}

/**
 * The lockfile `base` with the named importers as `source` has them: the cut
 * of a shared workspace lockfile that one change owns. Every other importer
 * stays as `base` has it, whatever other writers have done to `source`; an
 * importer `source` no longer has is removed. `packages:` and `snapshots:`
 * entries `source` adds are carried, since a named importer may resolve them;
 * entries `source` dropped stay until a whole-lockfile install prunes them.
 */
export function cutPnpmLockfile(base, source, importers) {
  decodePnpmLockfileImporters(base);
  decodePnpmLockfileImporters(source);
  const from = new Map(sections(source).filter(({ name }) => name !== undefined).map((part) => [part.name, part.entries]));
  const parts = sections(base).map((part) => {
    if (part.name === "importers") {
      let entries = part.entries;
      for (const importer of importers) {
        const block = from.get("importers")?.get(importer);
        if (block) entries = withEntry(entries, importer, block);
        else { entries = new Map(entries); entries.delete(importer); }
      }
      return { ...part, entries };
    }
    if (part.name === "packages" || part.name === "snapshots") {
      let entries = part.entries;
      for (const [key, block] of from.get(part.name) ?? []) if (!entries.has(key)) entries = withEntry(entries, key, block);
      return { ...part, entries };
    }
    return part;
  });
  return parts.map((part) => (part.name === undefined ? part.text : [part.head, ...part.lead, ...[...part.entries.values()].flat()].join("\n"))).join("\n");
}
