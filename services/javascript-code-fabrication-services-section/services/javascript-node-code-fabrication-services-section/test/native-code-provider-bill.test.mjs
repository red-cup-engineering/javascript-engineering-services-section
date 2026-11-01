import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProviderBill } from '../src/materialize-native-code-programme.mjs';
const root = '/gnu/store/' + 'a'.repeat(32) + '-received';
const sri = 'sha512-' + Buffer.alloc(64).toString('base64');
const bill = () => ({ kind: 'native-code-provider-bill/v1',
 archiveExtractor: {name:'tar',version:'7.5.22',root,package:root+'/tar',module:root+'/tar/index.js'},
 package: { name: '@test/main', version: '1.0.0', sourceCommit: 'a'.repeat(40), integrity: sri },
 archives: [{ name: '@test/main', version: '1.0.0', integrity: sri, archive: '/received/main.tgz' }],
 edges: [{ consumer: '@test/main@1.0.0', name: '@test/provider', version: '2.0.0', provider: {
  kind: 'registered', root, path: root + '/node_modules/@test/provider' } }], providerInputs: [root] });
test('one exact archive and contextual registered dependency are admitted', () => {
 const b = bill(); assert.equal(validateProviderBill(b), b);
});
test('source/archive identity, unknown authority and mutable provider roots refuse', () => {
 for (const change of [
 b => { b.package.integrity = 'sha512-' + Buffer.alloc(64, 1).toString('base64'); },
 b => { b.trust = true; },
 b => { b.providerInputs[0] = '/tmp/authoring'; },
 b => { b.edges[0].provider.path = root + '-other/node_modules/@test/provider'; },
 b => { b.archives.push({...b.archives[0]}); },
 b => { b.archiveExtractor.module = b.archiveExtractor.package + '/../foreign/module.mjs'; },
 ]) { const b = bill(); change(b); assert.throws(() => validateProviderBill(b)); }
});
test('undeclared, duplicate and misidentified contextual edges refuse', () => {
 for (const change of [
 b => { b.edges[0].consumer = '@test/unselected@1.0.0'; },
 b => { b.edges.push({...b.edges[0]}); },
 b => { b.edges[0].provider = {kind:'artifact',identity:'@test/main@1.0.0'}; },
 b => { b.edges[0].version = '^2.0.0'; },
 ]) { const b = bill(); change(b); assert.throws(() => validateProviderBill(b)); }
});
test('different exact versions stay contextual rather than sharing a name alias', () => {
 const b = bill(); b.archives.push({name:'@test/provider',version:'2.0.0',integrity:sri,archive:'/received/provider.tgz'});
 b.edges[0].provider = {kind:'artifact',identity:'@test/provider@2.0.0'};
 assert.equal(validateProviderBill(b),b);
 b.edges[0].version='3.0.0'; assert.throws(() => validateProviderBill(b));
});

