# Security

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them privately through GitHub's
**"Report a vulnerability"** (Security tab → Advisories) on this repository.

## Using this example safely

* Keep `KALTURA_ADMIN_SECRET`, `KALTURA_CNC_APP_TOKEN` and `SESSION_SECRET` server-side, in environment
  variables or a secret manager. `.env` and `users.json` are git-ignored; keep it that way.
* If an admin secret is ever exposed, rotate it in KMC immediately.
* Serve the site over HTTPS with `NODE_ENV=production`.
* Review [docs/architecture.md#security-model](docs/architecture.md#security-model) and the production
  checklist in [docs/deployment.md](docs/deployment.md) before going live.
