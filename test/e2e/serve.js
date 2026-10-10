// Starts the mock Kaltura backend and the site wired to it, for Playwright.
import { startMockKaltura } from '../mock-kaltura.js';
import { loadConfig } from '../../src/config.js';
import { createApp } from '../../src/app.js';

const mock = await startMockKaltura({ port: 4011 });
const config = loadConfig({ ...mock.env, CSP_ENFORCE: 'true', AUTH_MODE: 'kaltura', SITE_TITLE: 'Acme Events', BRAND_COLOR: '#C2185B', PORT: '4010', LOGIN_RATE_LIMIT: '1000' });
createApp({ config }).listen(config.port, '127.0.0.1', () => {
  console.log(`e2e site on http://127.0.0.1:${config.port} (mock Kaltura ${mock.base})`);
});
