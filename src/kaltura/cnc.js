// Chat & Collaboration (CnC) authentication.
// The CnC widget authenticates with an HS256 JWT signed using the token of an app token
// whose sessionPrivileges are "cncAuth:true" (see BEST_PRACTICES.md in
// https://github.com/kaltura/integrated-events-demo).
import { createHmac } from 'node:crypto';

const b64url = (value) => Buffer.from(value).toString('base64url');

export function signHs256Jwt(payload, secret, header = {}) {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT', ...header }));
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

/**
 * @param {object} o
 * @param {string} o.secret  cncAuth app token "token" value
 * @param {string} o.partnerId
 * @param {string} o.userId  Kaltura user ID of the attendee
 * @param {string} o.entryId session entry ID (CnC context)
 * @param {string} o.eventId virtual event ID
 * @param {boolean} o.isModerator
 * @param {number} o.expirySeconds
 */
export function createCncJwt({ secret, partnerId, userId, entryId, eventId, isModerator, expirySeconds }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    partnerId: String(partnerId),
    uid: userId,
    contextId: entryId,
    groups: isModerator ? [`${entryId}_moderators`] : [],
    isAdmin: false,
    isScopedUser: true,
    virtualEventId: String(eventId),
    iat: now,
    exp: now + expirySeconds,
  };
  return signHs256Jwt(payload, secret, { kid: String(partnerId) });
}

const isCncToken = (t) => (t.sessionPrivileges || '').split(',').map((s) => s.trim()).includes('cncAuth:true');

/** Lists active app tokens that can sign CnC JWTs. */
export async function listCncTokens(kalturaApi, adminKs) {
  return (await kalturaApi.listActiveAppTokens(adminKs)).filter(isCncToken);
}

/** One-time account setup: creates the cncAuth app token used to sign CnC JWTs. */
export function createCncAppToken(kalturaApi, adminKs) {
  return kalturaApi.call(
    'appToken',
    'add',
    {
      appToken: {
        objectType: 'KalturaAppToken',
        sessionPrivileges: 'cncAuth:true',
        hashType: 'SHA256',
        description: 'Chat & Collaboration JWT signing (custom event site)',
      },
    },
    adminKs,
  );
}

/** Resolves the cncAuth app token secret: env var first, otherwise appToken.list (cached by caller). */
export async function resolveCncSecret({ configuredToken, kalturaApi, getAdminKs }) {
  if (configuredToken) return configuredToken;
  const cnc = await listCncTokens(kalturaApi, getAdminKs());
  if (cnc.length !== 1) {
    throw new Error(`Expected exactly one active app token with sessionPrivileges "cncAuth:true", found ${cnc.length}`);
  }
  return cnc[0].token;
}
