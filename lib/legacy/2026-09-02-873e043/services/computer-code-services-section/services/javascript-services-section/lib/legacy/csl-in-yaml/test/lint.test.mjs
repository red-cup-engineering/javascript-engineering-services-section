import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintDocument } from '../src/lint.mjs';

const rules = (findings) => findings.map((f) => f.rule);

const doc = (references, body) => ({ frontmatter: { references }, body });

test('clean document has no findings', () => {
  const d = doc(
    [{ id: 'grad1958', type: 'book', author: [{ family: 'Grad' }], issued: { 'date-parts': [[1958]] } }],
    'As shown in @grad1958 the theory holds.'
  );
  assert.deepEqual(lintDocument(d).findings, []);
});

test('flags unresolved citekey', () => {
  const d = doc([], 'See @ghost2000 here.');
  assert.ok(rules(lintDocument(d).findings).includes('unresolved-citekey'));
});

test('flags bracketed citation forms', () => {
  const d = doc([{ id: 'a2020', type: 'book', author: [{ family: 'A' }], issued: { 'date-parts': [[2020]] } }], 'See [@a2020].');
  assert.ok(rules(lintDocument(d).findings).includes('forbidden-bracketed-citation'));
});

test('flags parenthetical author-year', () => {
  const d = doc([], 'As in (Grad 1958) we note...');
  assert.ok(rules(lintDocument(d).findings).includes('forbidden-parenthetical-author-year'));
});

test('flags out-of-order references', () => {
  const d = doc([
    { id: 'zulu2000', type: 'book', author: [{ family: 'Z' }], issued: { 'date-parts': [[2000]] } },
    { id: 'alpha1999', type: 'book', author: [{ family: 'A' }], issued: { 'date-parts': [[1999]] } }
  ], '');
  assert.ok(rules(lintDocument(d).findings).includes('references-sort-order'));
});

test('flags duplicate and malformed citekeys', () => {
  const d = doc([
    { id: 'a2020', type: 'book', author: [{ family: 'A' }], issued: { 'date-parts': [[2020]] } },
    { id: 'a2020', type: 'book', author: [{ family: 'A' }], issued: { 'date-parts': [[2020]] } },
    { id: 'Bad-Key2020', type: 'book', author: [{ family: 'B' }], issued: { 'date-parts': [[2020]] } }
  ], '');
  const r = rules(lintDocument(d).findings);
  assert.ok(r.includes('citekey-duplicate'));
  assert.ok(r.includes('citekey-format'));
});

test('flags forbidden bibliography heading', () => {
  const d = doc([], '## References\n\n- something');
  assert.ok(rules(lintDocument(d).findings).includes('forbidden-bibliography-heading'));
});

test('ignores citations inside code spans and fences', () => {
  const d = doc([], 'Inline `@ghost2000` and\n```\n@another2001\n```\n');
  assert.deepEqual(lintDocument(d).findings, []);
});
