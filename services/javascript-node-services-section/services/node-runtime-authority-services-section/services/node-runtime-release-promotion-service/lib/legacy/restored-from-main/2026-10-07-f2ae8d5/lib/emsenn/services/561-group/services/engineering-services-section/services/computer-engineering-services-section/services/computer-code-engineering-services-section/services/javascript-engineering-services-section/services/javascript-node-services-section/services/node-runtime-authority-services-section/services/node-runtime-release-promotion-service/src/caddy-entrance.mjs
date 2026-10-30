import { readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';

// Change exactly one existing site. Refuse unfamiliar composition rather than
// treating the rest of an independently maintained edge as release-owned.
export function replaceCaddySite(configuration, site, replacement) {
  if (!/^[a-z0-9.-]+$/u.test(site)) throw new Error('invalid entrance hostname');
  const lines = configuration.split(/(?<=\n)/u);
  const starts = lines.flatMap((line, index) => line.trim() === site + ' {' ? [index] : []);
  if (starts.length !== 1) throw new Error('entrance must have exactly one standalone Caddy site: ' + site);
  const start = starts[0];
  let depth = 0, quoted = false, escaped = false, end;
  for (let index = start; index < lines.length; index++) {
    for (const character of lines[index]) {
      if (escaped) { escaped = false; continue; }
      if (quoted && character === '\\') { escaped = true; continue; }
      if (character === '"') { quoted = !quoted; continue; }
      if (!quoted && character === '#') break;
      if (!quoted && character === '{') depth++;
      if (!quoted && character === '}') depth--;
    }
    if (depth === 0 && !quoted) { end = index + 1; break; }
  }
  if (end === undefined) throw new Error('unclosed entrance site');
  const header = replacement.split(/(?<=\n)/u).findIndex(line => line.trim() === site + ' {');
  if (header < 0) throw new Error('replacement must name the same entrance site');
  // Source commentary is not part of the managed site. Repeated releases must
  // converge rather than append another copy before its header.
  const body = replacement.split(/(?<=\n)/u).slice(header).join('').trimEnd();
  return lines.slice(0, start).join('') + body + '\n' + lines.slice(end).join('');
}

// Runs on the existing edge, through SSH owned by the release queue. No daemon,
// connector or second deployment loop. Preparation only validates a scratch file.
const edgeProgram = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const request = JSON.parse(Buffer.from(process.argv[1], 'base64').toString());
const file = path.resolve(require('node:os').homedir(), request.file);
const current = fs.readFileSync(file, 'utf8');
if (request.action === 'read') { process.stdout.write(JSON.stringify({text: current})); process.exit(0); }
const temporary = file + '.release-' + crypto.randomUUID();
try {
  if (current !== request.expected) throw new Error('edge changed concurrently; retaining its configuration');
  fs.writeFileSync(temporary, request.text, {mode: fs.statSync(file).mode & 0o777});
  const caddy = path.resolve(require('node:os').homedir(), request.caddy);
  cp.execFileSync(caddy, ['adapt', '--adapter', 'caddyfile', '--config', temporary], {stdio: ['ignore', 'ignore', 'pipe']});
  if (request.action === 'validate') process.exitCode = 0;
  else {
    // Reload validates again. Keep the installed file untouched until the running
    // edge accepts the candidate; restore its running config if the rename fails.
    cp.execFileSync(caddy, ['reload', '--adapter', 'caddyfile', '--config', temporary], {stdio: ['ignore', 'ignore', 'pipe']});
    try {
      if (fs.readFileSync(file, 'utf8') !== current) throw new Error('edge changed during reload');
      if (request.action === 'apply' && request.expectedLocation) {
        const response = cp.execFileSync('curl', ['--max-time', '15', '--resolve', request.site + ':443:127.0.0.1',
          '-sS', '-o', '/dev/null', '-w', '%{http_code} %{redirect_url}', 'https://' + request.site + '/'], {encoding: 'utf8'}).trim();
        if (response !== '308 ' + request.expectedLocation) throw new Error('entrance did not receive the canonical redirect');
      }
      fs.renameSync(temporary, file);
    }
    catch (error) {
      cp.execFileSync(caddy, ['reload', '--adapter', 'caddyfile', '--config', file], {stdio: ['ignore', 'ignore', 'pipe']});
      throw error;
    }
  }
} finally { fs.rmSync(temporary, {force: true}); }
`;

export async function prepareCaddyEntrances({ release, entrances = [], execute }) {
  const plans = [];
  for (const entrance of entrances) {
    const {host, site, source, file, caddy = '.local/bin/caddy', expectedLocation} = entrance;
    if (!/^[a-z0-9.-]+$/u.test(host ?? '') || !file || isAbsolute(file) || file.split('/').includes('..')) throw new Error('invalid edge entrance');
    const sourcePath = resolve(release, source);
    const inside = relative(release, sourcePath);
    if (isAbsolute(inside) || inside === '..' || inside.startsWith('../')) throw new Error('entrance source escapes release');
    const call = async (action, expected, text) => execute('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host,
      'node -e ' + shellQuote(edgeProgram) + ' ' + shellQuote(Buffer.from(JSON.stringify({action, file, caddy, expected, text, site, expectedLocation})).toString('base64'))]);
    const before = JSON.parse(await call('read')).text;
    const after = replaceCaddySite(before, site, await readFile(sourcePath, 'utf8'));
    await call('validate', before, after);
    plans.push({site, before, after, call, changed: before !== after});
  }
  return plans;
}
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";

export function caddyEntranceTransaction(plans, onStep = () => {}) {
  const touched = [];
  return {
    async apply() {
      for (const plan of plans) {
        if (!plan.changed) continue;
        await plan.call('apply', plan.before, plan.after);
        touched.push(plan);
        onStep('canonical entrance received: ' + plan.site);
      }
    },
    async rollback() {
      for (const plan of [...touched].reverse()) await plan.call('rollback', plan.after, plan.before);
      touched.length = 0;
    },
  };
}
