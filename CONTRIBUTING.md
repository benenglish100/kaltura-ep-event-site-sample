# Contributing

This is an **unofficial sample**, not a Kaltura product, and it's maintained on a **best-effort basis**:
issues and pull requests may be reviewed slowly or not at all, and there's no support. See the
[disclaimer](README.md#disclaimer).

Contributions that make the integration concepts **clearer** are the most welcome: better explanations,
simpler code, corrections where Kaltura's behaviour differs from what's described. The goal is to stay a
small, readable sample, not to grow into a full product.

## Development

```bash
npm install
npx playwright install chromium   # once, for browser tests
npm test                          # unit + integration + setup wizard (no Kaltura account needed)
npm run test:e2e                  # browser tests (no Kaltura account needed)
npm run dev                       # run the site with auto-restart (needs .env, see docs/getting-started.md)
```

## Guidelines

* Keep it simple: readable code, few dependencies, no build step.
* Match the existing style (ES modules, 2-space indent, single quotes). `.editorconfig` sets the basics.
* Add or update tests for behaviour changes. New Kaltura API calls should be added to the mock in
  `test/mock-kaltura.js`, enforcing the same rules as the real API where practical.
* Update the docs in `docs/` when behaviour or configuration changes, and cite the Kaltura source in
  [docs/references.md](docs/references.md), or list it as observed behaviour if it's undocumented.
* **Never commit secrets or real data**: `.env`, `users.json`, real partner or event IDs, or screenshots
  that show private content.

## Pull requests

Describe what changed and why, and how you tested it. CI must pass.
