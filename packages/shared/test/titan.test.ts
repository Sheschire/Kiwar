import { describe, expect, it } from 'vitest';
import {
  advance,
  applyCommand,
  faceMapOf,
  getTile,
  HOUR_MS,
  isPlausible,
  migrateState,
  newGame,
  splitsLand,
  SMASH,
  TERRAFORM,
  terraformLeft,
  TITAN,
  type BuildingId,
  type Command,
  type GameState,
  type TechId,
  type VillagerId,
} from '../src';
import { rich, T0 } from './helpers';

/** An Iron-age colony on a drawn biome (obstacles), with a Kikiwiwi idle at home. */
function titanColony(techs: TechId[] = ['stoneAge', 'ironAge', 'juiceInfusion', 'titanWorks']) {
  const state = newGame({ seed: 'titan-seed', face: 'kiwisu', now: T0 });
  const s: GameState = rich(state);
  const map0 = faceMapOf(s);
  s.buildings[0]!.level = 4;
  const mon = map0.tiles.find((t) => t.type === 'flesh' && t.rho < 0.3 && t.rho > 0.1)!;
  s.buildings.push({
    id: 'bmon' as BuildingId,
    type: 'monument',
    q: mon.q,
    r: mon.r,
    level: 2,
    richness: mon.richness,
    builtAt: T0,
  });
  s.research.done = [...techs];
  const k = s.villagers[0]!;
  k.kikiwiwi = { since: T0 };
  return { s, k };
}

const errorOf = (s: GameState, cmd: Command) => {
  const r = applyCommand(s, cmd, { now: s.now, map: faceMapOf(s) });
  return r.ok ? null : r.error;
};

const freeTile = (s: GameState, type: string) => {
  const map = faceMapOf(s);
  return map.tiles.find(
    (t) =>
      t.type === type &&
      t.rho > 0.35 &&
      !t.flood &&
      !s.obstacles.some((o) => o.q === t.q && o.r === t.r) &&
      !s.buildings.some((b) => b.q === t.q && b.r === t.r) &&
      !splitsLand(map, t.q, t.r),
  )!;
};

describe('titan works', () => {
  it('smashes a rock for its loot, exactly in one big step or many small ones', () => {
    const { s, k } = titanColony();
    s.resources.seeds = 0;
    const rock = s.obstacles.find((o) => o.kind === 'rock')!;
    const cmd: Command = {
      type: 'titanWork',
      villagerId: k.id,
      q: rock.q,
      r: rock.r,
      work: 'smash',
    };
    const plain = structuredClone(s);
    delete plain.villagers[0]!.kikiwiwi;
    expect(errorOf(plain, cmd)).toBe('notAKikiwiwi');
    const dry = structuredClone(s);
    dry.resources.juice = 0;
    expect(errorOf(dry, cmd)).toBe('kikiwiwiWeak');
    const r = applyCommand(s, cmd, { now: s.now, map: faceMapOf(s) });
    if (!r.ok) throw new Error(r.error);
    expect(r.state.resources.juice).toBe(s.resources.juice - SMASH.rock.juice);
    expect(errorOf(r.state, { type: 'gather', q: rock.q, r: rock.r })).toBe('obstacle');
    const end = s.now + 2 * HOUR_MS;
    const big = advance(r.state, end);
    let small = r.state;
    for (let t = s.now; t < end; t += HOUR_MS / 6) small = advance(small, t).state;
    small = advance(small, end).state;
    expect(big.state.obstacles.some((o) => o.id === rock.id)).toBe(false);
    expect(big.state.resources.seeds).toBe(rock.loot.seeds);
    expect(small.obstacles).toEqual(big.state.obstacles);
    expect(small.villagers).toEqual(big.state.villagers);
    expect(big.events.some((e) => e.type === 'obstacleCleared' && e.by === 'titan')).toBe(true);
  });

  it('digs a juice spring: the map, the deposits and the server agree', () => {
    const { s, k } = titanColony();
    const flesh = freeTile(s, 'flesh');
    const cmd: Command = {
      type: 'titanWork',
      villagerId: k.id,
      q: flesh.q,
      r: flesh.r,
      work: 'spring',
    };
    expect(errorOf({ ...s, research: { ...s.research, done: ['stoneAge', 'ironAge'] } }, cmd)).toBe(
      'techMissing',
    );
    const r = applyCommand(s, cmd, { now: s.now, map: faceMapOf(s) });
    if (!r.ok) throw new Error(r.error);
    const after = advance(r.state, s.now + TERRAFORM.spring.durationMs + 1000);
    expect(after.state.terraform[`${flesh.q},${flesh.r}`]).toBe('spring');
    const map = faceMapOf(after.state);
    expect(getTile(map, flesh)!.type).toBe('juice');
    // The generated map is untouched.
    expect(getTile(faceMapOf({ seed: s.seed, face: s.face, params: s.params }), flesh)!.type).toBe(
      'flesh',
    );
    expect(after.events.some((e) => e.type === 'terraformed')).toBe(true);
    // A juice well can now stand on it, even with a caller holding the old map.
    const well = applyCommand(
      after.state,
      { type: 'build', buildingType: 'juiceWell', q: flesh.q, r: flesh.r },
      { now: after.state.now, map: faceMapOf(s) },
    );
    expect(well.ok).toBe(true);
  });

  it('raises terraces, flattens groves, within the cap of the age', () => {
    const { s, k } = titanColony();
    const grove = freeTile(s, 'grove');
    const cmd: Command = {
      type: 'titanWork',
      villagerId: k.id,
      q: grove.q,
      r: grove.r,
      work: 'flatten',
    };
    const r = applyCommand(s, cmd, { now: s.now, map: faceMapOf(s) });
    if (!r.ok) throw new Error(r.error);
    expect(terraformLeft(r.state)).toBe((TITAN.maxTerraform[2] ?? 0) - 1);
    const done = advance(r.state, s.now + TERRAFORM.flatten.durationMs + 1).state;
    expect(getTile(faceMapOf(done), grove)!.type).toBe('flesh');
    // Not on a tile with something on it, nor on the wrong land.
    const rock = s.obstacles.find((o) => o.kind === 'rock')!;
    expect(errorOf(done, { ...cmd, q: rock.q, r: rock.r })).toBe('notReshapable');
    expect(errorOf(done, { ...cmd, q: 0, r: 0, work: 'terrace' })).toBe('notReshapable');
    const full = structuredClone(done);
    for (let i = 0; i < 10; i++) full.terraform[`${100 + i},0`] = 'flatten';
    expect(
      errorOf(full, { ...cmd, q: freeTile(full, 'grove').q, r: freeTile(full, 'grove').r }),
    ).toBe('terraformLimit');
  });

  it('never cuts the land in two with a spring', () => {
    const { s } = titanColony();
    const map = faceMapOf(s);
    // A walkable tile whose only walkable neighbour leads home is a dead end: fine. A bridge is not.
    const bridges = map.tiles.filter((t) => t.type === 'flesh' && splitsLand(map, t.q, t.r));
    for (const b of bridges.slice(0, 3)) {
      const k = s.villagers[0]!;
      expect(
        errorOf(s, {
          type: 'titanWork',
          villagerId: k.id as VillagerId,
          q: b.q,
          r: b.r,
          work: 'spring',
        }),
      ).toBe('notReshapable');
    }
  });

  it('migrates v16 saves with nothing reshaped, and refuses made-up reshaping', () => {
    const { s } = titanColony();
    const raw = { ...structuredClone(s), schemaVersion: 16 } as Record<string, unknown>;
    delete raw.terraform;
    const m = migrateState(raw);
    expect(m.ok && m.state.terraform).toEqual({});
    const fresh = newGame({ seed: 'titan-seed', face: 'kiwisu', now: T0 });
    const cheat = structuredClone(fresh);
    cheat.terraform['3,3'] = 'spring';
    expect(isPlausible(fresh, T0)).toBe(true);
    expect(isPlausible(cheat, T0)).toBe(false);
  });
});
