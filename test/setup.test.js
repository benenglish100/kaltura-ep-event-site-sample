// Runs the setup wizard with piped answers against the mock Kaltura backend.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startMockKaltura, FIXTURE } from './mock-kaltura.js';
import { loadConfig } from '../src/config.js';

const SETUP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/setup.js');

function runSetup(cwd, answers) {
  return new Promise((resolve) => {
    // Minimal environment so no KALTURA_* variables from the developer's shell leak in.
    const env = Object.fromEntries(['PATH', 'SYSTEMROOT', 'HOME', 'TEMP', 'TMP'].filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
    const child = spawn(process.execPath, [SETUP], { cwd, env });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', (code) => resolve({ code, out }));
    child.stdin.end(answers.join('\n') + '\n');
  });
}

let mock, dir;
before(async () => {
  mock = await startMockKaltura({ withCncToken: false });
  dir = await mkdtemp(path.join(tmpdir(), 'ep-setup-'));
  // Point the wizard at the mock (these keys are kept in the generated .env).
  await writeFile(
    path.join(dir, '.env'),
    `KALTURA_SERVICE_URL=${mock.base}\nKALTURA_EVENTS_API_URL=${mock.base}/api/v1\nKALTURA_CDN_URL=${mock.base}\nKALTURA_CHAT_SERVICE_URL=${mock.base}/chat/api_v3\n`,
  );
});
after(() => mock.close());

test('setup wizard discovers event, uiconfs and creates the CnC token, then writes a valid .env', async () => {
  const { code, out } = await runSetup(dir, [
    '', // region NVP
    FIXTURE.partnerId,
    FIXTURE.adminSecret,
    FIXTURE.adminUserId,
    '2', // second event in the list = Q4 All Hands
    '', // don't pin a session
    '', // player: best candidate
    '', // CnC: best candidate
    '', // reactions: best candidate
    '', // create CnC token: yes
    '', // auth mode: local
    '', // site title: event name
    '', // brand color default
  ]);
  assert.equal(code, 0, out);
  assert.match(out, /Created app token 0_new/);

  const env = parseEnv(await readFile(path.join(dir, '.env'), 'utf8'));
  assert.equal(env.KALTURA_PARTNER_ID, FIXTURE.partnerId);
  assert.equal(env.KALTURA_EVENT_ID, FIXTURE.eventId);
  assert.equal(env.KALTURA_SESSION_ID, '');
  assert.equal(env.KALTURA_PLAYER_UICONF_ID, FIXTURE.playerUiConfId, '"EP All Plugins" preferred over other players');
  assert.equal(env.KALTURA_CNC_UICONF_ID, FIXTURE.cncUiConfId);
  assert.equal(env.CNC_REACTIONS_SOURCE_URL, `${mock.base}/p/${FIXTURE.partnerId}/embedPlaykitJs/uiconf_id/333`);
  assert.equal(env.KALTURA_CNC_APP_TOKEN, 'created-cnc-token');
  assert.equal(env.AUTH_MODE, 'local');
  assert.equal(env.SITE_TITLE, 'Q4 All Hands');
  assert.ok(env.SESSION_SECRET.length >= 60);
  assert.equal(env.KALTURA_SERVICE_URL, mock.base, 'existing overrides are preserved');
  assert.ok(existsSync(path.join(dir, '.env.bak')), 'previous .env backed up');

  // The generated file is a valid site config.
  const config = loadConfig(env);
  assert.equal(config.kaltura.eventId, FIXTURE.eventId);
  assert.ok(mock.calls.some((c) => c.service === 'appToken' && c.action === 'add'));
});

test('setup wizard stops with a clear message on bad credentials', async () => {
  const { code, out } = await runSetup(dir, ['', FIXTURE.partnerId, 'wrong-secret', FIXTURE.adminUserId]);
  assert.equal(code, 1);
  assert.match(out, /Kaltura rejected the partner ID \/ admin secret/);
});
