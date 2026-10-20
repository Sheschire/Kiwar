// Performance probe (chantier 10): frame timing, interface cost and menu opening times on a
// lived-in colony, for several screens and quality presets.
//   pnpm dev --port 5173 &   (dev build: the page exposes window.__kiwar)
//   node scripts/perf.mjs <save.json> [url=http://localhost:5173/] [cpuSlowdown=4]
// <save.json> comes from `pnpm --filter @kiwar/balance exec tsx src/perfSave.ts <save.json>`.
// Headless Chromium renders WebGL in software (SwiftShader): absolute fps say little about a
// real GPU; compare runs with each other, and read the JS / interface columns first.
import { readFileSync } from 'node:fs';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node22/lib/node_modules/playwright/index.mjs');
  }
}

const { chromium } = await loadPlaywright();
const [savePath, url = 'http://localhost:5173/', slowdown = '4'] = process.argv.slice(2);
if (!savePath) {
  console.error('usage: node scripts/perf.mjs <save.json> [url] [cpuSlowdown]');
  process.exit(1);
}
const fixture = JSON.parse(readFileSync(savePath, 'utf8'));

const SCREENS = [
  { name: 'desktop 1920×1080', width: 1920, height: 1080, dpr: 1, mobile: false },
  { name: 'desktop 1440×900 ×2', width: 1440, height: 900, dpr: 2, mobile: false },
  { name: 'phone 390×844 ×2', width: 390, height: 844, dpr: 2, mobile: true },
];
const PRESETS = (process.env.PRESETS ?? 'medium,low').split(',');
const MENUS = ['village', 'research', 'defense', 'settings'];

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const wait = (page, ms) => page.waitForTimeout(ms);
const snapshot = (page) =>
  page.evaluate(() => {
    const p = window.__kiwar.perfStore.getState();
    const tasks = window.__longTasks.splice(0);
    return {
      frame: p.frame,
      ui: p.uiMsPerSecond,
      updates: p.updatesPerSecond,
      worstUpdate: p.worstUpdate,
      longTasks: tasks.length,
      longTaskMs: tasks.reduce((a, b) => a + b, 0),
    };
  });

async function scenario(screen, preset) {
  const ctx = await browser.newContext({
    viewport: { width: screen.width, height: screen.height },
    deviceScaleFactor: screen.dpr,
    isMobile: screen.mobile,
    hasTouch: screen.mobile,
  });
  await ctx.addInitScript((f) => {
    localStorage.setItem('kiwar.save.v1', f.save);
    localStorage.setItem('kiwar.clockOffset', String(f.savedAt - Date.now()));
    localStorage.setItem('kiwar.introSeen', '1');
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks.push(e.duration);
    }).observe({ type: 'longtask', buffered: true });
  }, fixture);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}?quality=${preset}`);
  await page.waitForFunction(() => window.__kiwar?.uiStore.getState().game, null, {
    timeout: 60_000,
  });
  await wait(page, 4000);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: +slowdown });
  await wait(page, 3000);
  await snapshot(page); // drop the warm-up
  await wait(page, 4000);
  const rows = [{ what: 'idle', ...(await snapshot(page)) }];

  if (!screen.mobile) {
    // Mouse sweeping over the map (hover picking every move).
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      const a = (Date.now() - t0) / 400;
      await page.mouse.move(
        screen.width / 2 + Math.cos(a) * screen.width * 0.25,
        screen.height / 2 + Math.sin(a) * screen.height * 0.25,
      );
    }
    rows.push({ what: 'hover', ...(await snapshot(page)) });
  }

  const nest = await page.evaluate(() => {
    const k = window.__kiwar;
    const b = k.uiStore.getState().game.buildings.find((x) => x.type === 'nest');
    return b ? { q: b.q, r: b.r } : null;
  });
  const menus = [...MENUS, 'sheet'];
  for (const menu of menus) {
    await page.evaluate(
      ({ menu, nest }) => {
        const { uiStore, controller } = window.__kiwar;
        if (menu === 'sheet') {
          const tile = controller.map?.tiles.find((t) => t.q === nest.q && t.r === nest.r);
          window.__kiwar.actions.selectTile(tile ?? null);
        } else uiStore.setState({ modal: menu });
      },
      { menu, nest },
    );
    await wait(page, 2000);
    await snapshot(page);
    await wait(page, 3000);
    const open = await snapshot(page);
    const timing = await page.evaluate(
      (name) =>
        window.__kiwar.perfStore
          .getState()
          .menus.filter((m) => m.name === name)
          .pop(),
      menu,
    );
    rows.push({ what: `${menu} open`, ...open, menu: timing });
    await page.evaluate(() =>
      window.__kiwar.uiStore.setState({ modal: 'none', selectedTile: null }),
    );
    await wait(page, 1500);
  }
  await ctx.close();
  return { rows, errors };
}

const fmt = (n, d = 0) => (n === undefined || n === null ? '–' : Number(n).toFixed(d));
const lines = [
  `CPU ×${slowdown} · ${new Date().toISOString()}`,
  '',
  '| screen | preset | moment | fps | p95 ms | JS ms/frame | draws | px | UI ms/s | worst update ms | long tasks (ms) | menu → paint ms | menu render ms |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
];
for (const screen of SCREENS) {
  for (const preset of PRESETS) {
    const { rows, errors } = await scenario(screen, preset);
    for (const r of rows) {
      const f = r.frame ?? {};
      lines.push(
        `| ${screen.name} | ${preset} | ${r.what} | ${fmt(f.fps)} | ${fmt(f.p95)} | ${fmt(f.cpu, 1)} | ${fmt(f.drawCalls)} | ${f.width ?? '–'}×${f.height ?? '–'} | ${fmt(r.ui)} | ${fmt(r.worstUpdate, 1)} | ${r.longTasks} (${fmt(r.longTaskMs)}) | ${fmt(r.menu?.ms)} | ${fmt(r.menu?.render, 1)} |`,
      );
    }
    if (errors.length) lines.push(`errors: ${errors.join(' / ')}`);
    console.error(`done: ${screen.name} ${preset}`);
  }
}
await browser.close();
console.log(lines.join('\n'));
