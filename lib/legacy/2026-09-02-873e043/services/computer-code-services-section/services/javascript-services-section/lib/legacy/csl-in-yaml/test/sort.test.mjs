import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortReferences } from '../src/sort.mjs';

test('sorts references by id and reports change', () => {
  const fm = {
    references: [
      { id: 'zulu2000', type: 'book', issued: { 'date-parts': [[2000]] }, author: [{ family: 'Z' }] },
      { id: 'alpha1999', type: 'book', issued: { 'date-parts': [[1999]] }, author: [{ family: 'A' }] }
    ]
  };
  const { frontmatter, changed } = sortReferences(fm);
  assert.equal(changed, true);
  assert.deepEqual(frontmatter.references.map((r) => r.id), ['alpha1999', 'zulu2000']);
});

test('orders entry fields canonically (id, type, author, title, issued...)', () => {
  const fm = { references: [{ title: 'T', issued: { 'date-parts': [[2000]] }, type: 'book', id: 'a2000', author: [{ family: 'A' }] }] };
  const { frontmatter } = sortReferences(fm);
  assert.deepEqual(Object.keys(frontmatter.references[0]), ['id', 'type', 'author', 'title', 'issued']);
});

test('is idempotent', () => {
  const fm = { references: [
    { id: 'alpha1999', type: 'book', author: [{ family: 'A' }], title: 'A', issued: { 'date-parts': [[1999]] } },
    { id: 'zulu2000', type: 'book', author: [{ family: 'Z' }], title: 'Z', issued: { 'date-parts': [[2000]] } }
  ] };
  const once = sortReferences(fm);
  assert.equal(once.changed, false);
  const twice = sortReferences(once.frontmatter);
  assert.equal(twice.changed, false);
});

test('leaves documents without references untouched', () => {
  const fm = { title: 'x' };
  const { changed } = sortReferences(fm);
  assert.equal(changed, false);
});
