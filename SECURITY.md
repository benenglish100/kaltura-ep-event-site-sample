# Security

This is **unofficial sample code**. It's not created or supported by Kaltura, comes with no warranty, and
is **not production ready**. Don't use it as-is for real events or real attendee data. See the
[disclaimer](README.md#disclaimer) and the [known gaps](docs/deployment.md#known-gaps).

## Reporting a problem in this sample

If you find a security problem **in this sample's code**, please don't open a public issue. Use GitHub's
**"Report a vulnerability"** (Security tab → Advisories) on this repository. Reports are handled on a
best-effort basis only; there's no guaranteed response or fix.

**Vulnerabilities in Kaltura's products or services** (the Kaltura API, Event Platform, player, Chat &
Collaboration, …) should be reported **to Kaltura** through its official channels, not here.

## If you experiment with this sample

* Use a test Kaltura account or test event, and test attendees, not real ones.
* Keep `KALTURA_ADMIN_SECRET`, `KALTURA_CNC_APP_TOKEN` and `SESSION_SECRET` out of source control.
  `.env` and `users.json` are git-ignored; keep it that way.
* If an admin secret is ever exposed, rotate it in KMC immediately.
* Read [docs/architecture.md#security-model](docs/architecture.md#security-model) to understand what the
  sample does, and doesn't do, to protect credentials.
