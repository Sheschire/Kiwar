// Sobriety probe (chantier 23): how much work the page does per second while the colony sits
// idle and while the camera moves. The numbers that matter for a hot laptop are the frames
// actually drawn per second (each one is GPU work) and the main thread busy time per second.
//   pnpm dev --port 5173 &
//   node scripts/sobriety.mjs <save.json> [url=http://localhost:5173/] [query=]
// <save.json> comes from `pnpm --filter @kiwar/balance exec tsx src/perfSave.ts <save.json>`.
// Headless WebGL is software: use a small window so the frame rate is not GPU-bound, and
// compare runs with each other. STUB=1 skips the WebGL calls themselves (software GL caps the
// container at a few frames per second): the loop then runs at the display rate and the
// probe measures the scheduling and the JS work per second, the GPU work being ∝ frames drawn.
import { readFileSync } from 'node:fs';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node22/lib/node_modules/playwright/index.mjs');
  }
}

const { chromium } = await loadPlaywright();
const [savePath, url = 'http://localhost:5173/', query = ''] = process.argv.slice(2);
if (!savePath) {
  console.error('usage: node scripts/sobriety.mjs <save.json> [url] [extra query]');
  process.exit(1);
}
const fixture = JSON.parse(readFileSync(savePath, 'utf8'));
const stub = process.env.STUB === '1';
const PRESETS = (process.env.PRESETS ?? 'low,medium').split(',');

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function measure(page, cdp, seconds) {
  const metrics = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  };
  const a = await metrics();
  const drawsA = await page.evaluate(() => window.__draws);
  await page.waitForTimeout(seconds * 1000);
  const b = await metrics();
  const drawsB = await page.evaluate(() => window.__draws);
  return {
    draws: (drawsB - drawsA) / seconds,
    busy: ((b.TaskDuration - a.TaskDuration) * 1000) / seconds,
    script: ((b.ScriptDuration - a.ScriptDuration) * 1000) / seconds,
  };
}

async function scenario(preset) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await ctx.addInitScript((f) => {
    localStorage.setItem('kiwar.save.v1', f.save);
    localStorage.setItem('kiwar.clockOffset', String(f.savedAt - Date.now()));
    localStorage.setItem('kiwar.introSeen', '1');
  }, fixture);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}?quality=${preset}${query ? `&${query}` : ''}`);
  await page.waitForFunction(() => window.__kiwar?.uiStore.getState().game, null, {
    timeout: 60_000,
  });
  // Count the frames the renderer really draws (works on any version of GameRenderer).
  await page.evaluate((stub) => {
    const r = window.__kiwar.renderer;
    const draw = r.drawFrame.bind(r);
    window.__draws = 0;
    if (stub) {
      r.renderer.render = () => {};
      if (r.postfx) r.postfx.render = () => {};
    }
    r.drawFrame = (time) => {
      window.__draws++;
      draw(time);
    };
  }, stub);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.waitForTimeout(6000);
  const rows = [{ what: 'idle 6–14 s', ...(await measure(page, cdp, 8)) }];
  await page.waitForTimeout(8000);
  rows.push({ what: 'idle 22–30 s', ...(await measure(page, cdp, 8)) });

  await page.evaluate(() => {
    const c = window.__kiwar.renderer.rig.controls;
    window.__spin = setInterval(() => void c.rotate(0.02, 0, true), 16);
  });
  await page.waitForTimeout(500);
  rows.push({ what: 'camera', ...(await measure(page, cdp, 4)) });
  await page.evaluate(() => clearInterval(window.__spin));

  // Hidden tab: nothing should be drawn.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(500);
  rows.push({ what: 'hidden (flag)', ...(await measure(page, cdp, 3)) });
  await ctx.close();
  return { rows, errors };
}

const fmt = (n, d = 0) => Number(n).toFixed(d);
const lines = [
  `640×400 · ${stub ? 'WebGL calls stubbed' : 'software WebGL'} · ${query || 'defaults'}`,
  '',
  '| preset | moment | frames drawn/s | main thread busy ms/s | script ms/s |',
  '| --- | --- | --- | --- | --- |',
];
for (const preset of PRESETS) {
  const { rows, errors } = await scenario(preset);
  for (const r of rows)
    lines.push(
      `| ${preset} | ${r.what} | ${fmt(r.draws, 1)} | ${fmt(r.busy)} | ${fmt(r.script)} |`,
    );
  if (errors.length) lines.push(`errors: ${errors.join(' / ')}`);
}
await browser.close();
console.log(lines.join('\n'));
