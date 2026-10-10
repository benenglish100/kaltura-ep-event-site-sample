// Loads and validates configuration from environment variables.
// Everything secret stays on the server; only IDs/URLs are ever sent to the browser.

export const REGIONS = {
  NVP: {
    serviceUrl: 'https://www.kaltura.com',
    eventsApiUrl: 'https://events-api.nvp1.ovp.kaltura.com/api/v1',
    chatServiceUrl: 'https://chat.nvp1.ovp.kaltura.com/api_v3',
    cdnUrl: 'https://cdnapisec.kaltura.com',
  },
  // EU / DE: Events API URLs are from Kaltura's docs. Confirm the API/chat/CDN hosts
  // with your Kaltura account team and override with the explicit env vars if needed.
  EU: {
    serviceUrl: 'https://api.irp2.ovp.kaltura.com',
    eventsApiUrl: 'https://events-api.irp2.ovp.kaltura.com/api/v1',
    chatServiceUrl: 'https://chat.irp2.ovp.kaltura.com/api_v3',
    cdnUrl: 'https://cdnapisec.irp2.ovp.kaltura.com',
  },
  DE: {
    serviceUrl: 'https://api.frp2.ovp.kaltura.com',
    eventsApiUrl: 'https://events-api.frp2.ovp.kaltura.com/api/v1',
    chatServiceUrl: 'https://chat.frp2.ovp.kaltura.com/api_v3',
    cdnUrl: 'https://cdnapisec.frp2.ovp.kaltura.com',
  },
};

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function num(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Expected a number, got "${value}"`);
  return n;
}

function trimSlash(url) {
  return url.replace(/\/+$/, '');
}

export function loadConfig(env = process.env) {
  const errors = [];
  const required = (name) => {
    const v = env[name];
    if (v === undefined || v === '') errors.push(`${name} is required`);
    return v;
  };

  const region = (env.KALTURA_REGION || 'NVP').toUpperCase();
  const defaults = REGIONS[region];
  if (!defaults) errors.push(`KALTURA_REGION must be one of ${Object.keys(REGIONS).join(', ')}`);

  // Default "local": Event Platform invitations don't give attendees a password.
  const authMode = (env.AUTH_MODE || 'local').toLowerCase();
  if (!['kaltura', 'local'].includes(authMode)) errors.push('AUTH_MODE must be "kaltura" or "local"');

  const sessionSecret = required('SESSION_SECRET');
  if (sessionSecret && sessionSecret.length < 32) errors.push('SESSION_SECRET must be at least 32 characters');

  const config = {
    port: num(env.PORT, 3000),
    isProduction: env.NODE_ENV === 'production',
    trustProxy: bool(env.TRUST_PROXY, false),
    sessionSecret,
    sessionTtlHours: num(env.SESSION_TTL_HOURS, 12),
    loginRateLimit: num(env.LOGIN_RATE_LIMIT, 10), // attempts per IP per 15 minutes
    cspEnforce: bool(env.CSP_ENFORCE, false),

    auth: {
      mode: authMode,
      usersFile: env.USERS_FILE || 'users.json',
      requireEventRegistration: bool(env.REQUIRE_EVENT_REGISTRATION, true),
    },

    kaltura: {
      region,
      partnerId: required('KALTURA_PARTNER_ID'),
      adminSecret: required('KALTURA_ADMIN_SECRET'),
      adminUserId: required('KALTURA_ADMIN_USER_ID'),
      eventId: required('KALTURA_EVENT_ID'),
      sessionId: env.KALTURA_SESSION_ID || '',
      playerUiConfId: required('KALTURA_PLAYER_UICONF_ID'),
      cncUiConfId: required('KALTURA_CNC_UICONF_ID'),
      cncAppToken: env.KALTURA_CNC_APP_TOKEN || '',
      ksExpiryHours: num(env.KS_EXPIRY_HOURS, 12),
      serviceUrl: trimSlash(env.KALTURA_SERVICE_URL || defaults?.serviceUrl || ''),
      eventsApiUrl: trimSlash(env.KALTURA_EVENTS_API_URL || defaults?.eventsApiUrl || ''),
      chatServiceUrl: trimSlash(env.KALTURA_CHAT_SERVICE_URL || defaults?.chatServiceUrl || ''),
      cdnUrl: trimSlash(env.KALTURA_CDN_URL || defaults?.cdnUrl || ''),
    },

    site: {
      title: env.SITE_TITLE || '',
      brandColor: env.BRAND_COLOR || env.CNC_BRAND_COLOR || '#006EFA',
    },

    cnc: {
      themeMode: env.CNC_THEME_MODE || 'light',
      reactionsSourceUrl: env.CNC_REACTIONS_SOURCE_URL || '',
      analyticsUrl: env.CNC_ANALYTICS_URL || 'https://analytics.kaltura.com',
      moderatorUrl: env.CNC_MODERATOR_URL || 'https://www.kaltura.com/apps/kep-moderator/latest/embed.php',
    },
  };

  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(config.site.brandColor)) {
    errors.push('BRAND_COLOR must be a hex color like #006EFA');
  }
  if (config.kaltura.eventId && !/^\d+$/.test(config.kaltura.eventId)) {
    errors.push('KALTURA_EVENT_ID must be the numeric Event Platform event ID');
  }

  if (errors.length) {
    const err = new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
    err.configErrors = errors;
    throw err;
  }
  return config;
}
