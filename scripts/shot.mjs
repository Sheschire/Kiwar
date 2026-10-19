// Screenshot helper for visual checks (uses the preinstalled Playwright + Chromium).
//   node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [mobile]
//   ACTIONS=./my-actions.mjs node scripts/shot.mjs …   (default export: async (page) => {})
// In dev builds the page exposes window.__kiwar = { controller, renderer, uiStore, actions }.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    // Global install of the cloud containers.
    return import('/opt/node22/lib/node_modules/playwright/index.mjs');
  }
}

const { chromium } = await loadPlaywright();
const [url, out, w = '1280', h = '800', wait = '2500', mobile = ''] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [width] [height] [waitMs] [mobile]');
  process.exit(1);
}
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: 1,
  isMobile: !!mobile,
  hasTouch: !!mobile,
});
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(+wait);
if (process.env.ACTIONS) {
  const fn = (await import(pathToFileURL(resolve(process.env.ACTIONS)).href)).default;
  await fn(page);
}
await page.screenshot({ path: out });
console.log(logs.filter((l) => !l.includes('GPU stall') && !l.includes('[vite]')).join('\n'));
await browser.close();
