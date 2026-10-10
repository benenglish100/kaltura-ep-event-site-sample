# Integration guide: rebuilding this on your own platform

This guide describes the integration **independently of this codebase**, so you can reproduce it in any
language or framework (Java/Spring, .NET, PHP, Python/Django, a headless CMS, …). Each step names the
file in this repo that implements it, for reference.

- [What you need to build](#what-you-need-to-build)
- [Step 1: Server-side admin KS](#step-1-server-side-admin-ks)
- [Step 2: Read the event from the Events Platform API](#step-2-read-the-event-from-the-events-platform-api)
- [Step 3: Authenticate the attendee and check registration](#step-3-authenticate-the-attendee-and-check-registration)
- [Step 4: Issue the player KS](#step-4-issue-the-player-ks)
- [Step 5: Sign the CnC JWT](#step-5-sign-the-cnc-jwt)
- [Step 6: Embed the player](#step-6-embed-the-player)
- [Step 7: Embed Chat & Collaboration](#step-7-embed-chat--collaboration)
- [Step 8: Content Security Policy](#step-8-content-security-policy)
- [Checklist](#checklist)

---

## What you need to build

| Piece | Runs on | Talks to |
|---|---|---|
| Admin KS generator | server | (local crypto) |
| Events API client: event, sessions, event users | server | Events Platform API |
| Sign-in + registration check | server | your IdP + Events Platform API |
| Player KS generator | server | (local crypto) |
| CnC JWT signer | server | (local crypto) |
| An authenticated endpoint returning `{ ks, jwt, entryId, … }` | server | browser |
| Page that loads two Kaltura bundles and mounts the components | browser | Kaltura CDN, player, CnC |

Secrets (admin secret, `cncAuth` token) live **only on the server**.

---

## Step 1: Server-side admin KS

The Events Platform API and a few Kaltura API calls need an **admin KS** (type `2`) whose user is an
**Event Platform team member** (Admin/Organizer).

**Option A: generate it locally (recommended, no network call).** A KS v2 is:

```
fields   = url-encode({ ...privileges, "_e": <unix expiry>, "_t": <type>, "_u": <userId> })   # "k=v&k=v"
payload  = random(16 bytes) + fields
signed   = SHA1(payload) + payload                                  # 20-byte SHA-1 prefix
key      = SHA1(adminSecret)[0:16]
cipher   = AES-128-CBC(key, iv = 16 zero bytes, no padding) over signed, zero-padded to a 16-byte multiple
KS       = base64url( "v2|" + partnerId + "|" + cipher )            # + → -, / → _
```

* Session types: `0` = USER, `2` = ADMIN.
* Privileges are key/value pairs, e.g. `{ "disableentitlement": "" }`, `{ "setrole": "PLAYBACK_BASE_ROLE" }`.
* Implementation in this repo: [src/kaltura/ks.js](../src/kaltura/ks.js) (≈40 lines, `node:crypto`).
* Official clients ship the same algorithm, e.g. the **Python** client's
  `KalturaClient.generateSessionV2(adminSecret, userId, type, partnerId, expiry, privileges)`
  (privileges as `"key:value,key:value"`). The Node.js client does not include it.

Admin KS used here: type `2`, user = team member, privileges `disableentitlement`, expiry 5 minutes
(generate a fresh one per call or cache it briefly).

**Option B: `session.start`.** `POST https://www.kaltura.com/api_v3/service/session/action/start` with
`secret`, `partnerId`, `type=2`, `userId`, `expiry`, `privileges`. Simpler, but one API call per KS.

**Verify:** `POST /api_v3/service/session/action/get` with `ks=<KS>&format=1` returns your partner and user.

---

## Step 2: Read the event from the Events Platform API

Base URL (NVP): `https://events-api.nvp1.ovp.kaltura.com/api/v1` (EU: `irp2`, DE: `frp2`).
All endpoints are `POST` with a JSON body and `Authorization: Bearer <admin KS>`. A successful response
has `"status": "ok"`. Full spec: [openapi-public-api.yaml](https://github.com/kaltura/mcp-events/blob/main/openapi-public-api.yaml).

**The event**

```bash
curl -X POST "$EVENTS_API/events/list" \
  -H "Authorization: Bearer $ADMIN_KS" -H "Content-Type: application/json" \
  -d '{"filter":{"idIn":[4567890]},"pager":{"offset":0,"limit":1}}'
# → { "events":[{ "id":4567890, "name":"…", "startDate":"…", "endDate":"…", "templateId":"tm2000", … }], "totalCount":1, "status":"ok" }
```

> `events/list` returns at most **15** per page, and its `pager.offset` is a **page index**.

**Its sessions**

```bash
curl -X POST "$EVENTS_API/sessions/list" \
  -H "Authorization: Bearer $ADMIN_KS" -H "Content-Type: application/json" \
  -d '{"eventId":4567890}'
# → { "sessions":[{ "id":"1_abcd1234", "type":"LiveWebcast", "visibility":"published",
#                   "name":"…", "startDate":"…", "endDate":"…", … }], "status":"ok" }
```

A session's `id` is the Kaltura **entry ID** that you give to the player and to CnC.
Types: `LiveWebcast`, `SimuLive` (playable by the player), `MeetingEntry`, `LiveKME`, `VirtualLearningRoom` (rooms).

Cache both responses for a minute or more; they change rarely.

Implementation: [src/kaltura/events-api.js](../src/kaltura/events-api.js).

---

## Step 3: Authenticate the attendee and check registration

Authenticate however your platform does (SSO, CMS login, …) and end up with the attendee's **email**.
Then confirm they're registered for the event:

```bash
curl -X POST "$EVENTS_API/event-users/list" \
  -H "Authorization: Bearer $ADMIN_KS" -H "Content-Type: application/json" \
  -d '{"eventId":4567890,"filter":{"searchTerm":"jane@example.com"},"pager":{"offset":0,"limit":50}}'
# → { "users":[{ "id":"1ef91ea6…", "email":"jane@example.com", "firstName":"Jane", "lastName":"Doe",
#                "roles":["Moderator"], "status":"Registered" }], "totalCount":1, "status":"ok" }
```

* `searchTerm` is a fuzzy search, so **match the email exactly** (case-insensitive) in the results.
* Refuse users whose `status` indicates they're blocked/declined/removed.
* Keep `id`: it's the attendee's **Kaltura user ID**, used in the KS and JWT.
* `roles` includes `Moderator` for chat moderators.

Store `{ id, email, firstName, lastName, roles }` in your server-side session.

If your attendees have Kaltura passwords, you can verify them with
`POST /api_v3/service/user/action/loginByLoginId` (`loginId`, `password`, `partnerId`): success returns a KS,
failure a `KalturaAPIException`. Event Platform invitations don't create passwords, though.

Implementation: [src/auth/authenticate.js](../src/auth/authenticate.js).

---

## Step 4: Issue the player KS

Per attendee, per page load, generate a **USER** KS (type `0`) for `userId = <EP user id>` with:

| Privilege | Value | Purpose |
|---|---|---|
| `setrole` | `PLAYBACK_BASE_ROLE` | Restricts the KS to playback |
| `disableentitlementforentry` | `<entryId>` | Plays the session even if category entitlements restrict the entry |
| `virtualeventid` | `<eventId>` | Ties playback analytics to the event |

Expiry: longer than the session (this repo defaults to 12 hours).

> The reference app [integrated-events-demo](https://github.com/kaltura/integrated-events-demo) uses
> partner-wide `disableentitlement`. Scoping it to the entry, as here, is tighter. Widen it only if your
> player must play other restricted entries.

---

## Step 5: Sign the CnC JWT

**Signing key:** the `token` of the account's app token with `sessionPrivileges == "cncAuth:true"`
(`appToken.list` with an admin KS; create it once with `appToken.add` if missing; see
[kaltura-setup.md](kaltura-setup.md#9-cncauth-app-token)). Store it as a server secret.

**JWT:** HS256, header `kid` = partner ID (string).

```json
// header
{ "alg": "HS256", "typ": "JWT", "kid": "1234567" }
// payload
{
  "partnerId": "1234567",
  "uid": "<EP user id>",
  "contextId": "<session entry id>",
  "virtualEventId": "<event id>",
  "groups": ["<entryId>_moderators"],   // only for moderators; otherwise []
  "isAdmin": false,
  "isScopedUser": true,
  "iat": 1760000000,
  "exp": 1760043200
}
```

Examples:

```js
// Node.js (jsonwebtoken)
jwt.sign(payload, cncToken, { algorithm: 'HS256', header: { kid: String(partnerId) } });
```

```python
# Python (PyJWT)
jwt.encode(payload, cnc_token, algorithm="HS256", headers={"kid": str(partner_id)})
```

```php
// PHP (firebase/php-jwt)
JWT::encode($payload, $cncToken, 'HS256', (string) $partnerId);
```

Implementation (no library, `node:crypto`): [src/kaltura/cnc.js](../src/kaltura/cnc.js).

**Endpoint:** return the KS, JWT and IDs to the authenticated page, with `Cache-Control: no-store`.
This repo's shape is documented in [http-api.md](http-api.md#get-apisession-config).

---

## Step 6: Embed the player

```html
<div style="position:relative; aspect-ratio:16/9; background:#000">
  <div id="player" style="position:absolute; inset:0"></div>
  <div id="live-reactions" style="position:absolute; right:0; bottom:0; z-index:100"></div>
</div>
```

```js
await loadScript(`https://cdnapisec.kaltura.com/p/${partnerId}/embedPlaykitJs/uiconf_id/${playerUiConfId}`);

const player = KalturaPlayer.setup({
  targetId: 'player',
  provider: { partnerId: Number(partnerId), uiConfId: Number(playerUiConfId), ks: playerKs },
});
player.loadMedia({ entryId });
```

* Use the Event Platform player uiconf ("EP All Plugins") or a Player v7 from KMC Studio with the live plugins.
* For live sessions the player shows an offline slate until the broadcast starts, then switches to live by itself.
* `loadScript` is a plain promise wrapper around a `<script>` tag (see [public/session.js](../public/session.js)).

---

## Step 7: Embed Chat & Collaboration

**Containers.** Place these wherever you like:

```html
<aside id="chat-panel" style="display:flex">
  <div id="cnc-container"></div>                 <!-- root the widget mounts into -->
  <div id="cnc-chat" style="flex:1"></div>       <!-- chat / Q&A / updates panel -->
  <div id="cnc-sidebar" style="display:flex; flex-direction:column; width:64px">
    <div id="cnc-sidebar-buttons"></div>         <!-- module buttons -->
    <div id="cnc-reactions" style="flex:1"></div><!-- emoji picker -->
    <div id="cnc-sidebar-settings"></div>        <!-- settings menu -->
  </div>
</aside>
```

**Load and render.** Load the CnC bundle **after** the player is set up (both bundles share globals):

```js
await loadScript(`https://cdnapisec.kaltura.com/p/${partnerId}/embedPlaykitJs/uiconf_id/${cncUiConfId}`);

const cncConfig = {
  server: {
    jwtToken: cncJwt,
    serviceUrl: 'https://chat.nvp1.ovp.kaltura.com/api_v3',      // region-specific
  },
  consent: {
    legalTextUrls: { en: 'https://your-site.example/legal.txt' }, // text shown in the consent dialog
    defaultSettings: { receiveNotifications: true, showFullName: true, allowChatAndCollaboration: true },
    cookieConsent: true,
  },
  reactions: reactionsUrl
    ? { mode: 'on', sourceUrl: reactionsUrl,                      // embed URL of the reactions uiconf
        endpointUrl: 'https://analytics.kaltura.com', ks: playerKs }
    : { mode: 'off' },
  ui: {
    theme: { brandColor: '#006EFA', mode: 'light', meta: { version: 2 } },
    locale: 'en',
    zIndex: 500,
    groupChat: { enabled: true, reactions: true, reply: true },
    instanceOptions: { enableChat: true, enableSearch: true, enableAssistant: false },
  },
  moderation: { moderatorUrl: 'https://www.kaltura.com/apps/kep-moderator/latest/embed.php' },
};

const cnc = KalturaEventsPlatform.collaboration.widgets.embedded.new();

cnc.addOnLoadFinished(() => {
  cnc.renderCnc(document.getElementById('cnc-chat'));
  cnc.renderSidebarButtons(document.getElementById('cnc-sidebar-buttons'));
  cnc.renderSidebarSettings(document.getElementById('cnc-sidebar-settings'));
  if (reactionsUrl) {
    cnc.renderReactions(document.getElementById('cnc-reactions'));
    cnc.renderLiveReactions(document.getElementById('live-reactions'));
  }
});
cnc.addOnClose(() => chatPanel.classList.add('collapsed'));   // user collapsed the panel
cnc.addOnOpen(() => chatPanel.classList.remove('collapsed'));

cnc.renderCncContainer(document.getElementById('cnc-container'), cncConfig);
```

The embedded API object also exposes `unmountCnc`, `unmountSidebarButtons`, `unmountSidebarSettings`,
`unmountReactions` and `unmountLiveReactions`, for single-page apps that navigate away.

**Notes**

* The CnC uiconf is **"KEP widgets – default UIconf for EP"**, *not* the reactions uiconf. Only the former
  defines `KalturaEventsPlatform.collaboration`.
* The reactions bundle is fetched by the CnC widget itself from `reactions.sourceUrl`; you don't load it.
* Collapsing: when the user closes the panel, hide `#cnc-chat` and shrink the panel to the sidebar width
  (see `.chat-panel.collapsed` in [public/styles.css](../public/styles.css)).

---

## Step 8: Content Security Policy

If your site sends a CSP, allow at least:

| Directive | Sources |
|---|---|
| `script-src` | `'self'` `https://cdnapisec.kaltura.com` `https://*.kaltura.com` |
| `connect-src` | `'self'` `https://*.kaltura.com` `wss://*.kaltura.com` |
| `style-src` | `'self'` `'unsafe-inline'` `https://*.kaltura.com` `https://fonts.googleapis.com` |
| `font-src` | `'self'` `data:` `https://*.kaltura.com` `https://fonts.gstatic.com` |
| `img-src` | `'self'` `data:` `blob:` `https:` |
| `media-src` | `'self'` `blob:` `data:` `https:` (the player probes autoplay with a `data:` video) |
| `frame-src` | `'self'` `https://*.kaltura.com` |
| `worker-src` | `'self'` `blob:` |

Start in report-only mode and watch the console during a real event. This repo's policy is built in
`buildCsp()` in [src/app.js](../src/app.js).

---

## Checklist

- [ ] Admin secret and `cncAuth` token stored as server secrets
- [ ] Admin KS user is an Event Platform team member
- [ ] Attendee's EP user ID used as the KS user and the JWT `uid`
- [ ] Registration and status checked at sign-in; moderators get `<entryId>_moderators`
- [ ] Player KS is USER type with `PLAYBACK_BASE_ROLE`, scoped entitlement, `virtualeventid`
- [ ] Token endpoint authenticated and `no-store`
- [ ] Player bundle loaded and set up before the CnC bundle
- [ ] Correct uiconfs (player / CnC / reactions)
- [ ] Region-specific Events API and chat service URLs
- [ ] CSP allows Kaltura hosts
