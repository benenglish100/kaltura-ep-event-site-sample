// Verifies .env against your real Kaltura account before you open the site.
// Usage: npm run check            (add -- --user someone@example.com to also check a registration)
import { loadConfig } from '../src/config.js';
import { createKalturaClients } from '../src/kaltura/admin.js';
import { resolveCncSecret } from '../src/kaltura/cnc.js';
import { listUiConfs, classifyUiConfs, embedUrl } from '../src/kaltura/discover.js';
import { pickSession, PLAYABLE_TYPES } from '../src/app.js';
import { findEnvOverrides } from '../src/lib/env-overrides.js';

const ok = (msg) => console.log(`  ✔ ${msg}`);
const fail = (msg) => console.log(`  ✘ ${msg}`);
const info = (msg) => console.log(`    ${msg}`);
let failures = 0;

async function step(name, fn) {
  console.log(`\n${name}`);
  try {
    await fn();
  } catch (e) {
    failures++;
    fail(e.message);
  }
}

const userArg = process.argv.indexOf('--user');
const checkUser = userArg > -1 ? process.argv[userArg + 1] : null;

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error(e.message);
  console.error('\nRun "npm run setup" to create .env.');
  process.exit(1);
}
const k = config.kaltura;
const { getAdminKs, kalturaApi, eventsApi } = createKalturaClients(k);

console.log(`Checking partner ${k.partnerId}, event ${k.eventId} (${k.region}), auth mode "${config.auth.mode}"`);
const overridden = findEnvOverrides();
if (overridden.length) console.log(`\n  ! Environment variables override .env: ${overridden.join(', ')} (open a new terminal if you edited .env)`);

await step('1. Admin secret (Kaltura API session.get)', async () => {
  const s = await kalturaApi.call('session', 'get', {}, getAdminKs());
  ok(`Admin KS accepted (partner ${s.partnerId}, user "${s.userId}")`);
});

await step('2. Events Platform API access + event', async () => {
  let event;
  try {
    event = await eventsApi.getEvent(k.eventId);
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      throw new Error(`${e.message}. Is KALTURA_ADMIN_USER_ID ("${k.adminUserId}") an Event Platform team member (Admin/Organizer)?`);
    }
    throw e;
  }
  if (!event) throw new Error(`Event ${k.eventId} not found. Check KALTURA_EVENT_ID.`);
  ok(`Event "${event.name}" (${event.startDate} → ${event.endDate}, template ${event.templateId})`);
});

await step('3. Event sessions', async () => {
  const sessions = await eventsApi.listSessions(k.eventId);
  if (!sessions.length) throw new Error('Event has no sessions yet');
  for (const s of sessions) {
    const tag = PLAYABLE_TYPES.has(s.type) ? 'playable' : 'not supported by this site';
    info(`${s.id}  ${s.type.padEnd(12)} ${s.visibility.padEnd(9)} ${s.name}  [${tag}]`);
  }
  const picked = pickSession(sessions, { configuredId: k.sessionId });
  if (!picked) throw new Error(k.sessionId ? `KALTURA_SESSION_ID ${k.sessionId} is not in this event` : 'No playable (LiveWebcast/SimuLive) session found');
  if (!PLAYABLE_TYPES.has(picked.type)) throw new Error(`Selected session ${picked.id} is type ${picked.type}, which the player page does not support`);
  ok(`Default session: ${picked.id} "${picked.name}"`);
});

await step('4. CnC app token (cncAuth:true)', async () => {
  try {
    const secret = await resolveCncSecret({ configuredToken: k.cncAppToken, kalturaApi, getAdminKs });
    ok(`CnC signing token available (${k.cncAppToken ? 'from KALTURA_CNC_APP_TOKEN' : 'found via appToken.list'}, ${secret.length} chars)`);
  } catch (e) {
    throw new Error(`${e.message}. "npm run setup" can create one.`);
  }
});

let suggestions = null;
const suggest = async (kind) => {
  suggestions ??= classifyUiConfs(await listUiConfs(kalturaApi, getAdminKs()));
  const list = suggestions[kind];
  if (list.length) info(`Candidates on this account: ${list.map((u) => `${u.id} "${u.name}"`).join(', ')}`);
};

// Each bundle is identified by an API it must expose (the reactions bundle also defines KalturaEventsPlatform).
const bundles = [
  ['5. Player bundle (KALTURA_PLAYER_UICONF_ID)', k.playerUiConfId, /KalturaPlayer/, 'players'],
  ['6. CnC bundle (KALTURA_CNC_UICONF_ID)', k.cncUiConfId, /renderCncContainer/, 'cnc'],
];
const reactionsUiConf = config.cnc.reactionsSourceUrl.match(/uiconf_id\/(\d+)/)?.[1];
if (config.cnc.reactionsSourceUrl) {
  bundles.push(['7. Reactions bundle (CNC_REACTIONS_SOURCE_URL)', reactionsUiConf, /KEP reactions widgets/i, 'reactions']);
}

for (const [label, uiConfId, marker, kind] of bundles) {
  await step(label, async () => {
    const url = kind === 'reactions' ? config.cnc.reactionsSourceUrl : embedUrl(k.cdnUrl, k.partnerId, uiConfId);
    const res = await fetch(url);
    if (!res.ok) {
      await suggest(kind).catch(() => {});
      throw new Error(`${url} returned HTTP ${res.status}`);
    }
    const body = await res.text();
    if (!marker.test(body)) {
      await suggest(kind).catch(() => {});
      throw new Error(`${url} does not look like the ${kind} bundle (no ${marker}). Wrong uiconf ID?`);
    }
    ok(`${url} (${Math.round(body.length / 1024)} KB)`);
  });
}

if (checkUser) {
  await step(`Event registration for ${checkUser}`, async () => {
    const u = await eventsApi.findEventUserByEmail(k.eventId, checkUser);
    if (!u) throw new Error('Not registered for this event');
    ok(`${u.firstName} ${u.lastName}, roles ${u.roles.join('/') || 'Attendee'}, status ${u.status}, Kaltura user ID ${u.id}`);
  });
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
