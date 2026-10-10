# HTTP API

The site's own endpoints. All JSON. Errors are `{ "error": "<code>" }`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | – | Sign-in page (redirects to `/session` when signed in) |
| GET | `/session` | cookie | Session page (redirects to `/` when signed out) |
| GET | `/assets/*` | – | Static files from `public/` |
| GET | `/healthz` | – | Health check |
| GET | `/api/event` | – | Public event info for the sign-in page |
| POST | `/api/login` | – | Sign in |
| POST | `/api/logout` | – | Sign out |
| GET | `/api/session-config` | cookie | Everything the session page needs, including the KS and JWT |

State-changing requests (`POST`) must send `Content-Type: application/json`, and if an `Origin` header is
present it must match the site (CSRF protection).

---

## `GET /healthz`

`200 { "ok": true }`. Doesn't call Kaltura.

## `GET /api/event`

```json
{
  "name": "Test Event",
  "startDate": "2026-10-10T13:17:00.000Z",
  "endDate": "2026-10-10T14:17:00.000Z",
  "site": { "title": "Acme Events", "brandColor": "#006EFA" }
}
```

Cached for 5 minutes on the server.

## `POST /api/login`

Request: `{ "username": "jane@example.com", "password": "…" }`

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ "ok": true, "redirect": "/session" }` | Signed in; `ep_session` cookie set |
| 400 | `missing_credentials` | Empty or oversized fields |
| 401 | `invalid_credentials` | Unknown user or wrong password (deliberately indistinguishable) |
| 403 | `not_registered` | Not registered for the event, or blocked |
| 403 | `bad_origin` | Cross-origin request |
| 415 | `json_required` | Not JSON |
| 429 | `too_many_attempts` | Rate limit (`LOGIN_RATE_LIMIT` per IP / 15 min) |
| 502 | `upstream_error` | Kaltura unavailable |

The server logs the precise reason for each failed sign-in, e.g.
`[login] failed for "jane@example.com": local:wrong_password (auth mode local)`
(`local:unknown_user`, `kaltura:<Kaltura error code>`, `not_in_event`, `status:<EP status>`).

## `POST /api/logout`

Body `{}`. Clears the session cookie. `200 { "ok": true }`.

## `GET /api/session-config`

Query: `id` (optional), a session entry ID. Response has `Cache-Control: no-store`.

```json
{
  "site":    { "title": "", "brandColor": "#006EFA" },
  "user":    { "name": "Jane Doe", "email": "jane@example.com", "isModerator": false },
  "event":   { "id": "4567890", "name": "Test Event" },
  "session": { "id": "1_abcd1234", "name": "Keynote", "description": "", "type": "LiveWebcast",
               "startDate": "2026-10-10T17:16:00.000Z", "endDate": "2026-10-10T18:16:00.000Z" },
  "sessions": [ { "id": "1_abcd1234", "name": "Keynote", "startDate": "2026-10-10T17:16:00.000Z" } ],
  "player": {
    "scriptUrl": "https://cdnapisec.kaltura.com/p/1234567/embedPlaykitJs/uiconf_id/50001111",
    "partnerId": 1234567,
    "uiConfId": 50001111,
    "entryId": "1_abcd1234",
    "ks": "djJ8MTIzNDU2N3x…"
  },
  "cnc": {
    "scriptUrl": "https://cdnapisec.kaltura.com/p/1234567/embedPlaykitJs/uiconf_id/50002222",
    "serviceUrl": "https://chat.nvp1.ovp.kaltura.com/api_v3",
    "jwt": "eyJhbGciOiJIUzI1NiIs…",
    "ks": "djJ8MTIzNDU2N3x…",
    "legalTextUrl": "/assets/legal.txt",
    "brandColor": "#006EFA",
    "themeMode": "light",
    "reactionsSourceUrl": "https://cdnapisec.kaltura.com/p/1234567/embedPlaykitJs/uiconf_id/50003333",
    "analyticsUrl": "https://analytics.kaltura.com",
    "moderatorUrl": "https://www.kaltura.com/apps/kep-moderator/latest/embed.php"
  }
}
```

| Status | Error | Meaning |
|---|---|---|
| 401 | `not_authenticated` | No/invalid session cookie |
| 404 | `session_not_found` | Unknown or private session ID |
| 422 | `unsupported_session_type` (+ `type`) | Not a LiveWebcast/SimuLive session |
| 502 | `upstream_error` | Kaltura unavailable |

`sessions` lists the event's selectable webcast sessions (for the switcher).
