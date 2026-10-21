// Light contact sheet (chantier 23): one colony at the key hours of the day × the four
// seasons, in the game's own renderer, collated into one image.
//   pnpm dev --port 5173 &
//   node scripts/lightSheet.mjs <save.json> <out.png> [url=http://localhost:5173/]
// <save.json> comes from `pnpm --filter @kiwar/balance exec tsx src/perfSave.ts <save.json>`.
// Env: QUALITY (default medium), ZOOM (× the default camera distance, 0.7), HOURS (comma list of names below), SEASONS, W/H (cell size).
import { readFileSync, writeFileSync } from 'node:fs';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node22/lib/node_modules/playwright/index.mjs');
  }
}

const { chromium } = await loadPlaywright();
const [savePath, out, url = 'http://localhost:5173/'] = process.argv.slice(2);
if (!savePath || !out) {
  console.error('usage: node scripts/lightSheet.mjs <save.json> <out.png> [url]');
  process.exit(1);
}
const fixture = JSON.parse(readFileSync(savePath, 'utf8'));
const quality = process.env.QUALITY ?? 'medium';
const W = +(process.env.W ?? 480);
const H = +(process.env.H ?? 300);

// Same numbers as the shared CALENDAR (day 2 h, night 20 min, 15 in summer, 12 days a season).
const DAY_MS = 2 * 3600_000;
const SEASON_MS = 12 * DAY_MS;
const NIGHT_MS = { spring: 20, summer: 15, autumn: 20, winter: 20 };
const ALL_SEASONS = ['spring', 'summer', 'autumn', 'winter'];
/** Moments: a share of the daylight (`day`) or of the night (`night`). */
const ALL_HOURS = {
  predawn: { night: 0.85 },
  dawn: { day: 0.015 },
  morning: { day: 0.12 },
  noon: { day: 0.5 },
  afternoon: { day: 0.8 },
  dusk: { day: 0.985 },
  evening: { night: 0.12 },
  midnight: { night: 0.5 },
};
const hours = (process.env.HOURS ?? Object.keys(ALL_HOURS).join(',')).split(',');
const seasons = (process.env.SEASONS ?? ALL_SEASONS.join(',')).split(',');

function sinceDawn(season, hour) {
  const night = NIGHT_MS[season] * 60_000;
  const day = DAY_MS - night;
  const h = ALL_HOURS[hour];
  return 'day' in h ? h.day * day : day + h.night * night;
}

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
await ctx.addInitScript((f) => {
  localStorage.setItem('kiwar.save.v1', f.save);
  localStorage.setItem('kiwar.clockOffset', String(f.savedAt - Date.now()));
  localStorage.setItem('kiwar.introSeen', '1');
}, fixture);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${url}?quality=${quality}&fps=0`);
await page.waitForFunction(() => window.__kiwar?.uiStore.getState().game, null, {
  timeout: 60_000,
});
await page.addStyleTag({ content: '#ui { display: none !important; }' });
await page.evaluate(() => {
  const { renderer, controller } = window.__kiwar;
  // Frozen time and no weather: only the light changes between cells.
  controller.setTimeScale(0);
  if (renderer.weather) renderer.weather.update = () => {};
});
// A little closer than the default frame: the buildings and their shadows read better.
await page.evaluate(
  (zoom) => {
    const { renderer, controller } = window.__kiwar;
    const nest = controller.state.buildings.find((b) => b.type === 'nest');
    if (nest) renderer.focusNest();
    renderer.rig.controls.dollyTo(renderer.rig.frameDistance * zoom, false);
  },
  +(process.env.ZOOM ?? 0.7),
);
await page.waitForTimeout(3000);

const cells = [];
for (const season of seasons) {
  for (const hour of hours) {
    const offset = ALL_SEASONS.indexOf(season) * SEASON_MS + DAY_MS + sinceDawn(season, hour);
    await page.evaluate((offset) => {
      const { controller, renderer } = window.__kiwar;
      controller.state.calendarStart = controller.state.now - offset;
      controller.dispatch({ type: 'debugGrant', resources: {} });
      renderer.wake?.();
    }, offset);
    // A few frames: the shadows and the season look settle.
    await page.evaluate(
      () =>
        new Promise((res) => {
          let n = 0;
          const f = () => (++n < 4 ? requestAnimationFrame(f) : res());
          requestAnimationFrame(f);
        }),
    );
    const png = await page.locator('#scene').screenshot();
    cells.push({ season, hour, src: `data:image/png;base64,${png.toString('base64')}` });
    console.error(`${season} ${hour}`);
  }
}

const sheet = await browser.newPage({
  viewport: { width: 90 + hours.length * (W / 2 + 4), height: 40 + seasons.length * (H / 2 + 4) },
});
await sheet.setContent(`<!doctype html><style>
  body { margin: 0; font: 13px sans-serif; background: #222; color: #eee; }
  table { border-spacing: 4px; } td { padding: 0; } img { width: ${W / 2}px; display: block; }
  th { font-weight: normal; }
</style><table><tr><th></th>${hours.map((h) => `<th>${h}</th>`).join('')}</tr>
${seasons
  .map(
    (s) =>
      `<tr><th>${s}</th>${cells
        .filter((c) => c.season === s)
        .map((c) => `<td><img src="${c.src}"></td>`)
        .join('')}</tr>`,
  )
  .join('')}</table>`);
writeFileSync(out, await sheet.screenshot({ fullPage: true }));
await browser.close();
if (errors.length) console.error(errors.join('\n'));
console.error(`written ${out}`);
