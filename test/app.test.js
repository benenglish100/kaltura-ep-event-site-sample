// End-to-end HTTP tests: the real site talking to a mock Kaltura backend.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { startMockKaltura, FIXTURE } from './mock-kaltura.js';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/app.js';
import { parseKs } from '../src/kaltura/ks.js';
import { hashPassword } from '../src/auth/local-users.js';

const silent = { error: () => {}, warn: () => {} };

async function startSite(mock, extraEnv = {}) {
  const config = loadConfig({ ...mock.env, ...extraEnv });
  const app = createApp({ config, logger: silent });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

/** Minimal browser-like client with a cookie jar. */
function client(base) {
  let cookie = '';
  return {
    get cookie() {
      return cookie;
    },
    async req(method, url, { json, headers = {} } = {}) {
      const res = await fetch(base + url, {
        method,
        redirect: 'manual',
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(json !== undefined ? { 'Content-Type': 'application/json', Origin: base } : {}),
          ...headers,
        },
        body: json !== undefined ? JSON.stringify(json) : undefined,
      });
      const setCookies = res.headers.getSetCookie();
      if (setCookies.length) {
        cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
        res.rawSetCookie = setCookies;
      }
      return res;
    },
    login(username, password) {
      return this.req('POST', '/api/login', { json: { username, password } });
    },
  };
}

const decodeJwt = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url'));

describe('Event site against mock Kaltura (AUTH_MODE=kaltura)', () => {
  let mock, site;
  before(async () => {
    mock = await startMockKaltura();
    site = await startSite(mock, { AUTH_MODE: 'kaltura' });
  });
  after(async () => {
    await site.close();
    await mock.close();
  });

  test('health check', async () => {
    const res = await fetch(`${site.base}/healthz`);
    assert.equal(res.status, 200);
  });

  test('login page is served with security headers; session page requires login', async () => {
    const c = client(site.base);
    const login = await c.req('GET', '/');
    assert.equal(login.status, 200);
    assert.match(await login.text(), /id="login-form"/);
    const csp = login.headers.get('content-security-policy-report-only');
    assert.ok(csp && csp.includes(`script-src 'self' ${mock.base}`), 'CSP allows the Kaltura CDN for scripts');
    assert.equal(login.headers.get('x-content-type-options'), 'nosniff');

    const session = await c.req('GET', '/session');
    assert.equal(session.status, 302);
    assert.equal(session.headers.get('location'), '/');

    const api = await c.req('GET', '/api/session-config');
    assert.equal(api.status, 401);
  });

  test('public event info for the login page', async () => {
    const res = await fetch(`${site.base}/api/event`);
    assert.deepEqual(await res.json(), {
      name: 'Q4 All Hands',
      startDate: FIXTURE.event.startDate,
      endDate: FIXTURE.event.endDate,
      site: { title: '', brandColor: '#006EFA' },
    });
  });

  test('wrong password is rejected', async () => {
    const res = await client(site.base).login('jane@example.com', 'nope');
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'invalid_credentials' });
  });

  test('valid Kaltura login but not registered for the event is rejected', async () => {
    const res = await client(site.base).login('stranger@example.com', 'strangerpass');
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: 'not_registered' });
  });

  test('blocked event user is rejected', async () => {
    const res = await client(site.base).login('blocked@example.com', 'blockedpass1');
    assert.equal(res.status, 403);
  });

  test('login requires JSON and same origin (CSRF protection)', async () => {
    const form = await fetch(`${site.base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'username=jane@example.com&password=janepass123',
    });
    assert.equal(form.status, 415);
    const cross = await fetch(`${site.base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
      body: JSON.stringify({ username: 'jane@example.com', password: 'janepass123' }),
    });
    assert.equal(cross.status, 403);
    const empty = await client(site.base).login('', '');
    assert.equal(empty.status, 400);
  });

  test('attendee: login → session page → tokens for player and CnC', async () => {
    const c = client(site.base);
    const res = await c.login('jane@example.com', 'janepass123');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, redirect: '/session' });
    assert.ok(res.rawSetCookie.some((x) => /ep_session=/.test(x) && /httponly/i.test(x) && /samesite=lax/i.test(x)));

    assert.equal((await c.req('GET', '/')).headers.get('location'), '/session');
    const page = await c.req('GET', '/session');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /id="cnc-chat"/);

    const cfgRes = await c.req('GET', '/api/session-config');
    assert.equal(cfgRes.status, 200);
    assert.equal(cfgRes.headers.get('cache-control'), 'no-store');
    const cfg = await cfgRes.json();

    // Default session = the next upcoming LiveWebcast/SimuLive, not the KME room, past or private one.
    assert.equal(cfg.session.id, '1_main');
    assert.equal(cfg.event.name, 'Q4 All Hands');
    assert.equal(cfg.user.name, 'Jane Doe');
    assert.equal(cfg.user.isModerator, false);
    assert.deepEqual(cfg.site, { title: '', brandColor: '#006EFA' });
    assert.deepEqual(cfg.sessions.map((s) => s.id), ['1_past', '1_main', '1_sim']);

    // Player: embedPlaykitJs bundle for the configured uiconf + user KS
    assert.equal(cfg.player.scriptUrl, `${mock.base}/p/${FIXTURE.partnerId}/embedPlaykitJs/uiconf_id/${FIXTURE.playerUiConfId}`);
    assert.equal(cfg.player.entryId, '1_main');
    assert.equal(cfg.player.partnerId, Number(FIXTURE.partnerId));
    const ks = parseKs(cfg.player.ks, FIXTURE.adminSecret);
    assert.equal(ks.type, 0, 'USER KS, never admin');
    assert.equal(ks.userId, 'hash-jane', 'KS user is the Event Platform user ID');
    assert.deepEqual(ks.privileges, {
      setrole: 'PLAYBACK_BASE_ROLE',
      disableentitlementforentry: '1_main',
      virtualeventid: FIXTURE.eventId,
    });
    assert.ok(ks.expiry > Date.now() / 1000 + 11 * 3600);

    // CnC: bundle, chat service and a JWT signed with the cncAuth app token
    assert.equal(cfg.cnc.scriptUrl, `${mock.base}/p/${FIXTURE.partnerId}/embedPlaykitJs/uiconf_id/${FIXTURE.cncUiConfId}`);
    assert.equal(cfg.cnc.serviceUrl, `${mock.base}/chat/api_v3`);
    const [h, p, sig] = cfg.cnc.jwt.split('.');
    assert.equal(sig, createHmac('sha256', FIXTURE.cncToken).update(`${h}.${p}`).digest('base64url'));
    const claims = decodeJwt(cfg.cnc.jwt);
    assert.equal(claims.uid, 'hash-jane');
    assert.equal(claims.contextId, '1_main');
    assert.equal(claims.virtualEventId, FIXTURE.eventId);
    assert.deepEqual(claims.groups, []);

    // Nothing secret leaks to the browser
    const raw = JSON.stringify(cfg);
    assert.ok(!raw.includes(FIXTURE.adminSecret));
    assert.ok(!raw.includes(FIXTURE.cncToken));
  });

  test('session selection by ?id=, with type and visibility enforcement', async () => {
    const c = client(site.base);
    await c.login('jane@example.com', 'janepass123');

    const sim = await (await c.req('GET', '/api/session-config?id=1_sim')).json();
    assert.equal(sim.session.id, '1_sim');
    assert.equal(decodeJwt(sim.cnc.jwt).contextId, '1_sim');

    const room = await c.req('GET', '/api/session-config?id=1_room');
    assert.equal(room.status, 422);
    assert.deepEqual(await room.json(), { error: 'unsupported_session_type', type: 'LiveKME' });

    assert.equal((await c.req('GET', '/api/session-config?id=1_priv')).status, 404);
    assert.equal((await c.req('GET', '/api/session-config?id=0_unknown')).status, 404);
  });

  test('Event Platform moderator gets the CnC moderators group', async () => {
    const c = client(site.base);
    await c.login('mo@example.com', 'mopass12345');
    const cfg = await (await c.req('GET', '/api/session-config')).json();
    assert.equal(cfg.user.isModerator, true);
    assert.deepEqual(decodeJwt(cfg.cnc.jwt).groups, ['1_main_moderators']);
  });

  test('Events Platform API is called with an admin KS for the team-member user', () => {
    const epCalls = mock.calls.filter((x) => x.kind === 'events');
    assert.ok(epCalls.length > 0);
    for (const call of epCalls) {
      const ks = parseKs(call.auth.replace('Bearer ', ''), FIXTURE.adminSecret);
      assert.equal(ks.type, 2);
      assert.equal(ks.userId, FIXTURE.adminUserId);
    }
    // cncAuth token is looked up once and cached
    assert.equal(mock.calls.filter((x) => x.kind === 'v3' && x.service === 'appToken').length, 1);
  });

  test('logout ends the session', async () => {
    const c = client(site.base);
    await c.login('jane@example.com', 'janepass123');
    assert.equal((await c.req('GET', '/api/session-config')).status, 200);
    assert.equal((await c.req('POST', '/api/logout', { json: {} })).status, 200);
    assert.equal((await c.req('GET', '/api/session-config')).status, 401);
  });

  test('tampered session cookie is rejected', async () => {
    const c = client(site.base);
    await c.login('jane@example.com', 'janepass123');
    const forged = Buffer.from(JSON.stringify({ user: { id: 'admin', roles: ['Moderator'] } })).toString('base64');
    const tampered = c.cookie.replace(/ep_session=[^;]+/, `ep_session=${forged}`);
    const res = await fetch(`${site.base}/api/session-config`, { headers: { Cookie: tampered } });
    assert.equal(res.status, 401);
  });
});

describe('upstream failures and limits', () => {
  let mock, site;
  before(async () => {
    mock = await startMockKaltura();
    site = await startSite(mock, { AUTH_MODE: 'kaltura' });
  });
  after(async () => {
    await site.close();
    await mock.close();
  });

  test('Events API outage returns a clean 502 without leaking details', async () => {
    mock.failures.events = true;
    const res = await client(site.base).login('jane@example.com', 'janepass123');
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: 'upstream_error' });
    mock.failures.events = false;
  });

  test('login is rate limited', async () => {
    const c = client(site.base);
    let last;
    for (let i = 0; i < 11; i++) last = await c.login('jane@example.com', 'wrong');
    assert.equal(last.status, 429);
  });
});

describe('AUTH_MODE=local', () => {
  let mock, site, dir;
  before(async () => {
    mock = await startMockKaltura();
    dir = await mkdtemp(path.join(tmpdir(), 'ep-site-'));
    const usersFile = path.join(dir, 'users.json');
    await writeFile(
      usersFile,
      JSON.stringify({
        users: [{ username: 'jane@example.com', email: 'jane@example.com', firstName: 'Jane', lastName: 'Local', passwordHash: await hashPassword('local-pass-1') }],
      }),
    );
    site = await startSite(mock, { AUTH_MODE: 'local', USERS_FILE: usersFile });
  });
  after(async () => {
    await site.close();
    await mock.close();
  });

  test('authenticates against users.json, then maps to the Event Platform user', async () => {
    const c = client(site.base);
    assert.equal((await c.login('jane@example.com', 'janepass123')).status, 401, 'Kaltura password is not used in local mode');
    assert.equal((await c.login('JANE@example.com', 'local-pass-1')).status, 200);
    const cfg = await (await c.req('GET', '/api/session-config')).json();
    assert.equal(parseKs(cfg.player.ks, FIXTURE.adminSecret).userId, 'hash-jane');
    assert.ok(!mock.calls.some((x) => x.service === 'user'), 'loginByLoginId not called');
  });
});
