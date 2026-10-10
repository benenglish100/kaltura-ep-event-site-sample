# Kaltura setup

> [!NOTE]
> Unofficial sample code, not created or supported by Kaltura. No warranty, not production ready.
> See the [disclaimer](../README.md#disclaimer).

What the site needs from your Kaltura account, why, and where to find each value.
`npm run setup` finds most of these for you; this page explains what it's doing. Each section cites its
sources; see also [references.md](references.md).

| # | Item | Used for | Env var |
|---|---|---|---|
| 1 | Partner ID | Everything | `KALTURA_PARTNER_ID` |
| 2 | Admin secret | Generating KSs on the server | `KALTURA_ADMIN_SECRET` |
| 3 | Event Platform team member | Calling the Events Platform API | `KALTURA_ADMIN_USER_ID` |
| 4 | Event and sessions | What attendees see | `KALTURA_EVENT_ID`, `KALTURA_SESSION_ID` |
| 5 | Registered attendees | Who may sign in | (Event Platform) |
| 6 | Player uiconf | The webcast player | `KALTURA_PLAYER_UICONF_ID` |
| 7 | CnC uiconf | Chat & Collaboration widgets | `KALTURA_CNC_UICONF_ID` |
| 8 | Reactions uiconf (optional) | Emoji reactions | `CNC_REACTIONS_SOURCE_URL` |
| 9 | `cncAuth` app token | Signing CnC JWTs | `KALTURA_CNC_APP_TOKEN` |
| 10 | Region | Which Kaltura data center | `KALTURA_REGION` |

---

## 1. Partner ID

KMC → **Settings → Integration Settings** → *Partner ID*. A number such as `1234567`.

## 2. Admin secret

Same page → *Administrator Secret*.

The server uses it to **generate Kaltura Sessions (KS) locally**: a short-lived admin KS for its own API
calls, and a playback-only user KS for each attendee. It is never sent to the browser.

> Treat it like a root password. Keep it in `.env` or your secret manager. If it leaks, rotate it in KMC.

> **Sources:** [Authentication and Security](https://developer.kaltura.com/api-docs/VPaaS-API-Getting-Started/Kaltura_API_Authentication_and_Security.html) ("A KS should always be generated on the server side")

## 3. Event Platform team member (admin user)

The Events Platform API only accepts KSs whose user is an Event Platform **team member** with the
**Admin** or **Organizer** role. Pick (or create) such a user under **Event Platform → Team** and use its
Kaltura user ID, usually an email address.

Symptom if wrong: `npm run check` step 2 fails with HTTP 401/403.

> **Sources:** [Events Platform API guide](https://kaltura.md/KALTURA_EVENTS_PLATFORM_API/) · team member roles in the [OpenAPI spec](https://github.com/kaltura/mcp-events/blob/main/openapi-public-api.yaml)

## 4. Event and sessions

* **Event ID**: the numeric ID shown in the Event Platform URL when the event is open
  (`…/events/4567890/…`), or pick it in `npm run setup`.
* **Sessions**: the site renders sessions of type **LiveWebcast** and **SimuLive**. A session's ID is its
  Kaltura **entry ID** (e.g. `1_abcd1234`); this is what the player loads and what CnC uses as its
  context.
* `KALTURA_SESSION_ID` is optional. Without it, the site shows the live-now or next upcoming webcast
  session and offers a switcher. Sessions with **private** visibility are hidden unless pinned.

> **Sources:** [OpenAPI spec](https://github.com/kaltura/mcp-events/blob/main/openapi-public-api.yaml) (`sessions/list`, `PublicSessionDto`)

## 5. Registered attendees

Invite attendees to the event in Event Platform (or let them register). The site looks each person up
by email with the Events API (`event-users/list`) at sign-in:

* not found → *"You are not registered for this event"*
* status containing *blocked / declined / cancelled / removed / rejected / denied* → refused
* any other status (e.g. *Invited*, *Registered*, *Confirmed*, *Participated*) → admitted
* role **Moderator** → CnC moderator

Turn this check off with `REQUIRE_EVENT_REGISTRATION=false` (not recommended).

> **Passwords:** Event Platform invitations don't create a password. That's why the default sign-in
> mode is `local` (site-managed passwords); see [getting-started.md](getting-started.md#5-give-attendees-access).

> **Sources:** [OpenAPI spec](https://github.com/kaltura/mcp-events/blob/main/openapi-public-api.yaml) (`event-users/list`, `PublicEventUserDto`). The blocked-status rule is this example's own policy; the API documents statuses only as "Invited, Registered, Confirmed, etc."

## 6–8. Uiconfs (player, CnC, reactions)

A *uiconf* is a stored configuration from which Kaltura's CDN serves a JavaScript bundle:

```
https://cdnapisec.kaltura.com/p/<partnerId>/embedPlaykitJs/uiconf_id/<uiConfId>
```

Event Platform **auto-provisions** these on EP-enabled accounts:

| Component | Typical name | Tags | Exposes |
|---|---|---|---|
| Player | **EP All Plugins (Do Not Delete)** | `kalturaPlayerJs,player,ovp` | `window.KalturaPlayer` |
| CnC | **KEP widgets - default UIconf for EP - latest (Do Not Delete)** | `kep-collaboration-widgets_latest` | `window.KalturaEventsPlatform.collaboration` |
| Reactions | **KEP reactions widgets latest (Do Not Delete)** | `kep_reactions_widgets` | `window.KalturaEventsPlatform.widgets.reactions` |

Accounts that also have a MediaSpace events site may have *"MediaSpace Default C&C Widget Player"* and
*"C&C Reactions Player"* copies. These work too.

You can list them yourself with the API (admin KS): `uiConf.list`, or see KMC → Studio for players.

> **Common mistake:** using the **reactions** uiconf as the CnC uiconf. Both bundles define
> `KalturaEventsPlatform`, but only the CnC one has `collaboration`. The page then fails with
> *"Cannot read properties of undefined (reading 'widgets')"*. `npm run check` detects this.

`CNC_REACTIONS_SOURCE_URL` takes the **full embed URL** of the reactions uiconf (not just the ID), because
the CnC widget loads it itself when reactions are enabled. Leave it empty to turn reactions off.

You can also use your own player built in KMC → Studio (Player v7). Make sure it includes the plugins a
webcast needs (live, and dual-screen/slides if you use them). The EP-provisioned player already does.

> **Sources:** `embedPlaykitJs` URLs from the reference app's [entry-view/app.js](https://github.com/kaltura/integrated-events-demo/blob/main/public/pages/entry-view/app.js) · [uiConf.list](https://developer.kaltura.com/api-docs/service/uiConf/action/list). Uiconf names and tags were observed on an EP account ([references.md](references.md#observed-behaviour-not-in-the-documentation)).

## 9. `cncAuth` app token

Chat & Collaboration authenticates attendees with a JWT that **your server** signs. The signing key is
the `token` value of an **app token** whose `sessionPrivileges` is exactly `cncAuth:true`, and the JWT
header carries the partner ID as `kid`. This is the scheme used by Kaltura's reference app
([BEST_PRACTICES.md](https://github.com/kaltura/integrated-events-demo/blob/main/BEST_PRACTICES.md),
[cnc.model.ts](https://github.com/kaltura/integrated-events-demo/blob/main/lib/kaltura-integration/cnc.model.ts)).
Presumably the CnC service uses `kid` to find your partner's token and verify the signature; Kaltura doesn't
document the server side.

* Find it: `appToken.list` (admin KS), filter on `sessionPrivileges == "cncAuth:true"`.
* Create it (one-time) if missing; `npm run setup` offers to do this:

  ```bash
  curl -X POST https://www.kaltura.com/api_v3/service/appToken/action/add \
    -d format=1 -d ks=<ADMIN_KS> \
    -d "appToken[objectType]=KalturaAppToken" \
    -d "appToken[sessionPrivileges]=cncAuth:true" \
    -d "appToken[hashType]=SHA256" \
    -d "appToken[description]=Chat & Collaboration JWT signing"
  ```

* Put its `token` in `KALTURA_CNC_APP_TOKEN`. If you leave it empty, the server looks it up with
  `appToken.list` on first use and caches it; this requires exactly one such token.

> Keep exactly one active `cncAuth:true` token per account to avoid ambiguity.

> **Sources:** [BEST_PRACTICES.md](https://github.com/kaltura/integrated-events-demo/blob/main/BEST_PRACTICES.md) · [cnc.model.ts](https://github.com/kaltura/integrated-events-demo/blob/main/lib/kaltura-integration/cnc.model.ts) · [appToken.add](https://developer.kaltura.com/api-docs/service/appToken/action/add) · [Application tokens](https://developer.kaltura.com/api-docs/VPaaS-API-Getting-Started/application-tokens.html)

## 10. Region

| `KALTURA_REGION` | Kaltura API | Events API | Chat service | CDN |
|---|---|---|---|---|
| `NVP` (default) | `https://www.kaltura.com` | `https://events-api.nvp1.ovp.kaltura.com/api/v1` | `https://chat.nvp1.ovp.kaltura.com/api_v3` | `https://cdnapisec.kaltura.com` |
| `EU` | `https://api.irp2.ovp.kaltura.com` | `https://events-api.irp2.ovp.kaltura.com/api/v1` | `https://chat.irp2.ovp.kaltura.com/api_v3` | `https://cdnapisec.irp2.ovp.kaltura.com` |
| `DE` | `https://api.frp2.ovp.kaltura.com` | `https://events-api.frp2.ovp.kaltura.com/api/v1` | `https://chat.frp2.ovp.kaltura.com/api_v3` | `https://cdnapisec.frp2.ovp.kaltura.com` |

The NVP values and the EU/DE Events API URLs come from Kaltura's documentation. The other EU/DE hosts
follow the same naming pattern but haven't been verified by this project; confirm them with your Kaltura
account team and override any of them with `KALTURA_SERVICE_URL`, `KALTURA_EVENTS_API_URL`,
`KALTURA_CHAT_SERVICE_URL`, `KALTURA_CDN_URL`.

> **Sources:** Events API servers in the [OpenAPI spec](https://github.com/kaltura/mcp-events/blob/main/openapi-public-api.yaml) · [Events Platform API guide](https://kaltura.md/KALTURA_EVENTS_PLATFORM_API/) · NVP chat URL from the reference app's [entry-view/app.js](https://github.com/kaltura/integrated-events-demo/blob/main/public/pages/entry-view/app.js)
