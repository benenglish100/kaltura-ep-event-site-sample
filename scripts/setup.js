// Interactive setup: asks for the Kaltura account basics, discovers everything else
// (event, sessions, player/CnC/reactions uiconfs, CnC signing token) and writes .env.
// Usage: npm run setup
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import readline from 'node:readline';

import { REGIONS } from '../src/config.js';
import { createKalturaClients } from '../src/kaltura/admin.js';
import { listCncTokens, createCncAppToken } from '../src/kaltura/cnc.js';
import { listUiConfs, classifyUiConfs, embedUrl } from '../src/kaltura/discover.js';
import { PLAYABLE_TYPES } from '../src/app.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.resolve('.env');

// ---- prompting (works interactively and with piped input) --------------------------------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const lines = [];
const waiters = [];
rl.on('line', (line) => (waiters.length ? waiters.shift()(line) : lines.push(line)));
rl.on('close', () => waiters.splice(0).forEach((w) => w(null)));
let muted = false;
rl._writeToOutput = (s) => {
  if (!muted) process.stdout.write(s);
};

async function ask(question, { fallback = '', secret = false } = {}) {
  const hint = fallback && !secret ? ` [${fallback}]` : fallback && secret ? ' [keep current]' : '';
  process.stdout.write(`${question}${hint}: `);
  muted = secret && process.stdin.isTTY;
  const line = lines.length ? lines.shift() : await new Promise((r) => waiters.push(r));
  muted = false;
  if (secret && process.stdin.isTTY) process.stdout.write('\n');
  if (line === null) throw new Error('Input ended');
  return line.trim() || fallback;
}

async function choose(question, items, { label, fallbackIndex = 0, allowNone = false, allowCustom = false }) {
  items.forEach((it, i) => console.log(`  ${i + 1}) ${label(it)}`));
  if (allowNone) console.log('  0) none');
  const extra = allowCustom ? ' (or type an ID)' : '';
  for (;;) {
    const answer = await ask(`${question}${extra}`, { fallback: items.length ? String(fallbackIndex + 1) : allowNone ? '0' : '' });
    if (allowNone && answer === '0') return null;
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= items.length) return items[n - 1];
    if (allowCustom && answer) return { id: answer, custom: true };
    console.log('  Please pick one of the numbers above.');
  }
}

const yes = async (q, def = true) => /^y/i.test(await ask(`${q} (${def ? 'Y/n' : 'y/N'})`, { fallback: def ? 'y' : 'n' }));
const heading = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

// ---- main ---------------------------------------------------------------------------------
async function main() {
  const existing = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')) : {};
  const cur = (key) => existing[key] || '';
  const values = {};

  console.log('Event site sample setup (unofficial sample code, not supported by Kaltura, not production ready).');
  console.log('Press Enter to accept the value in [brackets].');

  heading('1. Kaltura account (KMC > Settings > Integration Settings)');
  const region = (await ask(`Region (${Object.keys(REGIONS).join('/')})`, { fallback: cur('KALTURA_REGION') || 'NVP' })).toUpperCase();
  if (!REGIONS[region]) throw new Error(`Unknown region ${region}`);
  values.KALTURA_REGION = region;
  values.KALTURA_PARTNER_ID = await ask('Partner ID', { fallback: cur('KALTURA_PARTNER_ID') });
  values.KALTURA_ADMIN_SECRET = await ask('Admin secret', { fallback: cur('KALTURA_ADMIN_SECRET'), secret: true });
  values.KALTURA_ADMIN_USER_ID = await ask('Admin user ID (must be an Event Platform team member)', {
    fallback: cur('KALTURA_ADMIN_USER_ID'),
  });
  if (!values.KALTURA_PARTNER_ID || !values.KALTURA_ADMIN_SECRET || !values.KALTURA_ADMIN_USER_ID) {
    throw new Error('Partner ID, admin secret and admin user ID are required');
  }

  const k = {
    ...REGIONS[region],
    partnerId: values.KALTURA_PARTNER_ID,
    adminSecret: values.KALTURA_ADMIN_SECRET,
    adminUserId: values.KALTURA_ADMIN_USER_ID,
    ...(cur('KALTURA_SERVICE_URL') && { serviceUrl: cur('KALTURA_SERVICE_URL') }),
    ...(cur('KALTURA_EVENTS_API_URL') && { eventsApiUrl: cur('KALTURA_EVENTS_API_URL') }),
    ...(cur('KALTURA_CDN_URL') && { cdnUrl: cur('KALTURA_CDN_URL') }),
  };
  const { getAdminKs, kalturaApi, eventsApi } = createKalturaClients(k);
  try {
    await kalturaApi.call('session', 'get', {}, getAdminKs());
    console.log('  ✔ Credentials accepted');
  } catch (e) {
    throw new Error(`Kaltura rejected the partner ID / admin secret: ${e.message}`);
  }

  heading('2. Event');
  let events;
  try {
    events = await eventsApi.listEvents();
  } catch (e) {
    const hint = e.status === 401 || e.status === 403 ? `\n  Make sure "${k.adminUserId}" is an Event Platform team member (Admin/Organizer).` : '';
    throw new Error(`${e.message}${hint}`);
  }
  if (!events.length) throw new Error('No events found. Create one in Event Platform first.');
  const curEvent = Math.max(0, events.findIndex((e) => String(e.id) === cur('KALTURA_EVENT_ID')));
  const event = await choose('Event', events, {
    label: (e) => `${e.name}  (id ${e.id}, ${e.startDate?.slice(0, 16).replace('T', ' ')})`,
    fallbackIndex: curEvent,
  });
  values.KALTURA_EVENT_ID = String(event.id);

  const sessions = await eventsApi.listSessions(event.id);
  const playable = sessions.filter((s) => PLAYABLE_TYPES.has(s.type));
  sessions.forEach((s) => console.log(`    ${s.id}  ${s.type.padEnd(12)} ${s.name}${PLAYABLE_TYPES.has(s.type) ? '' : '  (not supported)'}`));
  if (!playable.length) console.log('  ! No LiveWebcast/SimuLive session yet. Add one in Event Platform before testing.');
  values.KALTURA_SESSION_ID = '';
  if (playable.length > 1 && (await yes('Pin one session? (otherwise the live-now/next one is shown)', false))) {
    values.KALTURA_SESSION_ID = (await choose('Session', playable, { label: (s) => `${s.name} (${s.id})` })).id;
  }

  heading('3. Embedded components (uiconfs)');
  const found = classifyUiConfs(await listUiConfs(kalturaApi, getAdminKs()));
  const uiLabel = (u) => `${u.id}  ${u.name}`;

  console.log('Player (webcast player):');
  values.KALTURA_PLAYER_UICONF_ID = (await choose('Player uiconf', found.players, { label: uiLabel, allowCustom: true })).id;

  console.log('Chat & Collaboration:');
  if (!found.cnc.length) console.log('  ! None found. Chat & Collaboration may not be enabled on this account; ask your Kaltura team for the uiconf ID.');
  values.KALTURA_CNC_UICONF_ID = (await choose('CnC uiconf', found.cnc, { label: uiLabel, allowCustom: true })).id;

  console.log('Emoji reactions (optional):');
  const reactions = await choose('Reactions uiconf', found.reactions, { label: uiLabel, allowNone: true, allowCustom: true });
  values.CNC_REACTIONS_SOURCE_URL = reactions ? embedUrl(k.cdnUrl, k.partnerId, reactions.id) : '';

  heading('4. Chat signing token (app token with cncAuth:true)');
  const tokens = await listCncTokens(kalturaApi, getAdminKs());
  if (tokens.length === 1) {
    values.KALTURA_CNC_APP_TOKEN = tokens[0].token;
    console.log(`  ✔ Found app token ${tokens[0].id}`);
  } else if (tokens.length > 1) {
    const t = await choose('Several found, pick one', tokens, { label: (x) => `${x.id}  ${x.description || ''}` });
    values.KALTURA_CNC_APP_TOKEN = t.token;
  } else if (await yes('None found. Create one now? (one-time, adds an app token to the account)')) {
    const t = await createCncAppToken(kalturaApi, getAdminKs());
    values.KALTURA_CNC_APP_TOKEN = t.token;
    console.log(`  ✔ Created app token ${t.id}`);
  } else {
    console.log('  ! Chat will not work until a cncAuth:true app token exists.');
  }

  heading('5. Website');
  const auth = await choose(
    'How do attendees sign in?',
    [
      { id: 'local', text: 'Passwords managed by this site (npm run add-user). Works with Event Platform invites.' },
      { id: 'kaltura', text: 'Their Kaltura login (user.loginByLoginId). Only for users who have a Kaltura password.' },
    ],
    { label: (x) => `${x.id}: ${x.text}`, fallbackIndex: cur('AUTH_MODE') === 'kaltura' ? 1 : 0 },
  );
  values.AUTH_MODE = auth.id;
  values.SITE_TITLE = await ask('Site title shown on the sign-in page (optional)', { fallback: cur('SITE_TITLE') || event.name });
  values.BRAND_COLOR = await ask('Brand color', { fallback: cur('BRAND_COLOR') || '#006EFA' });
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(values.BRAND_COLOR)) throw new Error('Brand color must be a hex value like #006EFA');
  values.SESSION_SECRET = cur('SESSION_SECRET') || randomBytes(48).toString('base64url');

  // Fill the documented template, keeping any other settings from an existing .env.
  let out = readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  const merged = { ...existing, ...values };
  for (const [key, value] of Object.entries(merged)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    out = re.test(out) ? out.replace(re, () => line) : `${out.trimEnd()}\n${line}\n`;
  }
  if (existsSync(ENV_FILE)) {
    copyFileSync(ENV_FILE, `${ENV_FILE}.bak`);
    console.log('\n  Previous .env saved as .env.bak');
  }
  writeFileSync(ENV_FILE, out);

  heading('Done. .env written.');
  console.log('Next:');
  if (values.AUTH_MODE === 'local') console.log('  npm run add-user -- attendee@example.com   (once per attendee; the email must be registered for the event)');
  console.log('  npm run check                              (verifies everything against Kaltura)');
  console.log('  npm start                                  (http://localhost:3000)');
}

main()
  .catch((e) => {
    console.error(`\n✘ ${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
