// A stand-in for Kaltura SaaS used by the automated tests: Kaltura API v3, the Events Platform
// API and the embedPlaykitJs CDN. It validates the KS the site sends exactly like Kaltura would
// (decrypt with the admin secret, check type/user/expiry), and serves stub player/CnC bundles
// that record how the page drives them.
import http from 'node:http';
import { parseKs } from '../src/kaltura/ks.js';

export const FIXTURE = {
  partnerId: '1234567',
  adminSecret: 'test-admin-secret-0123456789abcdef',
  adminUserId: 'ep-admin@example.com',
  eventId: '98765',
  cncToken: 'cnc-app-token-secret',
  playerUiConfId: '111',
  cncUiConfId: '222',
  event: {
    id: 98765,
    name: 'Q4 All Hands',
    startDate: '2030-01-01T16:00:00Z',
    endDate: '2030-01-01T18:00:00Z',
    templateId: 'tm2000',
  },
  sessions: [
    { id: '1_past', type: 'LiveWebcast', visibility: 'published', name: 'Past Webcast', description: '', startDate: '2020-01-01T10:00:00Z', endDate: '2020-01-01T11:00:00Z' },
    { id: '1_room', type: 'LiveKME', visibility: 'published', name: 'Breakout Room', description: '', startDate: '2030-01-01T15:00:00Z', endDate: '2030-01-01T19:00:00Z' },
    { id: '1_main', type: 'LiveWebcast', visibility: 'published', name: 'Main Stage', description: 'Keynote and Q&A', startDate: '2030-01-01T16:00:00Z', endDate: '2030-01-01T17:00:00Z' },
    { id: '1_sim', type: 'SimuLive', visibility: 'published', name: 'Replay', description: '', startDate: '2030-01-02T16:00:00Z', endDate: '2030-01-02T17:00:00Z' },
    { id: '1_priv', type: 'LiveWebcast', visibility: 'private', name: 'Private Rehearsal', description: '', startDate: '2029-12-31T16:00:00Z', endDate: '2029-12-31T17:00:00Z' },
  ],
  eventUsers: [
    { id: 'hash-jane', email: 'jane@example.com', firstName: 'Jane', lastName: 'Doe', roles: ['Attendees'], status: 'Registered' },
    { id: 'hash-mo', email: 'mo@example.com', firstName: 'Mo', lastName: 'Derator', roles: ['Moderator'], status: 'Confirmed' },
    { id: 'hash-blocked', email: 'blocked@example.com', firstName: 'Bo', lastName: 'Cked', roles: ['Attendees'], status: 'Blocked' },
  ],
  // Kaltura logins (user.loginByLoginId)
  logins: {
    'jane@example.com': 'janepass123',
    'mo@example.com': 'mopass12345',
    'blocked@example.com': 'blockedpass1',
    'stranger@example.com': 'strangerpass',
  },
};

const PLAYER_STUB = `
window.__calls = window.__calls || [];
window.KalturaPlayer = {
  setup(options) {
    window.__calls.push({ fn: 'player.setup', options });
    const target = document.getElementById(options.targetId);
    target.innerHTML = '<div class="stub-player">stub player</div>';
    return { loadMedia(info) { window.__calls.push({ fn: 'player.loadMedia', info }); target.dataset.entryId = info.entryId; } };
  }
};`;

const CNC_STUB = `
window.__calls = window.__calls || [];
window.KalturaPlayer = window.KalturaPlayer || {};
window.KalturaEventsPlatform = { collaboration: { widgets: { embedded: { new() {
  const cbs = { load: [], open: [], close: [] };
  const rec = (fn, el, extra) => { window.__calls.push(Object.assign({ fn, target: el && el.id }, extra || {})); if (el) el.dataset.rendered = fn; };
  return {
    addOnLoadFinished(cb) { cbs.load.push(cb); },
    addOnOpen(cb) { cbs.open.push(cb); },
    addOnClose(cb) { cbs.close.push(cb); },
    renderCncContainer(el, config) { rec('cnc.renderCncContainer', el, { config }); setTimeout(() => cbs.load.forEach((cb) => cb()), 0); },
    renderCnc(el) { rec('cnc.renderCnc', el); },
    renderSidebarButtons(el) { rec('cnc.renderSidebarButtons', el); },
    renderSidebarSettings(el) { rec('cnc.renderSidebarSettings', el); },
    renderReactions(el) { rec('cnc.renderReactions', el); },
    renderLiveReactions(el) { rec('cnc.renderLiveReactions', el); },
    __close() { cbs.close.forEach((cb) => cb()); },
    __open() { cbs.open.forEach((cb) => cb()); },
  };
} } } } };`;

export const UICONFS = [
  { id: 900, name: 'MediaSpace Main Player', tags: 'kms_mainplayer,kalturaPlayerJs,player,ovp' },
  { id: Number(FIXTURE.cncUiConfId), name: 'KEP widgets - default UIconf for EP - latest (Do Not Delete)', tags: 'kep-collaboration-widgets_latest' },
  { id: 333, name: 'KEP reactions widgets latest (Do Not Delete)', tags: 'kep-reactions-widgets_latest,kep_reactions_widgets' },
  { id: Number(FIXTURE.playerUiConfId), name: 'EP All Plugins (Do Not Delete)', tags: 'kalturaPlayerJs,player,ovp' },
];

export function startMockKaltura({ port = 0, withCncToken = true } = {}) {
  const calls = [];
  const failures = { events: false };
  const appTokens = [{ id: '0_a', token: 'unrelated', sessionPrivileges: 'setrole:FOO' }];
  if (withCncToken) appTokens.push({ id: '0_b', token: FIXTURE.cncToken, sessionPrivileges: 'cncAuth:true' });

  const assertAdminKs = (ks) => {
    const parsed = parseKs(ks, FIXTURE.adminSecret);
    if (parsed.partnerId !== FIXTURE.partnerId) throw new Error('wrong partner');
    if (parsed.type !== 2) throw new Error('not an admin KS');
    if (parsed.userId !== FIXTURE.adminUserId) throw new Error('KS user is not an EP team member');
    if (parsed.expiry < Date.now() / 1000) throw new Error('KS expired');
    return parsed;
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const send = (status, data, type = 'application/json') => {
      res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
      res.end(type === 'application/json' ? JSON.stringify(data) : data);
    };
    const kalturaError = (code, message) => send(200, { objectType: 'KalturaAPIException', code, message });

    // ---- CDN ----
    const cdn = url.pathname.match(/^\/p\/(\d+)\/embedPlaykitJs\/uiconf_id\/(\d+)$/);
    if (cdn) {
      calls.push({ kind: 'cdn', uiConfId: cdn[2] });
      if (cdn[1] !== FIXTURE.partnerId) return send(404, 'unknown partner', 'text/plain');
      if (cdn[2] === FIXTURE.playerUiConfId) return send(200, PLAYER_STUB, 'application/javascript');
      if (cdn[2] === FIXTURE.cncUiConfId) return send(200, CNC_STUB, 'application/javascript');
      return send(404, 'unknown uiconf', 'text/plain');
    }

    // ---- Kaltura API v3 ----
    const v3 = url.pathname.match(/^\/api_v3\/service\/(\w+)\/action\/(\w+)$/);
    if (v3) {
      const [, service, action] = v3;
      calls.push({ kind: 'v3', service, action, body });
      if (service === 'user' && action === 'loginByLoginId') {
        if (String(body.partnerId) !== FIXTURE.partnerId) return kalturaError('INVALID_PARTNER_ID', 'bad partner');
        if (FIXTURE.logins[body.loginId] !== body.password) return kalturaError('USER_WRONG_PASSWORD', 'Wrong password supplied');
        return send(200, 'djJ8MTIzNDU2N3xsb2dpbktT');
      }
      try {
        assertAdminKs(body.ks);
      } catch (e) {
        return kalturaError('INVALID_KS', e.message);
      }
      if (service === 'appToken' && action === 'list') {
        return send(200, { objectType: 'KalturaAppTokenListResponse', totalCount: appTokens.length, objects: appTokens });
      }
      if (service === 'appToken' && action === 'add') {
        const created = { ...body.appToken, id: '0_new', token: 'created-cnc-token', status: 2 };
        appTokens.push(created);
        return send(200, created);
      }
      if (service === 'uiConf' && action === 'list') {
        return send(200, { objectType: 'KalturaUiConfListResponse', totalCount: UICONFS.length, objects: UICONFS });
      }
      if (service === 'session' && action === 'get') {
        return send(200, { partnerId: Number(FIXTURE.partnerId), userId: FIXTURE.adminUserId });
      }
      return kalturaError('SERVICE_FORBIDDEN', 'not mocked');
    }

    // ---- Events Platform API ----
    const ep = url.pathname.match(/^\/api\/v1\/(.+)$/);
    if (ep) {
      const path = ep[1];
      const auth = req.headers.authorization || '';
      calls.push({ kind: 'events', path, body, auth });
      try {
        assertAdminKs(auth.replace(/^Bearer /, ''));
      } catch (e) {
        return send(403, { status: 'Forbidden', message: e.message });
      }
      if (failures.events) return send(500, { status: 'InternalError' });
      if (path === 'events/list' && body.pager?.limit > 15) {
        return send(400, { status: 'InvalidArgument', message: 'pager.limit must not be greater than 15' });
      }
      if (path === 'events/list' && !body.filter?.idIn) {
        return send(200, { events: [{ ...FIXTURE.event, id: 11111, name: 'Other Event' }, FIXTURE.event], totalCount: 2, status: 'ok' });
      }
      if (String(body.eventId ?? body.filter?.idIn?.[0]) !== FIXTURE.eventId) {
        return send(404, { status: 'ResourceDoesNotExist' });
      }
      if (path === 'events/list') return send(200, { events: [FIXTURE.event], totalCount: 1, status: 'ok' });
      if (path === 'sessions/list') return send(200, { sessions: FIXTURE.sessions, status: 'ok' });
      if (path === 'event-users/list') {
        const term = (body.filter?.searchTerm || '').toLowerCase();
        const users = FIXTURE.eventUsers.filter((u) => u.email.includes(term));
        return send(200, { users, totalCount: users.length, status: 'ok' });
      }
      return send(404, { status: 'ResourceDoesNotExist' });
    }

    send(404, 'not found', 'text/plain');
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      resolve({
        base,
        calls,
        failures,
        env: {
          KALTURA_PARTNER_ID: FIXTURE.partnerId,
          KALTURA_ADMIN_SECRET: FIXTURE.adminSecret,
          KALTURA_ADMIN_USER_ID: FIXTURE.adminUserId,
          KALTURA_EVENT_ID: FIXTURE.eventId,
          KALTURA_PLAYER_UICONF_ID: FIXTURE.playerUiConfId,
          KALTURA_CNC_UICONF_ID: FIXTURE.cncUiConfId,
          KALTURA_SERVICE_URL: base,
          KALTURA_EVENTS_API_URL: `${base}/api/v1`,
          KALTURA_CDN_URL: base,
          KALTURA_CHAT_SERVICE_URL: `${base}/chat/api_v3`,
          SESSION_SECRET: 'test-session-secret-that-is-long-enough-123',
        },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
