// Local Kaltura Session (KS v2) generation, so no session.start round trip per page load.
// Algorithm follows Kaltura's reference implementation in
// https://github.com/kaltura/integrated-events-demo (lib/kaltura-integration/ks-utils).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const SessionType = Object.freeze({ USER: 0, ADMIN: 2 });

const sha1 = (buf) => createHash('sha1').update(buf).digest();
const aesKey = (secret) => sha1(Buffer.from(secret, 'utf8')).subarray(0, 16);
const AES_IV = Buffer.alloc(16, 0);

function pad16(buf) {
  const mod = buf.length % 16;
  return mod ? Buffer.concat([buf, Buffer.alloc(16 - mod, 0)]) : buf;
}

/**
 * @param {object} o
 * @param {string|number} o.partnerId
 * @param {string} o.adminSecret
 * @param {number} o.type SessionType.USER | SessionType.ADMIN
 * @param {string} [o.userId]
 * @param {Record<string,string>} [o.privileges] e.g. { setrole: 'PLAYBACK_BASE_ROLE' }
 * @param {number} [o.expirySeconds] relative lifetime
 */
export function generateKs({ partnerId, adminSecret, type, userId = '', privileges = {}, expirySeconds = 600 }) {
  const fields = {
    ...privileges,
    _e: String(Math.floor(Date.now() / 1000) + expirySeconds),
    _t: String(type),
    _u: userId,
  };
  const encoded = Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  let data = Buffer.concat([randomBytes(16), Buffer.from(encoded, 'utf8')]);
  data = Buffer.concat([sha1(data), data]);

  const cipher = createCipheriv('aes-128-cbc', aesKey(adminSecret), AES_IV);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(pad16(data)), cipher.final()]);

  const raw = Buffer.concat([Buffer.from(`v2|${partnerId}|`, 'utf8'), encrypted]);
  return raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Decrypts and verifies a KS v2. Used by tests and the config check script. */
export function parseKs(ks, adminSecret) {
  const raw = Buffer.from(ks.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const firstSep = raw.indexOf('|');
  const secondSep = raw.indexOf('|', firstSep + 1);
  const header = raw.subarray(0, secondSep).toString('utf8');
  const [version, partnerId] = header.split('|');
  if (version !== 'v2') throw new Error('Not a v2 KS');

  const decipher = createDecipheriv('aes-128-cbc', aesKey(adminSecret), AES_IV);
  decipher.setAutoPadding(false);
  let data = Buffer.concat([decipher.update(raw.subarray(secondSep + 1)), decipher.final()]);
  let end = data.length;
  while (end > 0 && data[end - 1] === 0) end--;
  data = data.subarray(0, end);

  const hash = data.subarray(0, 20);
  const signed = data.subarray(20);
  if (!sha1(signed).equals(hash)) throw new Error('KS signature mismatch');

  const fields = Object.fromEntries(new URLSearchParams(signed.subarray(16).toString('utf8')));
  return {
    partnerId,
    type: Number(fields._t),
    userId: fields._u,
    expiry: Number(fields._e),
    privileges: Object.fromEntries(Object.entries(fields).filter(([k]) => !k.startsWith('_'))),
  };
}
