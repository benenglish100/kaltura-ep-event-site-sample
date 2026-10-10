# References and sources

> [!NOTE]
> Unofficial sample code, not created or supported by Kaltura. No warranty, not production ready.
> See the [disclaimer](../README.md#disclaimer).

This page lists the Kaltura documentation, repositories and APIs this example is based on, and which
part of the app each one informed, so you can go back to the source when you build your own integration.

It also lists what was **established by testing against a live account** rather than taken from
documentation. Treat those points as observations that may change, and re-verify them on your account
(`npm run check` covers several).

- [Primary sources](#primary-sources)
- [Kaltura API reference pages used](#kaltura-api-reference-pages-used)
- [Where each part of the app comes from](#where-each-part-of-the-app-comes-from)
- [Observed behaviour (not in the documentation)](#observed-behaviour-not-in-the-documentation)
- [Further reading](#further-reading)

---

## Primary sources

| Source | Publisher | What it provided |
|---|---|---|
| [kaltura/integrated-events-demo](https://github.com/kaltura/integrated-events-demo) | Kaltura (GitHub) | **The reference integration** for embedding CnC and the player in a custom site: CnC JWT claims and signing, `cncAuth` app token, player KS privileges, local KS generation, the CnC embedded API calls and config object, the moderator-group convention, caching guidance |
| ↳ [BEST_PRACTICES.md](https://github.com/kaltura/integrated-events-demo/blob/main/BEST_PRACTICES.md) | | Dependencies (virtual event, user, `cncAuth` app token, moderator group), caching strategy, local KS generation, KS/JWT expiry guidance |
| ↳ [DOCUMENTATION.md](https://github.com/kaltura/integrated-events-demo/blob/main/DOCUMENTATION.md) | | Overall client/server flow; CnC authentication flow (app token → JWT) |
| ↳ [lib/kaltura-integration/cnc.model.ts](https://github.com/kaltura/integrated-events-demo/blob/main/lib/kaltura-integration/cnc.model.ts) | | CnC JWT payload (`partnerId`, `uid`, `contextId`, `groups`, `isAdmin`, `isScopedUser`, `virtualEventId`, `exp`), HS256 with `kid` = partner ID, `appToken.list` filtered on `cncAuth:true` |
| ↳ [lib/kaltura-integration/ks-utils/generate-ks.ts](https://github.com/kaltura/integrated-events-demo/blob/main/lib/kaltura-integration/ks-utils/generate-ks.ts) | | KS v2 generation algorithm |
| ↳ [lib/kaltura-integration/kaltura-client-wrapper.ts](https://github.com/kaltura/integrated-events-demo/blob/main/lib/kaltura-integration/kaltura-client-wrapper.ts) | | Player KS: USER type with `setrole:PLAYBACK_BASE_ROLE` |
| ↳ [lib/kaltura-integration/kaltura-user.model.ts](https://github.com/kaltura/integrated-events-demo/blob/main/lib/kaltura-integration/kaltura-user.model.ts) | | Player KS privileges `disableentitlement` and `virtualeventid` |
| ↳ [public/pages/entry-view/app.js](https://github.com/kaltura/integrated-events-demo/blob/main/public/pages/entry-view/app.js) | | `embedPlaykitJs` bundle URLs, `KalturaPlayer.setup` / `loadMedia`, `KalturaEventsPlatform.collaboration.widgets.embedded` API (`renderCncContainer`, `renderCnc`, `renderSidebarButtons`, `renderSidebarSettings`, `renderReactions`, `renderLiveReactions`, `addOnLoadFinished/Open/Close`), CnC config object (consent, server, reactions, ui, moderation), chat service URL |
| ↳ [public/pages/entry-view/cnc.css](https://github.com/kaltura/integrated-events-demo/blob/main/public/pages/entry-view/cnc.css) | | Container layout for the CnC panel and sidebar, responsive stacking |
| [kaltura/mcp-events](https://github.com/kaltura/mcp-events) · [openapi-public-api.yaml](https://github.com/kaltura/mcp-events/blob/main/openapi-public-api.yaml) | Kaltura (GitHub) | **Events Platform public API**: endpoints, request/response schemas (`events/list`, `sessions/list`, `event-users/list`, `event-users/invite`, …), Bearer-KS auth, session types, regional server URLs (`nvp1`, `irp2`, `frp2`), team member roles |
| [KalturaGeneratedAPIClientsPython: Client.py](https://github.com/kaltura/KalturaGeneratedAPIClientsPython/blob/master/KalturaClient/Client.py) (`generateSessionV2`) | Kaltura (GitHub) | Independent confirmation of the KS v2 algorithm; this repo's implementation matches it |
| [Kaltura API documentation](https://developer.kaltura.com/api-docs/) | Kaltura | Kaltura API v3 services and actions (see below) |
| [Kaltura API Authentication and Security](https://developer.kaltura.com/api-docs/VPaaS-API-Getting-Started/Kaltura_API_Authentication_and_Security.html) | Kaltura | KS concepts, session types, privileges, recommendation to generate KSs server-side |
| [Application tokens](https://developer.kaltura.com/api-docs/VPaaS-API-Getting-Started/application-tokens.html) | Kaltura | App token model (`sessionPrivileges`, `hashType`) used for the `cncAuth` token |
| [kaltura/kaltura-player-js](https://github.com/kaltura/kaltura-player-js) · [configuration](https://github.com/kaltura/kaltura-player-js/blob/master/docs/configuration.md) | Kaltura (GitHub) | Player setup and configuration options |
| [Kaltura API guides on kaltura.md](https://kaltura.md/KALTURA_EVENTS_PLATFORM_API/): [Events Platform API](https://kaltura.md/KALTURA_EVENTS_PLATFORM_API/), [Chat & Collaborate](https://kaltura.md/KALTURA_CNC_API/), [Experience Components](https://kaltura.md/KALTURA_EXPERIENCE_COMPONENTS_API/) | Not stated on the site | Events API regional base URLs; the requirement that the admin KS user be an **Event Platform team member** (Admin/Organizer/ContentManager); CnC modules; that CnC and the player are the EP's embeddable components. These guides also say CnC has "no public embed API"; the reference app above is what shows how to embed it. |

## Kaltura API reference pages used

| Call | Used in this app for | Reference |
|---|---|---|
| `session.start` | Alternative to local KS generation (documented, not used) | [session.start](https://developer.kaltura.com/api-docs/service/session/action/start) |
| `session.get` | `npm run check` / setup: validate the admin KS | [session.get](https://developer.kaltura.com/api-docs/service/session/action/get) |
| `user.loginByLoginId` | `AUTH_MODE=kaltura` password check | [user.loginByLoginId](https://developer.kaltura.com/api-docs/service/user/action/loginByLoginId) |
| `appToken.list` | Find the `cncAuth:true` token | [appToken.list](https://developer.kaltura.com/api-docs/service/appToken/action/list) |
| `appToken.add` | Create the `cncAuth:true` token (setup wizard) | [appToken.add](https://developer.kaltura.com/api-docs/service/appToken/action/add) |
| `uiConf.list` | Discover the EP player / CnC / reactions uiconfs | [uiConf.list](https://developer.kaltura.com/api-docs/service/uiConf/action/list) |
| Events API `events/list`, `sessions/list`, `event-users/list` | Event, sessions, registration check | [OpenAPI spec](https://github.com/kaltura/mcp-events/blob/main/openapi-public-api.yaml) |

---

## Where each part of the app comes from

| App feature | Code | Based on |
|---|---|---|
| Local KS v2 generation | `src/kaltura/ks.js` | integrated-events-demo `generate-ks.ts`; Python client `generateSessionV2` |
| Admin KS for the Events API (team member user) | `src/kaltura/admin.js` | OpenAPI spec (Bearer KS); kaltura.md Events Platform API guide (team member requirement) |
| Player KS privileges | `src/app.js` | integrated-events-demo (`PLAYBACK_BASE_ROLE`, `virtualeventid`, `disableentitlement`). This repo narrows the last to `disableentitlementforentry` ([KS privileges](https://developer.kaltura.com/api-docs/VPaaS-API-Getting-Started/Kaltura_API_Authentication_and_Security.html)). |
| CnC JWT | `src/kaltura/cnc.js` | integrated-events-demo `cnc.model.ts`, BEST_PRACTICES.md |
| `cncAuth` token lookup / creation | `src/kaltura/cnc.js` | integrated-events-demo `cnc.model.ts` (lookup), BEST_PRACTICES.md ("created once with `appToken.add`"); appToken API docs |
| Moderators (`<entryId>_moderators` group) | `src/kaltura/cnc.js` | integrated-events-demo `cnc.model.ts`, BEST_PRACTICES.md |
| Event / sessions / registration | `src/kaltura/events-api.js` | OpenAPI spec |
| Password check against Kaltura | `src/auth/authenticate.js` | `user.loginByLoginId` docs |
| Embedding the player | `public/session.js` | integrated-events-demo `entry-view/app.js`; kaltura-player-js docs |
| Embedding CnC | `public/session.js` | integrated-events-demo `entry-view/app.js` |
| Chat panel layout | `public/styles.css` | integrated-events-demo `entry-view/cnc.css` (adapted) |
| Caching strategy, local KS for performance | `src/app.js` | BEST_PRACTICES.md |
| Region URLs | `src/config.js` | OpenAPI spec `servers`; kaltura.md; integrated-events-demo (NVP chat URL) |

---

## Observed behaviour (not in the documentation)

These were learned by testing against a live Event Platform account (October 2026, KEP widgets 7.53.0).
They aren't stated in the sources above.

| Observation | Where it matters |
|---|---|
| `events/list` rejects `pager.limit` > 15 (*"pager.limit must not be greater than 15"*); the spec describes `pager.offset` as a page index | `src/kaltura/events-api.js` |
| EP-enabled accounts are auto-provisioned with uiconfs named *"EP All Plugins"*, *"KEP widgets - default UIconf for EP - latest"* and *"KEP reactions widgets latest"* (tags `kep-collaboration-widgets_latest`, `kep_reactions_widgets`) | `src/kaltura/discover.js`, setup wizard |
| The reactions bundle also defines `window.KalturaEventsPlatform`, but without `collaboration`; using it as the CnC uiconf fails with *"Cannot read properties of undefined (reading 'widgets')"* | `npm run check`, troubleshooting |
| The CnC bundle (UMD) assigns `window.KalturaEventsPlatform` and loads the reactions bundle itself from `reactions.sourceUrl`. The embedded API also exposes `unmount*` functions. | `public/session.js`, integration guide |
| Both bundles come from `embedPlaykitJs`; loading the player first and the CnC bundle second works reliably | `public/session.js` |
| Event Platform invitations don't create a password, so `user.loginByLoginId` fails for invited attendees | Default `AUTH_MODE=local` |
| An account may have no `cncAuth:true` app token yet; creating one with `appToken.add` was enough for CnC to work | Setup wizard |
| `event-users/list` returns statuses such as *Invited* and *Participated*; roles are empty for plain attendees and `Moderator` for moderators | `src/auth/authenticate.js` |
| The player probes autoplay with a `data:` video (needs `media-src data:` in the CSP) | `buildCsp()` in `src/app.js` |
| Playwright's bundled Chromium can't play the stream (no H.264); real Chrome can | Testing, screenshots |
| EU/DE hosts for the Kaltura API, chat service and CDN follow the `irp2`/`frp2` naming pattern; only the Events API URLs are documented | `src/config.js` (overridable) |

---

## Further reading

* [docs.kaltura.com](https://docs.kaltura.com/): Kaltura documentation hub
* [Kaltura Virtual Events](https://knowledge.kaltura.com/help/kaltura-virtual-events): Knowledge Center
* [Embedding a responsive webcasting player with Q&A on external websites](https://knowledge.kaltura.com/help/embedding-a-responsive-webcasting-player-with-qa-on-external-websites): Kaltura's iframe-based alternative, and its limitations
* [Kaltura's API authentication and security](https://knowledge.kaltura.com/help/kalturas-api-authentication-and-security): Knowledge Center
