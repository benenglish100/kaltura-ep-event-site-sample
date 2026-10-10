# Deployment

> [!NOTE]
> Unofficial sample code, not created or supported by Kaltura. No warranty, not production ready.
> See the [disclaimer](../README.md#disclaimer).

**This sample is not production ready.** This page explains how to run it somewhere other than your laptop
(e.g. a shared test environment or a demo), and lists the gaps you'd need to close if you build something
real based on it. It is not a guide to running real events on this code.

- [Known gaps](#known-gaps)
- [If you take the concepts further](#if-you-take-the-concepts-further)
- [Run with Node](#run-with-node)
- [Run with Docker](#run-with-docker)
- [Behind a reverse proxy](#behind-a-reverse-proxy)
- [Scaling](#scaling)
- [Content Security Policy](#content-security-policy)
- [Secrets](#secrets)

---

## Known gaps

The sample is deliberately simple. Among other things, it does **not** have:

* **Real identity management.** The two sign-in modes are demonstrations. `users.json` isn't a user
  database: no password policy, reset flow, MFA, lockout or account management.
* **A security review.** No penetration test, threat model or third-party audit has been done.
* **Load or resilience testing.** Behaviour under many concurrent attendees, or when Kaltura APIs are slow
  or failing, hasn't been tested beyond basic error handling.
* **Shared state for multiple instances.** Caches and the login rate limiter are in memory, per process.
* **Operational tooling.** No structured logging, metrics, tracing, alerting or audit trail.
* **Accessibility, localization and browser-support work.** The pages haven't been audited for accessibility
  (WCAG), and they're English only.
* **Privacy and compliance work.** No cookie banner, privacy notice or data-retention handling; the consent
  text in `public/legal.txt` is a placeholder.
* **Coverage of all session types.** Only webcast-style sessions are handled. Interactive rooms aren't.
* **Kaltura support.** It relies on behaviour observed on one account that may change
  ([references.md](references.md#observed-behaviour-not-in-the-documentation)).

## If you take the concepts further

A starting point (not exhaustive) for anything beyond a demo:

- [ ] Served over **HTTPS**
- [ ] `NODE_ENV=production` (secure cookies, asset caching)
- [ ] `TRUST_PROXY=true` if behind a proxy/load balancer
- [ ] Long random `SESSION_SECRET` (≥ 32 chars), stored as a secret
- [ ] `KALTURA_ADMIN_SECRET` and `KALTURA_CNC_APP_TOKEN` stored as secrets, not in images or repos
- [ ] `KS_EXPIRY_HOURS` longer than your longest session
- [ ] `npm run check` passes with the production configuration
- [ ] A real-event test done ([testing.md](testing.md#manual-test-plan-real-event)) with no CSP warnings, then `CSP_ENFORCE=true`
- [ ] Your own sign-in in place of the sample modes, or `users.json` provisioned ([customization.md](customization.md#plug-in-your-own-sign-in))
- [ ] Consent text in `public/legal.txt` replaced with your organization's
- [ ] Monitoring on `GET /healthz`; logs collected (sign-in failures and upstream errors are logged)

## Run with Node

```bash
npm ci --omit=dev
NODE_ENV=production node src/server.js     # env vars from your platform
# or, with a .env file:
NODE_ENV=production npm start
```

Node 22.9+. The process handles `SIGTERM`/`SIGINT` gracefully.

## Run with Docker

```bash
docker build -t event-site .
docker run -d -p 3000:3000 --env-file .env -e NODE_ENV=production \
  -v "$PWD/users.json:/app/users.json:ro" \
  event-site
```

* The image (see [Dockerfile](../Dockerfile)) runs as the non-root `node` user, contains no secrets
  (`.dockerignore` excludes `.env` and `users.json`), and has a `HEALTHCHECK` on `/healthz`.
* For `AUTH_MODE=local`, mount `users.json` (as above) or point `USERS_FILE` at a mounted path.
* You can run the tools inside the container too: `docker run --rm -it --env-file .env event-site node scripts/check-kaltura.js`.

The same image runs on any container platform (Azure App Service / Container Apps, AWS ECS / App Runner,
Google Cloud Run, Kubernetes, …). Set the environment variables there and expose port 3000.

## Behind a reverse proxy

Terminate TLS at the proxy and forward to the app:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Set `TRUST_PROXY=true` so the app sees the client IP (for rate limiting) and HTTPS (for secure cookies
and the same-origin check).

## Scaling

* **Stateless sessions:** the session lives in a signed cookie, so any instance can serve any request. No sticky sessions needed.
* **Per-instance state:** the event/session cache, the `cncAuth` token cache and the login rate limiter
  live in memory per instance. That's fine for most events. For a global rate limit, give
  `express-rate-limit` a shared store (e.g. Redis).
* **Kaltura load:** page loads generate KS/JWT locally. The only Kaltura API calls are cached Events API
  reads plus one `event-users/list` per sign-in. Video and chat traffic go directly from browsers to Kaltura.
* **`users.json`** (local mode) is read on each sign-in. With several instances, share it via a mounted
  volume, or better, use your own identity provider.

## Content Security Policy

The app sends a CSP built in `buildCsp()` ([src/app.js](../src/app.js)) that allows the configured
Kaltura hosts and `*.kaltura.com`. By default it's **report-only** (`CSP_ENFORCE=false`): violations show
in the browser console but nothing is blocked.

1. Run a real event with the console open (player, chat, Q&A, polls, reactions, moderator view).
2. If you see `[Report Only] Refused to …` messages, add the reported source to the matching directive in `buildCsp()`.
3. When the console is clean, set `CSP_ENFORCE=true`.

The Playwright suite runs with the CSP enforced.

## Secrets

| Secret | Where it's used | Rotation |
|---|---|---|
| `KALTURA_ADMIN_SECRET` | KS generation | Rotate in KMC; update the env var; restart |
| `KALTURA_CNC_APP_TOKEN` | CnC JWT signing | Create a new `cncAuth:true` app token, update, restart, then delete the old one |
| `SESSION_SECRET` | Cookie signing | Change and restart (signs everyone out) |

None of them are ever sent to browsers. The integration tests assert this.
