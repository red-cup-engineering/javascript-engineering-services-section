#!/usr/bin/env node
// cli.mjs — command-line interface for csl-in-yaml.
//
//   csl-in-yaml lint     <path...>            check citation discipline
//   csl-in-yaml validate <path...>            validate references against CSL-JSON
//   csl-in-yaml sort     <path...>            sort/normalize references (--check/--write)
//   csl-in-yaml parse    [text] [--file f]    free-form citation -> CSL-JSON YAML
//
// Zero dependencies; Node >= 20.

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { splitDocument, joinDocument } from '../src/frontmatter.mjs';
import { dump as dumpYaml } from '../src/yaml.mjs';
import { lintDocument } from '../src/lint.mjs';
import { validateReferences } from '../src/validate.mjs';
import { sortReferences } from '../src/sort.mjs';
import { parseCitations } from '../src/parse-citation.mjs';
import { orderEntry } from '../src/csl.mjs';

const PKG = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));

const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude']);

// ---- shared helpers ----

const USAGE = `csl-in-yaml ${PKG.version} — author, lint, and generate CSL-in-YAML citation blocks

Usage:
  csl-in-yaml <command> [options]

Commands:
  lint      <path...>            Check citation discipline in Markdown documents
  validate  <path...>            Validate frontmatter references against CSL-JSON
  sort      <path...>            Sort & normalize a document's references array
  parse     [text]              Convert free-form citation text into CSL-JSON YAML

Global options:
  -h, --help                     Show help
  -v, --version                  Show version

Run "csl-in-yaml <command> --help" for command-specific options.`;

const LINT_USAGE = `csl-in-yaml lint <path...> [options]
  Report citation-discipline findings for Markdown documents or directories.

  -r, --recursive     Walk subdirectories
      --json          Emit findings as JSON
  Exit code 1 if any error-severity finding is present.`;

const SORT_USAGE = `csl-in-yaml sort <path...> [options]
  Sort references by id (ASCII) and order each entry's fields canonically.

  -r, --recursive     Walk subdirectories
      --write         Write changes back to files (default: print to stdout)
      --check         Exit 1 if any file would change; write nothing`;

const VALIDATE_USAGE = `csl-in-yaml validate <path...> [options]
  Validate each document's frontmatter references against the CSL-JSON contract.

  -r, --recursive     Walk subdirectories
      --json          Emit results as JSON
  Exit code 1 if any entry is invalid.`;

const PARSE_USAGE = `csl-in-yaml parse [text] [options]
  Convert free-form bibliography lines into CSL-JSON reference entries.
  Reads positional text, --file, or stdin (one citation per line).

      --file <path>       Read citations from a file
      --json              Emit JSON instead of YAML
      --min-confidence <high|medium|low>   Keep parses at/above this level (default: medium)
      --now <YYYY-MM-DD>  Access date for living documents (default: today)`;

function* walkMarkdown(root, { recursive }) {
  let stat;
  try { stat = statSync(root); } catch { return; }
  if (stat.isFile()) { if (root.endsWith('.md')) yield root; return; }
  if (!stat.isDirectory()) return;
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (recursive && !SKIP_DIRS.has(ent.name)) stack.push(full);
      } else if (ent.isFile() && ent.name.endsWith('.md')) {
        yield full;
      }
    }
  }
}

const collectFiles = (targets, recursive) => {
  const files = [];
  for (const t of targets) for (const f of walkMarkdown(resolve(t), { recursive })) files.push(f);
  return files;
};

const rel = (p) => relative(process.cwd(), p) || p;
const err = (msg) => { process.stderr.write(msg + '\n'); };

// ---- commands ----

const cmdLint = (args) => {
  const { targets, flags } = parseArgs(args, { boolean: ['recursive', 'json', 'help'], alias: { r: 'recursive', h: 'help' } });
  if (flags.help) { process.stdout.write(LINT_USAGE + '\n'); return 0; }
  if (targets.length === 0) { err('lint: no paths given'); return 2; }
  const files = collectFiles(targets, flags.recursive);
  const results = [];
  let errorCount = 0;
  for (const file of files) {
    let findings;
    try {
      const doc = splitDocument(readFileSync(file, 'utf8'));
      findings = lintDocument(doc).findings;
    } catch (e) {
      findings = [{ rule: 'read-error', severity: 'error', message: e.message }];
    }
    const errs = findings.filter((f) => f.severity === 'error').length;
    errorCount += errs;
    results.push({ path: file, findings });
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(results.map((r) => ({ ...r, path: rel(r.path) })), null, 2) + '\n');
  } else {
    for (const r of results) {
      if (r.findings.length === 0) continue;
      process.stdout.write(`${rel(r.path)}\n`);
      for (const f of r.findings) {
        const loc = f.line != null ? `:${f.line}` : '';
        const extra = f.match ? `  «${f.match}»` : '';
        process.stdout.write(`  ${f.severity.toUpperCase()} ${f.rule}${loc}: ${f.message}${extra}\n`);
      }
    }
    const clean = results.filter((r) => r.findings.length === 0).length;
    err(`\n${results.length} file(s); ${clean} clean; ${errorCount} error(s).`);
  }
  return errorCount > 0 ? 1 : 0;
};

const cmdValidate = (args) => {
  const { targets, flags } = parseArgs(args, { boolean: ['recursive', 'json', 'help'], alias: { r: 'recursive', h: 'help' } });
  if (flags.help) { process.stdout.write(VALIDATE_USAGE + '\n'); return 0; }
  if (targets.length === 0) { err('validate: no paths given'); return 2; }
  const files = collectFiles(targets, flags.recursive);
  const results = [];
  let invalid = 0;
  for (const file of files) {
    let errors = [];
    try {
      const { frontmatter } = splitDocument(readFileSync(file, 'utf8'));
      if (frontmatter.references === undefined) { results.push({ path: file, skipped: true, errors: [] }); continue; }
      const r = validateReferences(frontmatter.references);
      errors = r.errors;
    } catch (e) {
      errors = [{ path: '', message: e.message }];
    }
    if (errors.length > 0) invalid++;
    results.push({ path: file, errors });
  }
  if (flags.json) {
    process.stdout.write(JSON.stringify(results.map((r) => ({ ...r, path: rel(r.path) })), null, 2) + '\n');
  } else {
    for (const r of results) {
      if (r.skipped || r.errors.length === 0) continue;
      process.stdout.write(`${rel(r.path)}\n`);
      for (const e of r.errors) process.stdout.write(`  ${e.path || '<entry>'}: ${e.message}\n`);
    }
    err(`\n${results.length} file(s); ${invalid} with invalid references.`);
  }
  return invalid > 0 ? 1 : 0;
};

const cmdSort = (args) => {
  const { targets, flags } = parseArgs(args, { boolean: ['recursive', 'write', 'check', 'help'], alias: { r: 'recursive', h: 'help' } });
  if (flags.help) { process.stdout.write(SORT_USAGE + '\n'); return 0; }
  if (targets.length === 0) { err('sort: no paths given'); return 2; }
  const files = collectFiles(targets, flags.recursive);
  let changedCount = 0;
  for (const file of files) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch (e) { err(`${rel(file)}: ${e.message}`); continue; }
    const doc = splitDocument(text);
    const { frontmatter, changed } = sortReferences(doc.frontmatter);
    if (changed) changedCount++;
    const output = joinDocument(frontmatter, doc.body);
    if (flags.check) {
      if (changed) process.stdout.write(`${rel(file)}: would change\n`);
    } else if (flags.write) {
      if (changed) { writeFileSync(file, output); process.stdout.write(`${rel(file)}: sorted\n`); }
    } else {
      process.stdout.write(output);
    }
  }
  if (flags.check) { err(`\n${changedCount} file(s) would change.`); return changedCount > 0 ? 1 : 0; }
  if (flags.write) err(`\n${changedCount} file(s) sorted.`);
  return 0;
};

const readStdin = () => {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
};

const cmdParse = (args) => {
  const { targets, flags } = parseArgs(args, {
    boolean: ['json', 'help'],
    string: ['file', 'min-confidence', 'now'],
    alias: { h: 'help' }
  });
  if (flags.help) { process.stdout.write(PARSE_USAGE + '\n'); return 0; }

  let text;
  if (flags.file) text = readFileSync(resolve(flags.file), 'utf8');
  else if (targets.length > 0) text = targets.join('\n');
  else text = readStdin();
  if (!text || text.trim() === '') { err('parse: no citation text provided'); return 2; }

  // Parse --now as local midnight so getMonth()/getDate() aren't shifted by the
  // UTC offset when a bare YYYY-MM-DD is given.
  const now = flags.now
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(flags.now) ? `${flags.now}T00:00:00` : flags.now)
    : new Date();
  if (Number.isNaN(now.getTime())) { err(`parse: invalid --now date ${JSON.stringify(flags.now)}`); return 2; }
  const minConfidence = flags['min-confidence'] ?? 'medium';
  if (!['high', 'medium', 'low'].includes(minConfidence)) { err(`parse: --min-confidence must be high|medium|low`); return 2; }

  const { entries, findings } = parseCitations(text, { now, minConfidence });
  const ordered = entries.map(orderEntry);

  if (flags.json) {
    process.stdout.write(JSON.stringify(ordered, null, 2) + '\n');
  } else if (ordered.length > 0) {
    process.stdout.write(dumpYaml({ references: ordered }));
  }
  for (const f of findings) {
    if (f.rule === 'entry-unparsed') err(`  UNPARSED (${f.reason}): ${f.raw}`);
    else if (f.rule === 'entry-low-confidence') err(`  SKIPPED [${f.confidence} < ${f['min-confidence']}]: ${f.raw}`);
  }
  const parsed = findings.filter((f) => f.rule === 'entry-extracted').length;
  const failed = findings.filter((f) => f.rule === 'entry-unparsed' || f.rule === 'entry-low-confidence').length;
  err(`\n${parsed} entr${parsed === 1 ? 'y' : 'ies'} extracted; ${failed} skipped.`);
  return failed > 0 && parsed === 0 ? 1 : 0;
};

// ---- tiny arg parser ----

const parseArgs = (argv, spec = {}) => {
  const boolean = new Set(spec.boolean ?? []);
  const string = new Set(spec.string ?? []);
  const alias = spec.alias ?? {};
  const flags = {};
  const targets = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (a === '--') { targets.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      let key = a.slice(2);
      let value;
      const eq = key.indexOf('=');
      if (eq >= 0) { value = key.slice(eq + 1); key = key.slice(0, eq); }
      if (boolean.has(key)) { flags[key] = true; }
      else if (string.has(key)) { flags[key] = value !== undefined ? value : argv[++i]; }
      else { flags[key] = value !== undefined ? value : true; }
    } else if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        const key = alias[ch] ?? ch;
        flags[key] = true;
      }
    } else {
      targets.push(a);
    }
  }
  return { targets, flags };
};

// ---- dispatch ----

const main = (argv) => {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') { process.stdout.write(USAGE + '\n'); return 0; }
  if (args[0] === '-v' || args[0] === '--version') { process.stdout.write(PKG.version + '\n'); return 0; }
  const [command, ...rest] = args;
  switch (command) {
    case 'lint': return cmdLint(rest);
    case 'validate': return cmdValidate(rest);
    case 'sort': return cmdSort(rest);
    case 'parse': return cmdParse(rest);
    default:
      err(`unknown command: ${command}\n`);
      process.stdout.write(USAGE + '\n');
      return 2;
  }
};

process.exit(main(process.argv));
