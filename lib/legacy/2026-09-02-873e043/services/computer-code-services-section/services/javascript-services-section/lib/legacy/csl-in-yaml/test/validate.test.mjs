import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntry, validateReferences } from '../src/validate.mjs';

test('accepts a well-formed entry', () => {
  const r = validateEntry({
    id: 'grad1958', type: 'chapter',
    author: [{ family: 'Grad', given: 'Harold' }],
    title: 'Principles', issued: { 'date-parts': [[1958]] },
    'container-title': 'Handbuch der Physik'
  });
  assert.equal(r.valid, true, JSON.stringify(r.errors));
});

test('rejects missing required fields', () => {
  const r = validateEntry({ type: 'book' });
  assert.equal(r.valid, false);
  const paths = r.errors.map((e) => e.path);
  assert.ok(paths.some((p) => p.endsWith('.id')));
  assert.ok(paths.some((p) => p.endsWith('.title')));
  assert.ok(paths.some((p) => p.endsWith('.issued')));
});

test('rejects unknown type', () => {
  const r = validateEntry({ id: 'a2020', type: 'blog-thing', title: 'x', issued: { 'date-parts': [[2020]] }, author: [{ family: 'A' }] });
  assert.ok(r.errors.some((e) => e.message.includes('not a CSL')));
});

test('enforces per-type conditional requirements', () => {
  const journal = validateEntry({ id: 'a2020', type: 'article-journal', title: 'x', issued: { 'date-parts': [[2020]] }, author: [{ family: 'A' }] });
  assert.ok(journal.errors.some((e) => e.message.includes('container-title')));

  const web = validateEntry({ id: 'b2020', type: 'webpage', title: 'x', issued: { 'date-parts': [[2020]] }, author: [{ literal: 'Org' }] });
  const msgs = web.errors.map((e) => e.message).join(' ');
  assert.ok(msgs.includes('URL'));
  assert.ok(msgs.includes('accessed'));
});

test('rejects invalid name and date shapes', () => {
  const r = validateEntry({ id: 'a2020', type: 'book', title: 'x', issued: { 'date-parts': [['nope']] }, author: [{ given: 'only given' }] });
  assert.ok(r.errors.some((e) => e.path.includes('.author[0]')));
  assert.ok(r.errors.some((e) => e.path.includes('.issued')));
});

test('validateReferences flags duplicate ids', () => {
  const r = validateReferences([
    { id: 'a2020', type: 'book', title: 'x', issued: { 'date-parts': [[2020]] }, author: [{ family: 'A' }] },
    { id: 'a2020', type: 'book', title: 'y', issued: { 'date-parts': [[2020]] }, author: [{ family: 'A' }] }
  ]);
  assert.ok(r.errors.some((e) => e.message.includes('duplicate id')));
});
