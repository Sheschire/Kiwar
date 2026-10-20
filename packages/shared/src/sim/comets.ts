import { COMETS, STARDUST, STARDUST_SCALE, dustPoints } from '../data/comets';
import { KIWI } from '../data/kiwis';
import { hexKey, type Hex } from '../hex/hex';
import type { TimeMs, VillagerId } from '../types/ids';
import { autoAssign, type GameEvent } from './advance';
import { seasonOf } from './calendar';
import { ageOf } from './research';
import { getBuilding, workerSlots, workersOf } from './selectors';
import { withThreatRng, type DustPatch, type GameState, type Villager } from './state';
import { faceMapOf, isFlooded } from './territory';

/** Stardust cap in raw units. */
export const STARDUST_CAP = STARDUST.cap * STARDUST_SCALE;

/** Whole stardust points of the colony (what costs are paid with). */
export function stardustOf(state: GameState): number {
  return dustPoints(state.stardust);
}

/** Stardust dropped by a comet passing now (whole points, all tiles together). */
export function cometStock(state: GameState): number {
  return Math.round(COMETS.stock * (COMETS.ageFactor[ageOf(state)] ?? 1));
}

/** Raw units a kiwi picks per ms (an integer: Dexterity makes it faster). */
export function pickRate(v: Villager): number {
  const dex = 1 + STARDUST.perDexterity * (v.stats.dexterity - KIWI.stat.average);
  return Math.max(1, Math.round(100 * dex));
}

/** The dust tile on a hex, if any. */
export function dustAt(state: GameState, q: number, r: number): DustPatch | undefined {
  return state.comets.patches.find((p) => p.q === q && p.r === r);
}

export function dustPickers(state: GameState, patchId: string): Villager[] {
  return state.villagers.filter((v) => v.job.kind === 'stardust' && v.job.patchId === patchId);
}

/** Raw units per ms taken from a patch (0 during a shelter or once the stock is full). */
export function patchRate(state: GameState, p: DustPatch): number {
  if (p.stock <= 0 || state.stardust >= STARDUST_CAP) return 0;
  if (state.threats.shelterUntil > state.now) return 0;
  let rate = 0;
  for (const v of dustPickers(state, p.id)) rate += pickRate(v);
  return rate;
}

/** Stardust per hour picked by the whole colony right now (points, for the UI). */
export function stardustPerHour(state: GameState): number {
  let rate = 0;
  for (const p of state.comets.patches) rate += patchRate(state, p);
  return (rate * 3_600_000) / STARDUST_SCALE;
}

/** Plans the next comet when none is (a few days after the last one). */
export function planComet(s: GameState): void {
  const c = s.comets;
  if (c.next) return;
  withThreatRng(s, (rng) => {
    const gap = Math.round(rng.range(COMETS.intervalMs[0], COMETS.intervalMs[1]));
    const notice = Math.round(rng.range(COMETS.noticeMs[0], COMETS.noticeMs[1]));
    const at = Math.max(c.lastAt + gap, s.now + notice);
    c.next = { id: `c${c.passes + 1}`, announceAt: at - notice, at, announced: false };
  });
}

/** Next announcement, passage, dust running out or scattering, or the stock filling up. */
export function nextCometEvent(s: GameState): TimeMs {
  const c = s.comets;
  let next = Infinity;
  if (c.next) next = c.next.announced ? c.next.at : c.next.announceAt;
  let total = 0;
  for (const p of c.patches) {
    next = Math.min(next, p.expiresAt);
    const rate = patchRate(s, p);
    if (rate > 0) {
      total += rate;
      next = Math.min(next, s.now + Math.max(1, Math.ceil(p.stock / rate)));
    }
  }
  if (total > 0) {
    next = Math.min(next, s.now + Math.max(1, Math.ceil((STARDUST_CAP - s.stardust) / total)));
  } else if (s.stardust >= STARDUST_CAP && c.patches.some((p) => dustPickers(s, p.id).length > 0))
    next = s.now;
  return next;
}

/** Picks `dtMs` of stardust (integer units: small steps add up exactly like a big one). */
export function accrueStardust(s: GameState, dtMs: number): void {
  for (const p of s.comets.patches) {
    const rate = patchRate(s, p);
    if (rate <= 0) continue;
    const take = Math.min(rate * dtMs, p.stock, STARDUST_CAP - s.stardust);
    if (take <= 0) continue;
    p.stock -= take;
    s.stardust += take;
  }
}

/** Free land tiles where stardust can fall. */
function freeTiles(s: GameState): Hex[] {
  const map = faceMapOf(s);
  const season = seasonOf(s);
  const taken = new Set([
    ...s.buildings.map((b) => hexKey(b)),
    ...s.queue.filter((i) => i.kind === 'build').map((i) => hexKey(i)),
    ...s.sky.meteors.map((m) => hexKey(m)),
    ...s.obstacles.map((o) => hexKey(o)),
    ...s.comets.patches.map((p) => hexKey(p)),
  ]);
  if (s.sky.next?.announced) taken.add(hexKey(s.sky.next));
  return map.tiles.filter(
    (t) =>
      (COMETS.landTypes as readonly string[]).includes(t.type) &&
      t.rho >= 0.25 &&
      t.rho <= 0.92 &&
      !taken.has(hexKey(t)) &&
      !isFlooded(t, s.params.biome, season),
  );
}

/** Sends the pickers of a patch back to their workplace (or to look for work). */
function releasePickers(s: GameState, patchId: string | null): void {
  for (const v of s.villagers) {
    if (v.job.kind !== 'stardust' || (patchId !== null && v.job.patchId !== patchId)) continue;
    const back = v.job.returnTo ? getBuilding(s, v.job.returnTo) : undefined;
    if (back && workersOf(s, back.id).length < workerSlots(back)) {
      v.job = { kind: 'work', buildingId: back.id };
    } else {
      v.job = { kind: 'idle' };
      autoAssign(s, v);
    }
  }
}

export function cometTick(s: GameState, at: TimeMs, events: GameEvent[]): void {
  const c = s.comets;
  const next = c.next;
  if (next && !next.announced && next.announceAt === at) {
    next.announced = true;
    events.push({ type: 'cometAnnounced', at, passAt: next.at });
  }
  if (next && next.announced && next.at === at) {
    const stock = cometStock(s);
    const tiles = withThreatRng(s, (rng) => {
      const free = freeTiles(s);
      const count = Math.min(free.length, rng.int(COMETS.tiles[0], COMETS.tiles[1]));
      const out: Hex[] = [];
      for (let i = 0; i < count; i++) {
        const t = rng.pick(free);
        free.splice(free.indexOf(t), 1);
        out.push({ q: t.q, r: t.r });
      }
      return out;
    });
    const dropped: { q: number; r: number; stock: number }[] = [];
    tiles.forEach((t, i) => {
      // Whole points per tile; the first tiles get the remainder.
      const points = Math.floor(stock / tiles.length) + (i < stock % tiles.length ? 1 : 0);
      c.patches.push({
        id: `${next.id}-${i + 1}`,
        q: t.q,
        r: t.r,
        stock: points * STARDUST_SCALE,
        max: points * STARDUST_SCALE,
        landedAt: at,
        expiresAt: at + COMETS.lifeMs,
      });
      dropped.push({ q: t.q, r: t.r, stock: points });
    });
    c.passes++;
    c.lastAt = at;
    c.next = null;
    events.push({ type: 'cometPassed', at, patches: dropped });
  }
  for (const p of c.patches) {
    if (p.stock <= 0) {
      events.push({ type: 'dustPicked', at, q: p.q, r: p.r });
      releasePickers(s, p.id);
    } else if (p.expiresAt === at) {
      events.push({ type: 'dustFaded', at, q: p.q, r: p.r, left: dustPoints(p.stock) });
      releasePickers(s, p.id);
    }
  }
  c.patches = c.patches.filter((p) => p.stock > 0 && p.expiresAt > at);
  if (s.stardust >= STARDUST_CAP && s.villagers.some((v) => v.job.kind === 'stardust')) {
    events.push({ type: 'stardustFull', at });
    releasePickers(s, null);
  }
}

/** Who can be sent to pick stardust: kiwis at home or at work (not the Kikiwiwis). */
export function canPickDust(v: Villager): boolean {
  if (v.kikiwiwi) return false;
  return v.job.kind === 'idle' || v.job.kind === 'work' || v.job.kind === 'stardust';
}

/**
 * The crew the "send the best" button picks: the pickers already there, then the free kiwis
 * with the most Dexterity (idle ones first on ties; locked kiwis are never borrowed).
 */
export function bestDustCrew(state: GameState, patchId: string): VillagerId[] {
  const here = dustPickers(state, patchId).map((v) => v.id);
  const others = state.villagers
    .map((v, i) => ({ v, i }))
    .filter(
      ({ v }) =>
        canPickDust(v) && v.job.kind !== 'stardust' && (v.job.kind === 'idle' || !v.locked),
    )
    .sort(
      (a, b) =>
        b.v.stats.dexterity - a.v.stats.dexterity ||
        Number(b.v.job.kind === 'idle') - Number(a.v.job.kind === 'idle') ||
        a.i - b.i,
    )
    .map(({ v }) => v.id);
  return [...here, ...others].slice(0, STARDUST.slots);
}
