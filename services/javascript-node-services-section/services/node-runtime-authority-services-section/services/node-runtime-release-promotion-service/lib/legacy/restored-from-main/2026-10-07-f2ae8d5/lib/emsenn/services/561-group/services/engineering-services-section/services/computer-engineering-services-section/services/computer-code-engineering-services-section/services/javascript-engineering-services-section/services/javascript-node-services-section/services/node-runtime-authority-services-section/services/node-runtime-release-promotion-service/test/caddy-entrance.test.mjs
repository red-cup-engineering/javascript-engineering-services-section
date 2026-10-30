import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replaceCaddySite, caddyEntranceTransaction } from '../src/caddy-entrance.mjs';
import { prepareCaddyEntrances } from '../src/caddy-entrance.mjs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('replace one entrance while retaining unrelated routes and nested Caddy syntax', () => {
  const old = 'other.example {\n respond "a { brace }"\n}\n\nl-space.561.group {\n reverse_proxy localhost:18848 {\n transport http { # ignored }\n forward_proxy_url socks5://localhost:1055\n }\n }\n}\nlast.example {\n respond ok\n}\n';
  const fresh = 'l-space.561.group {\n redir https://bare-cedar-fog.561.group{uri} 308\n}';
  const result = replaceCaddySite(old, 'l-space.561.group', fresh);
  assert.equal(result, old.slice(0, old.indexOf('l-space.')) + fresh + '\n' + old.slice(old.indexOf('last.example')));
  assert.equal(replaceCaddySite(result, 'l-space.561.group', '# source commentary\n' + fresh), result);
  assert.throws(() => replaceCaddySite(old + old, 'l-space.561.group', fresh), /exactly one/);
  assert.throws(() => replaceCaddySite('l-space.561.group {\n', 'l-space.561.group', fresh), /unclosed/);
});

test('failure of a later edge restores only the already received entrances', async () => {
  const actions = [];
  const plan = (site, failing = false) => ({site, before: 'before', after: 'after', changed: true,
    call: async (action, expected, text) => {
      actions.push([site, action, expected, text]);
      if (failing) throw new Error('concurrent edge edit');
    }});
  const transaction = caddyEntranceTransaction([plan('first'), plan('second', true)]);
  await assert.rejects(transaction.apply(), /concurrent/);
  await transaction.rollback();
  assert.deepEqual(actions, [
    ['first', 'apply', 'before', 'after'], ['second', 'apply', 'before', 'after'],
    ['first', 'rollback', 'after', 'before'],
  ]);
  await transaction.rollback();
  assert.equal(actions.length, 3);
});

test('the transmitted edge program receives, rolls back, and refuses concurrent changes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'caddy-entrance-'));
  try {
    await mkdir(join(home, '.config/caddy'), {recursive: true});
    await mkdir(join(home, '.local/bin'), {recursive: true});
    const file = join(home, '.config/caddy/Caddyfile');
    const before = 'other.example {\n respond ok\n}\nl-space.561.group {\n reverse_proxy localhost:18848\n}\n';
    const replacement = 'l-space.561.group {\n redir https://bare-cedar-fog.561.group{uri} 308\n}\n';
    await writeFile(file, before);
    await writeFile(join(home, 'entrance'), replacement);
    // The existing edge parser was checked separately. Here the fake executable
    // records what the transmitted program asks the running edge to receive.
    await writeFile(join(home, '.local/bin/caddy'), '#!/bin/sh\nif [ "$1" = reload ]; then cp "$5" "$HOME/received"; fi\n', {mode: 0o700});
    const execute = async (program, args) => {
      assert.equal(program, 'ssh');
      return (await promisify(execFile)('/bin/sh', ['-c', args.at(-1)], {
        env: {...process.env, HOME: home, PATH: dirname(process.execPath) + ':' + process.env.PATH},
      })).stdout;
    };
    const prepare = () => prepareCaddyEntrances({release: home, execute,
      entrances: [{host: 'edge.example', site: 'l-space.561.group', source: 'entrance', file: '.config/caddy/Caddyfile'}]});
    const plans = await prepare();
    assert.equal(await readFile(file, 'utf8'), before); // Admission never activates.
    const transaction = caddyEntranceTransaction(plans);
    await transaction.apply();
    const after = replaceCaddySite(before, 'l-space.561.group', replacement);
    assert.equal(await readFile(file, 'utf8'), after);
    assert.equal(await readFile(join(home, 'received'), 'utf8'), after);
    await transaction.rollback();
    assert.equal(await readFile(file, 'utf8'), before);
    assert.equal(await readFile(join(home, 'received'), 'utf8'), before);
    const pending = caddyEntranceTransaction(await prepare());
    await writeFile(file, before + '# independently changed\n');
    await assert.rejects(pending.apply(), /changed concurrently/);
    await pending.rollback();
    assert.equal(await readFile(file, 'utf8'), before + '# independently changed\n');
  } finally { await rm(home, {recursive: true, force: true}); }
});
