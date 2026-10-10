// Optional local user store (AUTH_MODE=local) for when attendees don't have Kaltura passwords.
// Passwords are stored as scrypt hashes: "scrypt$<salt b64>$<hash b64>".
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);
const KEYLEN = 64;
const DUMMY_HASH = `scrypt$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(KEYLEN).toString('base64')}`;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

export async function readUsers(file) {
  try {
    const json = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(json.users) ? json.users : [];
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
}

/**
 * Returns { user } on success or { user: null, reason } otherwise ('unknown_user' | 'wrong_password').
 * Runs scrypt even for unknown users (no timing oracle). The reason is for server logs only.
 */
export async function verifyLocalUser(file, username, password) {
  const users = await readUsers(file);
  const wanted = username.trim().toLowerCase();
  const user = users.find((u) => String(u.username).toLowerCase() === wanted);
  const ok = await verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user) return { user: null, reason: 'unknown_user' };
  return ok ? { user } : { user: null, reason: 'wrong_password' };
}
