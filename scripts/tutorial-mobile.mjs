// Chantier 21: plays the ten tutorial objectives on a phone, by taps only (dev server needed).
//   node scripts/tutorial-mobile.mjs [outDir] [width] [height]
// Every button is tapped through Playwright (visible, not covered), tiles through the canvas
// (a screen point picked with the renderer). Time runs ×300 and missing resources are granted:
// the check is that the interface never blocks, not the pacing.
import { mkdirSync } from 'node:fs';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return import('/opt/node22/lib/node_modules/playwright/index.mjs');
  }
}

const { chromium } = await loadPlaywright();
const [outDir = '/tmp/kiwar-tutorial', w = '375', h = '667'] = process.argv.slice(2);
const url = process.env.URL ?? 'http://localhost:5173/?seed=tutorial&lang=en';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.__kiwar?.controller?.state && window.__kiwar.renderer);
await page.evaluate(async () => {
  const src = performance
    .getEntriesByType('resource')
    .map((e) => e.name)
    .find((n) => n.includes('packages/shared/src/index'));
  window.__shared = await import(src);
  // The tiles a step wants: valid sites while placing, or buildings of a type (with a free
  // worker slot for 'free').
  window.__want = (kind, arg) => {
    const S = window.__shared;
    const { game, map } = window.__kiwar.uiStore.getState();
    if (kind === 'buildable') return S.buildableTiles(game, map, arg);
    return game.buildings.filter(
      (b) =>
        b.type === arg && (kind !== 'free' || S.workersOf(game, b.id).length < S.workerSlots(b)),
    );
  };
  window.__kiwar.controller.setTimeScale(300);
});

const NAMES = {
  pulpery: 'Pulpery',
  fiberWorkshop: 'Fibre workshop',
  juiceWell: 'Juice well',
  hut: 'Hut',
  seedQuarry: 'Seed quarry',
  warehouse: 'Warehouse',
};
const PLAN = {
  buildPulpery: ['build', 'pulpery'],
  buildFiber: ['build', 'fiberWorkshop'],
  hatchEgg: ['egg'],
  buildWell: ['build', 'juiceWell'],
  staffWorkers: ['staff'],
  buildHut: ['build', 'hut'],
  buildQuarry: ['build', 'seedQuarry'],
  upgradePulpery: ['upgrade', 'pulpery'],
  buildWarehouse: ['build', 'warehouse'],
  upgradeNest: ['upgrade', 'nest'],
};

const log = (...a) => console.log(...a);
let shot = 0;
const snap = (name) =>
  page.screenshot({ path: `${outDir}/${String(++shot).padStart(2, '0')}-${name}.png` });

/** The current objective: id, done, progress. */
const objective = () =>
  page.evaluate(() => {
    const { controller } = window.__kiwar;
    const S = window.__shared;
    const o = S.currentObjective(controller.state);
    if (!o) return null;
    return {
      id: o.id,
      done: S.isObjectiveComplete(controller.state, o),
      progress: S.objectiveProgress(controller.state, o),
    };
  });

const grant = () =>
  page.evaluate(() =>
    window.__kiwar.controller.dispatch({
      type: 'debugGrant',
      resources: { pulp: 400, fiber: 400, seeds: 200, juice: 200 },
    }),
  );

/** A screen point on the canvas (not under the interface) whose tile matches. */
async function pointOf(kind, arg) {
  return page.evaluate(
    ({ kind, arg }) => {
      const { renderer } = window.__kiwar;
      const wanted = window.__want(kind, arg);
      const keys = new Set(wanted.map((t) => `${t.q},${t.r}`));
      const canvas = document.getElementById('scene');
      const cx = innerWidth / 2;
      const cy = innerHeight / 2;
      const found = [];
      for (let y = 60; y < innerHeight - 60; y += 9)
        for (let x = 12; x < innerWidth - 12; x += 9) {
          if (document.elementFromPoint(x, y) !== canvas) continue;
          const t = renderer.pickTile(x, y);
          if (!t || !keys.has(`${t.q},${t.r}`)) continue;
          found.push({ x, y, q: t.q, r: t.r, d: (x - cx) ** 2 + (y - cy) ** 2 });
        }
      // The middle of the nearest tile first (its points' average), then other points.
      found.sort((a, b) => a.d - b.d);
      const first = found.filter((p) => p.q === found[0]?.q && p.r === found[0]?.r);
      if (first.length === 0) return [];
      const mid = {
        x: Math.round(first.reduce((n, p) => n + p.x, 0) / first.length),
        y: Math.round(first.reduce((n, p) => n + p.y, 0) / first.length),
      };
      return [mid, ...found.filter((_, i) => i % 3 === 0).slice(0, 6)];
    },
    { kind, arg },
  );
}

/** Waits until the camera stops (a flight or a glide moves the tiles under the finger). */
async function cameraRest() {
  let last = '';
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate(() => {
      const p = window.__kiwar.renderer.camera.position;
      return `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
    });
    if (now === last) return;
    last = now;
    await page.waitForTimeout(400);
  }
}

async function tapTile(kind, arg) {
  for (let attempt = 0; attempt < 8; attempt++) {
    // A selection pans the camera (the tile stays above the sheet): look again at rest.
    await cameraRest();
    const points = await pointOf(kind, arg);
    if (points.length === 0) {
      await focusOn(kind, arg);
      continue;
    }
    const p = points[attempt % points.length];
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(700);
    const ok = await page.evaluate(
      ({ kind, arg }) => {
        const s = window.__kiwar.uiStore.getState();
        if (kind === 'buildable') {
          const p = s.placingTile;
          return (
            s.placingPinned &&
            !!p &&
            window.__want(kind, arg).some((t) => t.q === p.q && t.r === p.r)
          );
        }
        const t = s.selectedTile;
        return (
          s.modal === 'none' &&
          !!t &&
          window.__want(kind, arg).some((b) => b.q === t.q && b.r === t.r)
        );
      },
      { kind, arg },
    );
    if (ok) return;
    // A kiwi or a neighbour took the tap: close what opened and try again.
    log(`  tap at ${p.x},${p.y} missed, retrying`);
    await page.evaluate(() =>
      window.__kiwar.uiStore.setState((s) =>
        s.placing ? { placingPinned: false } : { modal: 'none', selectedTile: null },
      ),
    );
  }
  throw new Error(`could not tap a ${kind} tile for ${arg}`);
}

/** Nothing on screen: move the camera to the nearest matching tile (a player would pan). */
async function focusOn(kind, arg) {
  await page.evaluate(
    ({ kind, arg }) => {
      const { controller, actions, uiStore } = window.__kiwar;
      const { map } = uiStore.getState();
      const nest = controller.state.buildings.find((b) => b.type === 'nest');
      const list = window.__want(kind, arg);
      const d = (t) => Math.abs(t.q - nest.q) + Math.abs(t.r - nest.r);
      const t = [...list].sort((a, b) => d(a) - d(b))[0];
      const tile = t && map.tiles.find((x) => x.q === t.q && x.r === t.r);
      if (tile) actions.focusTile(tile);
    },
    { kind, arg },
  );
}

async function closeSheet() {
  if (await page.locator('.sheet').count()) await page.tap('.sheet-header button');
}

async function build(type) {
  await grant();
  await page.tap('.thumb-bar >> text=Build');
  const item = page.locator('li', { has: page.locator(`text="${NAMES[type]}"`) }).first();
  await item.scrollIntoViewIfNeeded();
  await item.locator('button', { hasText: 'Place' }).tap();
  await page.waitForTimeout(800);
  const placing = () => page.evaluate(() => window.__kiwar.uiStore.getState().placing !== null);
  for (let i = 0; (await placing()) && i < 4; i++) {
    if (!(await page.evaluate(() => window.__kiwar.uiStore.getState().placingPinned)))
      await tapTile('buildable', type);
    // The banner grows once the plan of the tile is known: tap "Build here" once it settles.
    await page.waitForTimeout(1200);
    await page.tap('.placing-banner button:has-text("Build here")');
    await page.waitForTimeout(600);
    if (await placing()) log('  "Build here" did not take, tapping again');
  }
  if (await placing()) throw new Error(`could not build ${type}`);
  await closeSheet();
}

async function upgrade(type) {
  await grant();
  await tapTile('building', type);
  await page.tap('.sheet-foot .btn-primary');
  await page.waitForTimeout(500);
  await closeSheet();
}

/** Fill the free worker slots of the production buildings with +. */
async function fillSlots() {
  for (const type of ['pulpery', 'fiberWorkshop', 'juiceWell', 'seedQuarry']) {
    if ((await objective()).done) return;
    const free = await page.evaluate((type) => window.__want('free', type).length, type);
    if (free === 0) continue;
    await tapTile('free', type);
    const plus = page.locator('.sheet [aria-label="Add a worker"]');
    while (!(await objective()).done && (await plus.isEnabled())) {
      await plus.tap();
      await page.waitForTimeout(400);
    }
    await closeSheet();
  }
}

async function staff() {
  await fillSlots();
  if ((await objective()).done) return;
  // As the hint says: a level-1 building employs one kiwi, a level-2 Pulpery two.
  await upgrade('pulpery');
  // Upgraded, it gets a free slot (or the idle kiwi takes it on its own).
  await page.waitForFunction(
    () => {
      const S = window.__shared;
      const game = window.__kiwar.uiStore.getState().game;
      const o = S.currentObjective(game);
      return window.__want('free', 'pulpery').length > 0 || !o || S.isObjectiveComplete(game, o);
    },
    null,
    { timeout: 90_000 },
  );
  await fillSlots();
}

async function egg() {
  while (!(await objective()).done) {
    await grant();
    const btn = page.locator('.thumb-egg .egg-btn.ready');
    if (await btn.count()) await btn.tap();
    await page.waitForTimeout(1500);
  }
}

const started = Date.now();
for (let step = 0; step < 12; step++) {
  const o = await objective();
  if (!o) break;
  log(`→ ${o.id} (${o.progress.current}/${o.progress.target})`);
  const [kind, arg] = PLAN[o.id];
  if (!o.done) {
    if (kind === 'build') await build(arg);
    else if (kind === 'upgrade') await upgrade(arg);
    else if (kind === 'staff') await staff();
    else if (kind === 'egg') await egg();
  }
  const until = Date.now() + 90_000;
  while (!(await objective()).done) {
    if (Date.now() > until) {
      await snap(`${o.id}-stuck`);
      log(
        await page.evaluate(() =>
          JSON.stringify(
            window.__kiwar.controller.state.villagers.map((v) => [v.name, v.job, v.lent ?? null]),
          ),
        ),
      );
      throw new Error(`${o.id} never completed`);
    }
    await page.waitForTimeout(1000);
  }
  await snap(o.id);
  await page.tap('.objective-pill.is-done');
  await page.waitForTimeout(800);
}
const left = await objective();
await snap('done');
log(
  left
    ? `stopped at ${left.id}`
    : `all objectives done in ${Math.round((Date.now() - started) / 1000)} s`,
);
if (errors.length) log('page errors:\n' + errors.join('\n'));
await browser.close();
process.exit(left || errors.length ? 1 : 0);
