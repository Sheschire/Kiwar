import {
  applyCommand,
  BANKS,
  getTile,
  hexKey,
  hexNeighbors,
  hexDistance,
  parseHexKey,
  type Hex,
  isBank,
  canalError,
  canalsLeft,
  CANALS,
  depotDistances,
  distanceIn,
  RESOURCE_IDS,
  techEffects,
  type Command,
  type FaceMap,
  type GameState,
} from '@kiwar/shared';

/** The juice is "far" when its nearest tile is this many steps from a depot. */
const FAR = 2.5;

/**
 * Chantier 45: once Canals is known, dig one tile at a time towards the depots while the
 * nearest juice is far from them (a camp or a well can then stand close); otherwise where the
 * most harvested tiles become fertile banks (two at least). Twice the price is kept in stock.
 */
export function canalOrder(state: GameState, map: FaceMap): Command | null {
  if (!techEffects(state).canals || canalsLeft(state) <= 0) return null;
  if (state.queue.some((i) => i.kind === 'canal')) return null;
  for (const id of RESOURCE_IDS)
    if (state.resources[id] < 2 * ((CANALS.cost as Partial<Record<string, number>>)[id] ?? 0))
      return null;
  const dist = depotDistances(state, map);
  let nearest = Infinity;
  for (const t of map.tiles)
    if (t.type === 'juice') nearest = Math.min(nearest, distanceIn(dist, t));
  const open = map.tiles.filter(
    (t) => t.type === 'flesh' && canalError(state, map, t.q, t.r) === null,
  );
  let best: { q: number; r: number; d: number } | null = null;
  if (nearest > FAR)
    for (const t of open) {
      const d = distanceIn(dist, t);
      // Only a step that brings the juice closer.
      if (d < nearest && (!best || d < best.d)) best = { q: t.q, r: t.r, d };
    }
  // Otherwise the harvested tiles that would become fertile banks (the canal's own tile is lost).
  if (!best) {
    const pooled = new Set(state.buildings.flatMap((b) => b.pool?.tiles ?? []));
    let gain = 1;
    for (const t of open) {
      let g = pooled.has(hexKey(t)) ? -1 : 0;
      for (const n of hexNeighbors(t)) {
        const nt = getTile(map, n);
        if (nt && pooled.has(hexKey(n)) && BANKS.tiles.includes(nt.type) && !isBank(map, nt)) g++;
      }
      if (g > gain) {
        gain = g;
        best = { q: t.q, r: t.r, d: 0 };
      }
    }
  }
  // Or a chain towards the harvested tiles, when the quota left reaches them.
  if (!best) {
    const pooled = state.buildings.flatMap((b) => b.pool?.tiles ?? []).map(parseHexKey);
    const wanted = pooled.filter((h) => {
      const t = getTile(map, h);
      return !!t && BANKS.tiles.includes(t.type) && !isBank(map, t);
    });
    const reach = (h: Hex) => Math.min(...wanted.map((w) => hexDistance(h, w)));
    if (wanted.length > 0) {
      const juice = Math.min(...map.tiles.filter((t) => t.type === 'juice').map((t) => reach(t)));
      if (juice - 1 <= canalsLeft(state))
        for (const t of open) {
          const d = reach(t);
          if (d < juice && d >= 1 && (!best || d < best.d)) best = { q: t.q, r: t.r, d };
        }
    }
  }
  if (!best) return null;
  const cmd: Command = { type: 'digCanal', q: best.q, r: best.r };
  return applyCommand(state, cmd, { now: state.now, map }).ok ? cmd : null;
}
