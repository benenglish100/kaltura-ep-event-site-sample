import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { findEnvOverrides } from './lib/env-overrides.js';

const overridden = findEnvOverrides();
if (overridden.length) {
  console.warn(`Warning: these environment variables differ from .env and take precedence: ${overridden.join(', ')}`);
  console.warn('  If you edited .env, open a new terminal (or unset them) so the new values apply.\n');
}

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error(e.message);
  console.error('\nRun "npm run setup" to create .env, or copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = createApp({ config });
const server = app.listen(config.port, () => {
  console.log(`Event site sample listening on http://localhost:${config.port}`);
  console.log('  Unofficial sample code, not supported by Kaltura, not production ready.');
  console.log(`  partner ${config.kaltura.partnerId}, event ${config.kaltura.eventId}, auth mode "${config.auth.mode}"`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
