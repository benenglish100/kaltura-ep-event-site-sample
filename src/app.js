import express from 'express';
import helmet from 'helmet';
import cookieSession from 'cookie-session';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createKalturaClients } from './kaltura/admin.js';
import { embedUrl } from './kaltura/discover.js';
import { generateKs, SessionType } from './kaltura/ks.js';
import { createCncJwt, resolveCncSecret } from './kaltura/cnc.js';
import { createAuthenticator, AuthError } from './auth/authenticate.js';
import { createCache } from './lib/cache.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const VIEWS_DIR = path.join(ROOT, 'views');

// Session types the webcast player can render. Interactive rooms (KME) are out of scope for this example.
export const PLAYABLE_TYPES = new Set(['LiveWebcast', 'SimuLive']);

const MINUTE = 60 * 1000;

const origin = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

function buildCsp(config) {
  const k = config.kaltura;
  const kalturaOrigins = [k.serviceUrl, k.cdnUrl, k.chatServiceUrl, k.eventsApiUrl, config.cnc.analyticsUrl, config.cnc.moderatorUrl]
    .map(origin)
    .filter(Boolean);
  const reactions = origin(config.cnc.reactionsSourceUrl);
  if (reactions) kalturaOrigins.push(reactions);
  const kaltura = [...new Set([...kalturaOrigins, 'https://*.kaltura.com'])];
  const kalturaWs = kaltura.map((o) => o.replace(/^http/, 'ws'));

  return {
    useDefaults: false,
    reportOnly: !config.cspEnforce,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'", ...kaltura],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', ...kaltura],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com', ...kaltura],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'blob:', 'data:', 'https:'], // data: = player's autoplay probe
      connectSrc: ["'self'", ...kaltura, ...kalturaWs],
      frameSrc: ["'self'", ...kaltura],
      workerSrc: ["'self'", 'blob:'],
    },
  };
}

/** Chooses which session to show. Exported for tests. */
export function pickSession(sessions, { requestedId, configuredId, now = Date.now() }) {
  const visible = sessions.filter((s) => s.visibility !== 'private' || s.id === configuredId);

  if (requestedId) return visible.find((s) => s.id === requestedId) || null;
  if (configuredId) return sessions.find((s) => s.id === configuredId) || null;

  const candidates = visible
    .filter((s) => PLAYABLE_TYPES.has(s.type))
    .sort((a, b) => Date.parse(a.startDate || 0) - Date.parse(b.startDate || 0));
  // Live now or next upcoming, otherwise the most recent one.
  return candidates.find((s) => !s.endDate || Date.parse(s.endDate) >= now) || candidates.at(-1) || null;
}

export function createApp({ config, kalturaApi, eventsApi, logger = console } = {}) {
  const k = config.kaltura;

  const clients = createKalturaClients(k);
  const adminKs = clients.getAdminKs;
  kalturaApi ??= clients.kalturaApi;
  eventsApi ??= clients.eventsApi;
  const authenticate = createAuthenticator({ config, kalturaApi, eventsApi });
  const cache = createCache();

  const getEvent = () => cache.get('event', 5 * MINUTE, () => eventsApi.getEvent(k.eventId));
  const getSessions = () => cache.get('sessions', MINUTE, () => eventsApi.listSessions(k.eventId));
  const getCncSecret = () =>
    cache.get('cncSecret', 24 * 60 * MINUTE, () =>
      resolveCncSecret({ configuredToken: k.cncAppToken, kalturaApi, getAdminKs: adminKs }),
    );

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: buildCsp(config),
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(
    cookieSession({
      name: 'ep_session',
      keys: [config.sessionSecret],
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: config.sessionTtlHours * 60 * MINUTE,
    }),
  );
  app.use(express.json({ limit: '10kb' }));

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use('/assets', express.static(PUBLIC_DIR, { index: false, maxAge: config.isProduction ? '1h' : 0 }));

  const isLoggedIn = (req) => Boolean(req.session?.user?.id);

  const requireAuth = (req, res, next) => {
    if (!isLoggedIn(req)) return res.status(401).json({ error: 'not_authenticated' });
    next();
  };

  // Blocks cross-site form posts: JSON content type plus same-origin check when Origin is present.
  const sameOriginJson = (req, res, next) => {
    if (!req.is('application/json')) return res.status(415).json({ error: 'json_required' });
    const reqOrigin = req.get('origin');
    if (reqOrigin && origin(reqOrigin) !== `${req.protocol}://${req.get('host')}`) {
      return res.status(403).json({ error: 'bad_origin' });
    }
    next();
  };

  // ---- Pages ---------------------------------------------------------------------------
  app.get('/', (req, res) => {
    if (isLoggedIn(req)) return res.redirect('/session');
    res.sendFile(path.join(VIEWS_DIR, 'login.html'));
  });

  app.get('/session', (req, res) => {
    if (!isLoggedIn(req)) return res.redirect('/');
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(VIEWS_DIR, 'session.html'));
  });

  // ---- API -----------------------------------------------------------------------------
  const loginLimiter = rateLimit({
    windowMs: 15 * MINUTE,
    limit: config.loginRateLimit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'too_many_attempts' },
  });

  app.post('/api/login', loginLimiter, sameOriginJson, async (req, res, next) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password || username.length > 254 || password.length > 1024) {
      return res.status(400).json({ error: 'missing_credentials' });
    }
    try {
      const user = await authenticate(username, password);
      req.session = { user, createdAt: Date.now() };
      res.json({ ok: true, redirect: '/session' });
    } catch (e) {
      if (e instanceof AuthError) {
        logger.warn?.(`[login] failed for "${username}": ${e.detail} (auth mode ${config.auth.mode})`);
        const status = e.reason === 'not_registered' ? 403 : 401;
        return res.status(status).json({ error: e.reason });
      }
      next(e);
    }
  });

  // Public event info for the login page (cached, so it can't be used to hammer the Events API).
  app.get('/api/event', async (req, res, next) => {
    try {
      const event = await getEvent();
      res.json({
        name: event?.name || '',
        startDate: event?.startDate || null,
        endDate: event?.endDate || null,
        site: config.site,
      });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/logout', sameOriginJson, (req, res) => {
    req.session = null;
    res.json({ ok: true });
  });

  app.get('/api/session-config', requireAuth, async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      const user = req.session.user;
      const requestedId = typeof req.query.id === 'string' ? req.query.id : '';
      const [event, sessions] = await Promise.all([getEvent(), getSessions()]);

      const session = pickSession(sessions, { requestedId, configuredId: k.sessionId });
      if (!session) return res.status(404).json({ error: 'session_not_found' });
      if (!PLAYABLE_TYPES.has(session.type)) {
        return res.status(422).json({ error: 'unsupported_session_type', type: session.type });
      }

      const expirySeconds = Math.round(k.ksExpiryHours * 3600);
      const isModerator = (user.roles || []).includes('Moderator');

      // Playback-only user KS. Privileges per Kaltura's reference app (integrated-events-demo,
      // kaltura-client-wrapper.ts / kaltura-user.model.ts), with entitlement narrowed to this entry.
      const ks = generateKs({
        partnerId: k.partnerId,
        adminSecret: k.adminSecret,
        type: SessionType.USER,
        userId: user.id,
        privileges: {
          setrole: 'PLAYBACK_BASE_ROLE',
          disableentitlementforentry: session.id,
          virtualeventid: k.eventId,
        },
        expirySeconds,
      });

      const jwt = createCncJwt({
        secret: await getCncSecret(),
        partnerId: k.partnerId,
        userId: user.id,
        entryId: session.id,
        eventId: k.eventId,
        isModerator,
        expirySeconds,
      });

      res.json({
        site: config.site,
        user: {
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
          email: user.email,
          isModerator,
        },
        event: { id: k.eventId, name: event?.name || '' },
        session: {
          id: session.id,
          name: session.name,
          description: session.description || '',
          type: session.type,
          startDate: session.startDate || null,
          endDate: session.endDate || null,
        },
        sessions: sessions
          .filter((s) => PLAYABLE_TYPES.has(s.type) && (s.visibility !== 'private' || s.id === k.sessionId))
          .map(({ id, name, startDate }) => ({ id, name, startDate: startDate || null })),
        player: {
          scriptUrl: embedUrl(k.cdnUrl, k.partnerId, k.playerUiConfId),
          partnerId: Number(k.partnerId),
          uiConfId: Number(k.playerUiConfId),
          entryId: session.id,
          ks,
        },
        cnc: {
          scriptUrl: embedUrl(k.cdnUrl, k.partnerId, k.cncUiConfId),
          serviceUrl: k.chatServiceUrl,
          jwt,
          ks,
          legalTextUrl: '/assets/legal.txt',
          brandColor: config.site.brandColor,
          themeMode: config.cnc.themeMode,
          reactionsSourceUrl: config.cnc.reactionsSourceUrl,
          analyticsUrl: config.cnc.analyticsUrl,
          moderatorUrl: config.cnc.moderatorUrl,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    logger.error(`[error] ${req.method} ${req.path}: ${err.message}`);
    if (res.headersSent) return;
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json' });
    res.status(502).json({ error: 'upstream_error' });
  });

  return app;
}
