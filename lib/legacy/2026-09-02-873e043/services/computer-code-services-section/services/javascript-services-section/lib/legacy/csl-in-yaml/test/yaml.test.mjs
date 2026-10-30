import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, dump } from '../src/yaml.mjs';

const roundtrip = (obj) => parse(dump(obj));

test('parses scalars and types', () => {
  const doc = parse([
    'a: hello',
    'b: 42',
    'c: 3.14',
    'd: true',
    'e: false',
    'f: null',
    'g: ~',
    "h: 'quoted: value'",
    'i: "with \\"escape\\""',
    'j: 2026-06-27'
  ].join('\n'));
  assert.equal(doc.a, 'hello');
  assert.equal(doc.b, 42);
  assert.equal(doc.c, 3.14);
  assert.equal(doc.d, true);
  assert.equal(doc.e, false);
  assert.equal(doc.f, null);
  assert.equal(doc.g, null);
  assert.equal(doc.h, 'quoted: value');
  assert.equal(doc.i, 'with "escape"');
  assert.equal(doc.j, '2026-06-27'); // date-like tokens stay strings
});

test('parses flow sequences and maps including nested', () => {
  const doc = parse('parts: [[1958]]\nnames: [{family: Grad, given: Harold}]');
  assert.deepEqual(doc.parts, [[1958]]);
  assert.deepEqual(doc.names, [{ family: 'Grad', given: 'Harold' }]);
});

test('parses block sequences of mappings', () => {
  const doc = parse([
    'references:',
    '  - id: a2020',
    '    type: book',
    '  - id: b2021',
    '    type: article-journal'
  ].join('\n'));
  assert.equal(doc.references.length, 2);
  assert.equal(doc.references[0].id, 'a2020');
  assert.equal(doc.references[1].type, 'article-journal');
});

test('parses same-indent block sequences', () => {
  const doc = parse('references:\n- id: a2020\n  type: book');
  assert.equal(doc.references[0].id, 'a2020');
});

test('parses date-parts written as a block sequence of sequences', () => {
  const single = parse('issued:\n  date-parts:\n    - - 2013');
  assert.deepEqual(single.issued, { 'date-parts': [[2013]] });
  const ymd = parse('issued:\n  date-parts:\n    - - 2013\n      - 5\n      - 9');
  assert.deepEqual(ymd.issued, { 'date-parts': [[2013, 5, 9]] });
});

test('parses block scalars', () => {
  const doc = parse('nocite: |\n  @*\nother: x');
  assert.equal(doc.nocite, '@*\n');
  assert.equal(doc.other, 'x');
});

test('ignores comments outside quotes', () => {
  const doc = parse('a: 1 # trailing\n# whole line\nb: "a # b"');
  assert.equal(doc.a, 1);
  assert.equal(doc.b, 'a # b');
});

test('round-trips a CSL references block', () => {
  const obj = {
    title: 'A: colon title',
    nocite: '@*\n',
    references: [
      { id: 'grad1958', type: 'chapter', author: [{ family: 'Grad', given: 'Harold' }], issued: { 'date-parts': [[1958]] }, 'container-title': 'Handbuch der Physik' },
      { id: 'zulu2000', type: 'book', author: [{ literal: 'Some Org' }], issued: { 'date-parts': [[2000]] } }
    ]
  };
  assert.deepEqual(roundtrip(obj), obj);
});

test('dumps scalars needing quotes', () => {
  assert.equal(dump({ a: 'yes: no' }).trim(), "a: 'yes: no'");
  assert.equal(dump({ a: '42' }).trim(), "a: '42'");
  assert.equal(dump({ a: 'true' }).trim(), "a: 'true'");
  assert.equal(dump({ a: 42 }).trim(), 'a: 42');
});

test('dumps date-parts as compact flow', () => {
  assert.match(dump({ issued: { 'date-parts': [[1958]] } }), /date-parts: \[\[1958\]\]/);
});
