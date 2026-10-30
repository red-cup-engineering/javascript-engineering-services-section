import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../scripts/cli.mjs', import.meta.url));

// Run the CLI, capturing stdout and exit code (never throwing on nonzero).
const run = (args, input) => {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status ?? 1, stdout: e.stdout ?? '' };
  }
};

const tmp = () => mkdtempSync(join(tmpdir(), 'csl-cli-'));

test('parse converts stdin text to CSL-JSON YAML', () => {
  const r = run(['parse', '--now', '2026-07-01'], 'Fitting, Melvin (1991). "Bilattices." *Journal of Logic Programming* 11(2), 91–116.');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /id: fitting1991/);
  assert.match(r.stdout, /type: article-journal/);
});

test('parse --json emits an array', () => {
  const r = run(['parse', '--json', '--now', '2026-07-01'], 'Smith, J. (2020). *A Book*. Pub.');
  const parsed = JSON.parse(r.stdout);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed[0].id, 'smith2020');
});

test('lint exits 1 on unresolved citekey, 0 when clean', () => {
  const dir = tmp();
  const bad = join(dir, 'bad.md');
  writeFileSync(bad, '---\nname: x\ndescription: y\n---\nSee @ghost2000.\n');
  assert.equal(run(['lint', bad]).code, 1);

  const good = join(dir, 'good.md');
  writeFileSync(good, [
    '---', 'name: x', 'description: y',
    'references:', '  - id: grad1958', '    type: book',
    '    author:', '      - family: Grad', '    issued:', '      date-parts: [[1958]]',
    '---', 'See @grad1958.', ''
  ].join('\n'));
  assert.equal(run(['lint', good]).code, 0);
});

test('sort --write reorders references in place', () => {
  const dir = tmp();
  const f = join(dir, 'doc.md');
  writeFileSync(f, [
    '---', 'name: x', 'description: y',
    'references:',
    '  - id: zulu2000', '    type: book', '    author:', '      - family: Z', '    issued:', '      date-parts: [[2000]]',
    '  - id: alpha1999', '    type: book', '    author:', '      - family: A', '    issued:', '      date-parts: [[1999]]',
    '---', 'Body.', ''
  ].join('\n'));
  assert.equal(run(['sort', f, '--check']).code, 1);
  run(['sort', f, '--write']);
  const after = readFileSync(f, 'utf8');
  assert.ok(after.indexOf('alpha1999') < after.indexOf('zulu2000'));
  assert.equal(run(['sort', f, '--check']).code, 0);
});

test('--version and --help work', () => {
  assert.match(run(['--version']).stdout, /\d+\.\d+\.\d+/);
  assert.match(run(['--help']).stdout, /Usage/);
});
