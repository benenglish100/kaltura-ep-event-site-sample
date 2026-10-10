# Contributing

Thanks for helping improve this example.

## Development

```bash
npm install
npx playwright install chromium   # once, for browser tests
npm test                          # unit + integration + setup wizard (no Kaltura account needed)
npm run test:e2e                  # browser tests (no Kaltura account needed)
npm run dev                       # run the site with auto-restart (needs .env, see docs/getting-started.md)
```

## Guidelines

* Keep it an **example**: readable code, few dependencies, no build step.
* Match the existing style (ES modules, 2-space indent, single quotes). `.editorconfig` sets the basics.
* Add or update tests for behaviour changes. New Kaltura API calls should be added to the mock in
  `test/mock-kaltura.js`, enforcing the same rules as the real API where practical.
* Update the docs in `docs/` when behaviour or configuration changes.
* **Never commit secrets or customer data**: `.env`, `users.json`, partner IDs from real accounts, or
  screenshots that show private content.

## Pull requests

Describe what changed and why, and how you tested it (automated, and against a real event if relevant).
CI must pass.
