# Configuration

> [!NOTE]
> Unofficial sample code, not created or supported by Kaltura. No warranty, not production ready.
> See the [disclaimer](../README.md#disclaimer).

All configuration comes from environment variables. Locally they're read from **`.env`**
(`npm start` runs `node --env-file-if-exists=.env`). In production, set them in your platform's
environment or secret manager. `npm run setup` writes `.env` for you; [.env.example](../.env.example)
is the annotated template.

The server validates the configuration at startup and lists every problem before exiting.

> **Precedence:** variables already set in the process environment win over `.env`. This is Node's
> `--env-file` behaviour. The server warns at startup if any differ from `.env` (see
> [troubleshooting.md](troubleshooting.md#server-ignores-changes-to-env)).

## Kaltura account

| Variable | Required | Default | Description |
|---|---|---|---|
| `KALTURA_PARTNER_ID` | ✔ | | Partner ID (KMC → Settings → Integration Settings) |
| `KALTURA_ADMIN_SECRET` | ✔ | | Admin secret. Server-side only. |
| `KALTURA_ADMIN_USER_ID` | ✔ | | Kaltura user ID of an Event Platform team member (Admin/Organizer); used as the admin KS user |
| `KALTURA_REGION` | | `NVP` | `NVP`, `EU` or `DE`; sets the four service URLs below |
| `KALTURA_SERVICE_URL` | | per region | Kaltura API v3 base URL |
| `KALTURA_EVENTS_API_URL` | | per region | Events Platform API base URL (including `/api/v1`) |
| `KALTURA_CHAT_SERVICE_URL` | | per region | CnC service URL passed to the widget |
| `KALTURA_CDN_URL` | | per region | CDN base for `embedPlaykitJs` bundles |

## Event

| Variable | Required | Default | Description |
|---|---|---|---|
| `KALTURA_EVENT_ID` | ✔ | | Numeric Event Platform event ID |
| `KALTURA_SESSION_ID` | | (auto) | Pin a session entry ID. Empty = live-now/next LiveWebcast or SimuLive session. |

## Components

| Variable | Required | Default | Description |
|---|---|---|---|
| `KALTURA_PLAYER_UICONF_ID` | ✔ | | Player uiconf, typically "EP All Plugins" |
| `KALTURA_CNC_UICONF_ID` | ✔ | | CnC uiconf, "KEP widgets – default UIconf for EP" (not the reactions one) |
| `KALTURA_CNC_APP_TOKEN` | | (lookup) | `token` of the `cncAuth:true` app token. Empty = looked up with `appToken.list` and cached 24 h. |
| `CNC_REACTIONS_SOURCE_URL` | | (off) | Full embed URL of the reactions uiconf. Empty disables emoji reactions. |
| `CNC_THEME_MODE` | | `light` | CnC theme: `light` or `dark` |
| `CNC_ANALYTICS_URL` | | `https://analytics.kaltura.com` | Endpoint the reactions widget reports to |
| `CNC_MODERATOR_URL` | | `https://www.kaltura.com/apps/kep-moderator/latest/embed.php` | Moderator app URL used by CnC |

## Look & feel

| Variable | Default | Description |
|---|---|---|
| `SITE_TITLE` | (none) | Small title above the event name on the sign-in page |
| `BRAND_COLOR` | `#006EFA` | Hex color for site buttons/links and the CnC theme (`CNC_BRAND_COLOR` is accepted as a fallback) |

## Sign-in and sessions

| Variable | Default | Description |
|---|---|---|
| `AUTH_MODE` | `local` | `local`: passwords in `USERS_FILE` (`npm run add-user`). `kaltura`: verify with `user.loginByLoginId`. |
| `USERS_FILE` | `users.json` | Path of the local user store (relative to the working directory) |
| `REQUIRE_EVENT_REGISTRATION` | `true` | Only admit users registered (and not blocked) in the event |
| `SESSION_SECRET` | (required) | ≥ 32 characters; signs the session cookie. Changing it signs everyone out. |
| `SESSION_TTL_HOURS` | `12` | Session cookie lifetime |
| `KS_EXPIRY_HOURS` | `12` | Lifetime of the player KS and CnC JWT. Make it longer than your longest session. |
| `LOGIN_RATE_LIMIT` | `10` | Sign-in attempts per IP per 15 minutes |

## Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | | `production` turns on `Secure` cookies and static asset caching |
| `TRUST_PROXY` | `false` | `true` behind a reverse proxy/load balancer (correct client IPs and HTTPS detection) |
| `CSP_ENFORCE` | `false` | `false` = Content-Security-Policy-Report-Only; `true` = enforced |

Booleans accept `true/false`, `1/0`, `yes/no`, `on/off`.
