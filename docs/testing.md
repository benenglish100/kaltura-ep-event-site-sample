# Testing

> [!NOTE]
> Unofficial sample code, not created or supported by Kaltura. No warranty, not production ready.
> See the [disclaimer](../README.md#disclaimer).

| Command | What it runs | Needs Kaltura? |
|---|---|---|
| `npm test` | Unit, HTTP integration and setup-wizard tests (Node test runner) | No (mock backend) |
| `npm run test:e2e` | Playwright browser tests, desktop + mobile | No (mock backend) |
| `npm run check` | Live verification of your `.env` against your account | Yes |

## Automated tests

```bash
npm test
npx playwright install chromium   # first time only
npm run test:e2e
```

### The mock Kaltura backend

[test/mock-kaltura.js](../test/mock-kaltura.js) is a small HTTP server that impersonates:

* **Kaltura API v3**: `user.loginByLoginId`, `appToken.list/add`, `uiConf.list`, `session.get`
* **Events Platform API**: `events/list` (including the 15-per-page limit), `sessions/list`, `event-users/list`
* **The CDN**: `embedPlaykitJs` bundles, served as **stubs** that define `KalturaPlayer` and
  `KalturaEventsPlatform` and record every call the page makes

It validates credentials the way Kaltura does: every KS is decrypted with the admin secret and checked for
partner, type, user and expiry. Requests without a valid team-member admin KS are rejected.

### What's covered

**Unit** ([test/unit.test.js](../test/unit.test.js)): KS generation/parsing, tamper detection, CnC JWT
signature and claims, `cncAuth` token resolution, password hashing, session selection, config validation,
`.env` override detection.

**Integration** ([test/app.test.js](../test/app.test.js)), the real server against the mock:
security headers and CSP; redirects and 401s; wrong password; valid Kaltura user who isn't registered;
blocked user; CSRF (non-JSON and cross-origin); full attendee flow with KS privileges and JWT claims
checked; nothing secret in responses; session selection by ID, type and visibility; moderator group;
admin KS used for the Events API; logout; forged cookie; upstream outage → 502; rate limiting;
`AUTH_MODE=local`.

**Setup wizard** ([test/setup.test.js](../test/setup.test.js)): runs `scripts/setup.js` with piped answers:
event selection, uiconf discovery, `cncAuth` token creation, the `.env` produced is valid config; bad
credentials.

**Browser** ([test/e2e/journey.spec.js](../test/e2e/journey.spec.js)) with the CSP **enforced**: branding,
sign-in errors, player set up with the KS and entry, CnC rendered into the right containers, no iframes,
player before CnC, collapse/expand, session switching, unsupported session type, unregistered user,
sign-out. Any CSP violation fails the test.

### What the automated tests can't cover

The stubs prove the page drives the Kaltura APIs correctly, but not the real player and CnC bundles.
That's what `npm run check` and the manual test below are for.

## Live configuration check

```bash
npm run check
npm run check -- --user attendee@example.com
```

Verifies admin secret, Events API access (team member), event, sessions, `cncAuth` token, and that each
uiconf really is the expected bundle. Wrong uiconfs come with suggestions.

## Manual test plan (real event)

| # | Step | Expected |
|---|---|---|
| 1 | `npm run check` | All checks pass |
| 2 | Open `/`, sign in with a wrong password | "Incorrect username or password." |
| 3 | Sign in as an unregistered email (local mode: add them with `add-user` first) | "You are not registered for this event." |
| 4 | Sign in as an attendee | Session page; player shows offline slate / stream; CnC consent dialog |
| 5 | Accept consent | Updates, Live stage, Private chat, reactions |
| 6 | Start the broadcast | Player goes live without a reload |
| 7 | Post a chat message and a question | Visible to others; question visible to moderators |
| 8 | Sign in as a Moderator (private window) | Moderator capabilities in CnC |
| 9 | Send reactions | They float over the player for everyone |
| 10 | Collapse the chat panel, then reopen it | Layout follows |
| 11 | Phone or narrow window | Chat stacks under the player |
| 12 | Browser console | No errors; note any CSP report-only warnings |
| 13 | Sign out, open `/session` | Back to sign-in |

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) runs `npm test` and the Playwright suite on every
push and pull request. It needs no Kaltura credentials.
