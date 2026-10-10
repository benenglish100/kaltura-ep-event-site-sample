# Troubleshooting

Start with **`npm run check`**. It pinpoints most configuration problems. For sign-in problems, read the
server terminal: every failed sign-in is logged with its reason.

- [Setup and configuration](#setup-and-configuration)
- [Sign-in](#sign-in)
- [Session page](#session-page)
- [Local development](#local-development)

---

## Setup and configuration

### `npm run check` step 1 fails (admin secret)
Wrong partner ID or admin secret, or the wrong region. Copy both from KMC → Settings → Integration
Settings; check `KALTURA_REGION`.

### `npm run check` step 2 fails with HTTP 401/403
`KALTURA_ADMIN_USER_ID` isn't an Event Platform **team member** with the Admin or Organizer role. Add
the user under Event Platform → Team, or use one that is.

### `Events API events/list failed: HTTP 400 pager.limit must not be greater than 15`
`events/list` returns at most 15 per page. This repo handles it; if you write your own client, page through
results (`pager.offset` is a page index).

### "No playable (LiveWebcast/SimuLive) session found"
Add a Live Webcast or Simulive session to the event, or pin one with `KALTURA_SESSION_ID`.

### Step 4 fails: "Expected exactly one active app token with sessionPrivileges cncAuth:true, found 0"
The account has no CnC signing token. Run `npm run setup` (it offers to create one), or create it with
`appToken.add` ([kaltura-setup.md](kaltura-setup.md#9-cncauth-app-token)). If it finds **more than one**,
set `KALTURA_CNC_APP_TOKEN` explicitly or deactivate the extras.

### Step 5/6/7 fails: "does not look like the … bundle"
A uiconf ID is wrong. The check lists the right candidates on your account. Copy the suggested ID.

---

## Sign-in

### "Incorrect username or password" for an invited attendee
Look at the server log line:

| Logged reason | Meaning / fix |
|---|---|
| `kaltura:USER_WRONG_PASSWORD`, `kaltura:LOGIN_DATA_NOT_FOUND`, … with `auth mode kaltura` | The user has no Kaltura password (EP invitations don't create one). Use `AUTH_MODE=local` and `npm run add-user`. |
| `local:unknown_user` | Not in `users.json`. Run `npm run add-user -- <email>`. |
| `local:wrong_password` | Wrong password. Reset with `npm run add-user -- <email>`. |

If the log says `auth mode kaltura` but `.env` says `local`, see
[server ignores changes to `.env`](#server-ignores-changes-to-env).

### "You are not registered for this event"
Logged as `not_in_event` or `status:<status>`. The email isn't in the event's user list, or the user is
blocked/declined. Check Event Platform → event → Users. `npm run check -- --user <email>` shows what the
API returns.

### "Too many sign-in attempts"
The per-IP rate limit (`LOGIN_RATE_LIMIT`, default 10 per 15 minutes) was hit. Wait, or raise it for
testing. Behind a proxy, set `TRUST_PROXY=true`; otherwise all users share the proxy's IP.

### Signed out unexpectedly
The session expired (`SESSION_TTL_HOURS`), `SESSION_SECRET` changed, or, over plain HTTP with
`NODE_ENV=production`, the browser dropped the `Secure` cookie. Use HTTPS in production.

---

## Session page

### "Chat failed to load"; console: `Cannot read properties of undefined (reading 'widgets')`
`KALTURA_CNC_UICONF_ID` is the **reactions** uiconf. Use **"KEP widgets – default UIconf for EP"**.
`npm run check` detects this and suggests the right ID.

### Chat loads but shows an error or never connects
* The `cncAuth` token is wrong or was deleted. Re-run `npm run setup` or `npm run check`.
* Chat & Collaboration isn't enabled for the account. Contact your Kaltura account team.
* Wrong region: `KALTURA_CHAT_SERVICE_URL` must match the account's data center.

### Player: "Media stream error" in automated browsers
Playwright's bundled Chromium can't decode H.264. Use real Chrome (`channel: 'chrome'`) for manual or
screenshot automation. Real users aren't affected.

### Player shows a slate / "not live"
Normal before the broadcast starts. The player switches to live by itself when the stream begins.

### "This session type is not supported"
The selected session is an interactive room (`LiveKME`, `MeetingEntry`, `VirtualLearningRoom`). This
example only renders webcast-style sessions.

### No emoji reactions
`CNC_REACTIONS_SOURCE_URL` is empty. Set it to the embed URL of the reactions uiconf (or re-run `npm run setup`).

### Console: `[Report Only] Refused to load …`
The CSP is in report-only mode and a resource came from a host it doesn't list. Nothing was blocked. Add
the host in `buildCsp()` before setting `CSP_ENFORCE=true` ([deployment.md](deployment.md#content-security-policy)).

### Content restricted / entitlement errors in the player
The player KS lifts category entitlements for the session entry only. If the player needs other restricted
entries, extend the KS privileges in `src/app.js` ([integration-guide.md](integration-guide.md#step-4-issue-the-player-ks)).

---

## Local development

### Server ignores changes to `.env`
Variables already set in the terminal take precedence over `.env` (Node's `--env-file` never overrides
them). A common cause is an editor extension that loads `.env` into new terminals, such as VS Code's
`python.terminal.useEnvFile`. That loads the values once, so later edits are ignored. The server prints a
warning listing such variables at startup. Fix: open a new terminal, unset the variables, or turn that
setting off.

### PowerShell: "running scripts is disabled on this system"
Use `npm.cmd` instead of `npm`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

### Port already in use
Another instance is running, or set `PORT` to a free port.
