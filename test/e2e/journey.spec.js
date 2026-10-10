// Browser test of the full attendee journey with stubbed Kaltura bundles (see test/mock-kaltura.js).
import { test, expect } from '@playwright/test';

const calls = (page) => page.evaluate(() => window.__calls || []);
const callsOf = async (page, fn) => (await calls(page)).filter((c) => c.fn === fn);

test.beforeEach(async ({ page }, testInfo) => {
  testInfo.cspErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) testInfo.cspErrors.push(msg.text());
  });
});

test.afterEach(async ({}, testInfo) => {
  expect(testInfo.cspErrors, 'no CSP violations').toEqual([]);
});

async function signIn(page, username = 'jane@example.com', password = 'janepass123') {
  await page.goto('/');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('attendee signs in and gets the webcast player and CnC embedded in the page', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('#event-name')).toHaveText('Q4 All Hands');
  await expect(page.locator('#site-title')).toHaveText('Acme Events');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim())).toBe('#C2185B');

  await signIn(page, 'jane@example.com', 'wrong');
  await expect(page.locator('#login-error')).toHaveText('Incorrect username or password.');

  await signIn(page);
  await expect(page).toHaveURL(/\/session$/);
  await expect(page.locator('#session-name')).toHaveText('Main Stage');
  await expect(page.locator('#user-name')).toHaveText('Jane Doe');
  await expect(page.locator('#session-description')).toHaveText('Keynote and Q&A');

  // Player mounted in our DOM (no iframe) with the server-issued KS
  await expect(page.locator('#player .stub-player')).toBeVisible();
  const [setup] = await callsOf(page, 'player.setup');
  expect(setup.options.targetId).toBe('player');
  expect(setup.options.provider.partnerId).toBe(1234567);
  expect(setup.options.provider.uiConfId).toBe(111);
  expect(setup.options.provider.ks.length).toBeGreaterThan(50);
  expect((await callsOf(page, 'player.loadMedia'))[0].info).toEqual({ entryId: '1_main' });

  // CnC widgets rendered into our containers
  await expect(page.locator('#cnc-chat')).toHaveAttribute('data-rendered', 'cnc.renderCnc');
  const [container] = await callsOf(page, 'cnc.renderCncContainer');
  expect(container.target).toBe('cnc-container');
  expect(container.config.server.serviceUrl).toBe('http://127.0.0.1:4011/chat/api_v3');
  expect(container.config.server.jwtToken.split('.')).toHaveLength(3);
  expect(container.config.consent.legalTextUrls.en).toMatch(/\/assets\/legal\.txt$/);
  expect(container.config.reactions).toEqual({ mode: 'off' });
  expect(container.config.ui.theme.brandColor).toBe('#C2185B');
  expect((await callsOf(page, 'cnc.renderSidebarButtons'))[0].target).toBe('cnc-sidebar-buttons');
  expect((await callsOf(page, 'cnc.renderSidebarSettings'))[0].target).toBe('cnc-sidebar-settings');
  expect(await callsOf(page, 'cnc.renderReactions')).toHaveLength(0);

  // Player is set up before the CnC bundle loads (no global clobbering)
  const order = (await calls(page)).map((c) => c.fn);
  expect(order.indexOf('player.setup')).toBeLessThan(order.indexOf('cnc.renderCncContainer'));

  // No iframes anywhere on the page
  expect(await page.locator('iframe').count()).toBe(0);

  // CnC close/open callbacks drive our layout
  await page.evaluate(() => window.__epPoc.cnc.__close());
  await expect(page.locator('#chat-panel')).toHaveClass(/collapsed/);
  await page.evaluate(() => window.__epPoc.cnc.__open());
  await expect(page.locator('#chat-panel')).not.toHaveClass(/collapsed/);

  await page.screenshot({ path: testInfo.outputPath('session.png'), fullPage: true });
});

test('switching sessions reloads player and CnC for the new entry', async ({ page }) => {
  await signIn(page);
  await expect(page.locator('#session-switcher')).toBeVisible();
  await page.locator('#session-switcher').selectOption('1_sim');
  await expect(page).toHaveURL(/\/session\?id=1_sim$/);
  await expect(page.locator('#session-name')).toHaveText('Replay');
  await expect(page.locator('#player')).toHaveAttribute('data-entry-id', '1_sim');
});

test('unsupported session type shows a friendly message', async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/session$/);
  await page.goto('/session?id=1_room');
  await expect(page.locator('#page-error')).toContainText('not supported');
  await expect(page.locator('#content')).toBeHidden();
});

test('unregistered user is told so; sign out returns to the login page', async ({ page }) => {
  await signIn(page, 'stranger@example.com', 'strangerpass');
  await expect(page.locator('#login-error')).toHaveText('You are not registered for this event.');

  await signIn(page);
  await expect(page).toHaveURL(/\/session$/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/session');
  await expect(page).toHaveURL(/\/$/);
});
