import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { generateKs, parseKs, SessionType } from '../src/kaltura/ks.js';
import { createCncJwt, resolveCncSecret } from '../src/kaltura/cnc.js';
import { hashPassword, verifyPassword } from '../src/auth/local-users.js';
import { pickSession } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { findEnvOverrides } from '../src/lib/env-overrides.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SECRET = 'abcdef0123456789abcdef0123456789';

test('KS v2 round-trips and carries type, user, privileges and expiry', () => {
  const before = Math.floor(Date.now() / 1000);
  const ks = generateKs({
    partnerId: 4242,
    adminSecret: SECRET,
    type: SessionType.USER,
    userId: 'user@example.com',
    privileges: { setrole: 'PLAYBACK_BASE_ROLE', virtualeventid: '777' },
    expirySeconds: 3600,
  });
  assert.match(ks, /^[A-Za-z0-9_-]+=*$/, 'KS must be URL-safe base64');
  const parsed = parseKs(ks, SECRET);
  assert.equal(parsed.partnerId, '4242');
  assert.equal(parsed.type, 0);
  assert.equal(parsed.userId, 'user@example.com');
  assert.deepEqual(parsed.privileges, { setrole: 'PLAYBACK_BASE_ROLE', virtualeventid: '777' });
  assert.ok(parsed.expiry >= before + 3600 && parsed.expiry <= before + 3602);
});

test('KS is rejected with the wrong secret', () => {
  const ks = generateKs({ partnerId: 1, adminSecret: SECRET, type: SessionType.ADMIN });
  assert.throws(() => parseKs(ks, 'some-other-secret'));
});

test('two KS for the same input differ (random salt)', () => {
  const opts = { partnerId: 1, adminSecret: SECRET, type: SessionType.ADMIN, userId: 'a' };
  assert.notEqual(generateKs(opts), generateKs(opts));
});

test('CnC JWT is HS256-signed with the app token and has the expected claims', () => {
  const jwt = createCncJwt({
    secret: 'cnc-secret',
    partnerId: '4242',
    userId: 'u1',
    entryId: '1_abc',
    eventId: '777',
    isModerator: true,
    expirySeconds: 600,
  });
  const [h, p, sig] = jwt.split('.');
  const expected = createHmac('sha256', 'cnc-secret').update(`${h}.${p}`).digest('base64url');
  assert.equal(sig, expected);
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'HS256', typ: 'JWT', kid: '4242' });
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(payload.partnerId, '4242');
  assert.equal(payload.uid, 'u1');
  assert.equal(payload.contextId, '1_abc');
  assert.equal(payload.virtualEventId, '777');
  assert.deepEqual(payload.groups, ['1_abc_moderators']);
  assert.equal(payload.isAdmin, false);
  assert.equal(payload.isScopedUser, true);
  assert.equal(payload.exp - payload.iat, 600);
});

test('CnC JWT for a non-moderator has no groups', () => {
  const jwt = createCncJwt({ secret: 's', partnerId: '1', userId: 'u', entryId: 'e', eventId: '2', isModerator: false, expirySeconds: 60 });
  assert.deepEqual(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).groups, []);
});

test('resolveCncSecret prefers the configured token and otherwise needs exactly one cncAuth token', async () => {
  assert.equal(await resolveCncSecret({ configuredToken: 'env-token' }), 'env-token');
  const api = (objects) => ({ listActiveAppTokens: async () => objects });
  const getAdminKs = () => 'ks';
  assert.equal(
    await resolveCncSecret({ kalturaApi: api([{ token: 'x', sessionPrivileges: 'cncAuth:true' }, { token: 'y' }]), getAdminKs }),
    'x',
  );
  await assert.rejects(resolveCncSecret({ kalturaApi: api([]), getAdminKs }), /found 0/);
  await assert.rejects(
    resolveCncSecret({
      kalturaApi: api([
        { token: 'a', sessionPrivileges: 'cncAuth:true' },
        { token: 'b', sessionPrivileges: 'cncAuth:true' },
      ]),
      getAdminKs,
    }),
    /found 2/,
  );
});

test('password hashing verifies the right password only', async () => {
  const hash = await hashPassword('correct horse');
  assert.ok(await verifyPassword('correct horse', hash));
  assert.ok(!(await verifyPassword('wrong horse', hash)));
  assert.ok(!(await verifyPassword('x', 'garbage')));
});

test('pickSession: live/upcoming playable session, honours explicit and configured IDs, hides private', () => {
  const now = Date.parse('2025-06-01T12:00:00Z');
  const sessions = [
    { id: 'past', type: 'LiveWebcast', visibility: 'published', startDate: '2025-05-01T10:00:00Z', endDate: '2025-05-01T11:00:00Z' },
    { id: 'room', type: 'LiveKME', visibility: 'published', startDate: '2025-06-01T11:00:00Z', endDate: '2025-06-01T13:00:00Z' },
    { id: 'live', type: 'LiveWebcast', visibility: 'published', startDate: '2025-06-01T11:30:00Z', endDate: '2025-06-01T12:30:00Z' },
    { id: 'next', type: 'SimuLive', visibility: 'published', startDate: '2025-06-02T10:00:00Z', endDate: '2025-06-02T11:00:00Z' },
    { id: 'priv', type: 'LiveWebcast', visibility: 'private', startDate: '2025-06-01T11:00:00Z', endDate: '2025-06-01T12:45:00Z' },
  ];
  assert.equal(pickSession(sessions, { now }).id, 'live');
  assert.equal(pickSession(sessions, { now: Date.parse('2025-07-01T00:00:00Z') }).id, 'next', 'falls back to most recent');
  assert.equal(pickSession(sessions, { requestedId: 'next', now }).id, 'next');
  assert.equal(pickSession(sessions, { requestedId: 'room', now }).id, 'room', 'explicit non-playable is returned (route rejects it)');
  assert.equal(pickSession(sessions, { requestedId: 'priv', now }), null, 'private sessions are not selectable');
  assert.equal(pickSession(sessions, { configuredId: 'priv', now }).id, 'priv', 'unless pinned by config');
  assert.equal(pickSession(sessions, { requestedId: 'nope', now }), null);
  assert.equal(pickSession([], { now }), null);
});

test('config validation reports every missing setting', () => {
  try {
    loadConfig({});
    assert.fail('should throw');
  } catch (e) {
    for (const name of ['KALTURA_PARTNER_ID', 'KALTURA_ADMIN_SECRET', 'KALTURA_ADMIN_USER_ID', 'KALTURA_EVENT_ID', 'KALTURA_PLAYER_UICONF_ID', 'KALTURA_CNC_UICONF_ID', 'SESSION_SECRET']) {
      assert.ok(e.configErrors.some((m) => m.startsWith(name)), `${name} should be reported`);
    }
  }
});

test('config applies NVP region defaults', () => {
  const c = loadConfig({
    KALTURA_PARTNER_ID: '1',
    KALTURA_ADMIN_SECRET: 's',
    KALTURA_ADMIN_USER_ID: 'a',
    KALTURA_EVENT_ID: '5',
    KALTURA_PLAYER_UICONF_ID: '2',
    KALTURA_CNC_UICONF_ID: '3',
    SESSION_SECRET: 'x'.repeat(32),
  });
  assert.equal(c.kaltura.eventsApiUrl, 'https://events-api.nvp1.ovp.kaltura.com/api/v1');
  assert.equal(c.kaltura.chatServiceUrl, 'https://chat.nvp1.ovp.kaltura.com/api_v3');
  assert.equal(c.kaltura.cdnUrl, 'https://cdnapisec.kaltura.com');
  assert.equal(c.auth.mode, 'local', 'EP invites have no password, so local is the default');
  assert.equal(c.site.brandColor, '#006EFA');
  assert.equal(c.auth.requireEventRegistration, true);
});

test('findEnvOverrides reports environment values that shadow .env', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'ep-env-')), '.env');
  writeFileSync(file, ['AUTH_MODE=local', 'PORT=3000', 'SITE_TITLE='].join('\n'));
  assert.deepEqual(findEnvOverrides(file, { AUTH_MODE: 'kaltura', PORT: '3000' }), ['AUTH_MODE']);
  assert.deepEqual(findEnvOverrides(path.join(tmpdir(), 'missing.env'), {}), []);
});

test('config rejects a brand color that is not hex', () => {
  const env = {
    KALTURA_PARTNER_ID: '1', KALTURA_ADMIN_SECRET: 's', KALTURA_ADMIN_USER_ID: 'a', KALTURA_EVENT_ID: '5',
    KALTURA_PLAYER_UICONF_ID: '2', KALTURA_CNC_UICONF_ID: '3', SESSION_SECRET: 'x'.repeat(32), BRAND_COLOR: 'red;}',
  };
  assert.throws(() => loadConfig(env), /BRAND_COLOR/);
});
