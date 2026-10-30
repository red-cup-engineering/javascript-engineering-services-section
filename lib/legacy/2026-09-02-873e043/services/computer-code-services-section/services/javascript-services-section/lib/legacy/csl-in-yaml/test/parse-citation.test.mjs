import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCitationFragment, parseCitations } from '../src/parse-citation.mjs';
import { validateEntry } from '../src/validate.mjs';

const NOW = new Date('2026-07-01T00:00:00');

test('parses a journal article to CSL-JSON', () => {
  const r = parseCitationFragment('Fitting, Melvin (1991). "Bilattices and the Semantics of Logic Programming." *Journal of Logic Programming* 11(2), 91–116.', { now: NOW });
  assert.ok(r.ok);
  assert.equal(r.entry.type, 'article-journal');
  assert.deepEqual(r.entry.author, [{ family: 'Fitting', given: 'Melvin' }]);
  assert.equal(r.entry['container-title'], 'Journal of Logic Programming');
  assert.equal(r.entry.volume, 11);
  assert.equal(r.entry.issue, '2');
  assert.equal(r.entry.page, '91-116');
  assert.deepEqual(r.entry.issued, { 'date-parts': [[1991]] });
});

test('parses a chapter with container and publisher', () => {
  const r = parseCitationFragment('Belnap, Nuel D. (1977). "A Useful Four-Valued Logic." In *Modern Uses of Multiple-Valued Logic*, Reidel, 5–37.', { now: NOW });
  assert.ok(r.ok);
  assert.equal(r.entry.type, 'chapter');
  assert.equal(r.entry['container-title'], 'Modern Uses of Multiple-Valued Logic');
  assert.equal(r.entry.publisher, 'Reidel');
  assert.equal(r.entry.page, '5-37');
});

test('parses an arXiv preprint', () => {
  const r = parseCitationFragment('Jakl, T. (2025). "Four Imprints." arXiv:2503.20679.', { now: NOW });
  assert.ok(r.ok);
  assert.equal(r.entry.type, 'article');
  assert.equal(r.entry.note, 'arXiv:2503.20679');
});

test('parses a multi-author italic-title book', () => {
  const r = parseCitationFragment('Galatos, Nikolaos, Peter Jipsen, Tomasz Kowalski, and Hiroakira Ono (2007). *Residuated Lattices*. Elsevier.', { now: NOW });
  assert.ok(r.ok);
  assert.equal(r.entry.type, 'book');
  assert.equal(r.entry.author.length, 4);
  assert.deepEqual(r.entry.author[1], { family: 'Jipsen', given: 'Peter' });
  assert.equal(r.entry.publisher, 'Elsevier');
});

test('parses an RFC into a report with number', () => {
  const r = parseCitationFragment('Bradner, S. (1997). "Key Words." BCP 14, RFC 2119.', { now: NOW });
  assert.ok(r.ok);
  assert.equal(r.entry.type, 'report');
  assert.equal(r.entry.publisher, 'IETF');
  assert.equal(r.entry.number, 'RFC 2119');
});

test('all parsed entries are valid CSL-JSON', () => {
  const inputs = [
    'Fitting, Melvin (1991). "Bilattices." *Journal of Logic Programming* 11(2), 91–116.',
    'Belnap, Nuel D. (1977). "A Useful Four-Valued Logic." In *Modern Uses of Multiple-Valued Logic*, Reidel, 5–37.',
    'Galatos, Nikolaos, and Hiroakira Ono (2007). *Residuated Lattices*. Elsevier.',
    'WHATWG (current). *HTML Living Standard.* https://html.spec.whatwg.org/'
  ];
  for (const input of inputs) {
    const r = parseCitationFragment(input, { now: NOW });
    assert.ok(r.ok, `failed to parse: ${input}`);
    const v = validateEntry({ id: 'x2000', ...r.entry });
    assert.equal(v.valid, true, `${input}\n${JSON.stringify(v.errors)}`);
  }
});

test('assigns unique disambiguated citekeys', () => {
  const { entries } = parseCitations([
    'Smith, J. (2020). *One*. Pub.',
    'Smith, K. (2020). *Two*. Pub.'
  ].join('\n'), { now: NOW, minConfidence: 'low' });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, 'smith2020');
  assert.equal(entries[1].id, 'smith2020a');
});

test('confidence filter drops low-confidence parses', () => {
  const text = 'Anon (2020). "A bare title with no container."';
  const high = parseCitations(text, { now: NOW, minConfidence: 'high' });
  assert.equal(high.entries.length, 0);
  const low = parseCitations(text, { now: NOW, minConfidence: 'low' });
  assert.equal(low.entries.length, 1);
});

test('reports unparsable lines', () => {
  const { entries, findings } = parseCitations('this is not a citation at all', { now: NOW, minConfidence: 'low' });
  assert.equal(entries.length, 0);
  assert.ok(findings.some((f) => f.rule === 'entry-unparsed'));
});
