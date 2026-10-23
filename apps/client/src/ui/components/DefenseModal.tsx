import {
  canCollect,
  reserveHolders,
  turretCount,
  turretLimit,
  type WaveForecast,
  SECTOR_IDS,
  POSTURES,
  uncoveredGates,
  type SectorClash,
  type SectorId,
  garrisonOf,
  guardPower,
  nest,
  RESOURCE_IDS,
  SHELTER,
  THREATS,
  type GameState,
  type Resources,
  type Sides,
  type Villager,
  type VillagerId,
  type WaveReport,
} from '@kiwar/shared';
import { useEffect } from 'preact/hooks';
import { defenseNow, forecastWave } from '../derived';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { setPanelOpen, uiStore, useT, useUi, type Translate } from '../store';
import { KiwiPortrait } from './KiwiPortrait';
import { Modal } from './Modal';
import { useJobLabel } from './VillageModal';

const one = (x: number) => Math.round(x * 10) / 10;

/** Chantier 12: the sector where the most breaks through (null when every sector holds). */
function weakestSector(sectors: Record<SectorId, SectorClash>): SectorId | null {
  let best: SectorId | null = null;
  let most = 1e-9;
  for (const s of SECTOR_IDS) {
    const x = sectors[s].through.ground + sectors[s].through.air;
    if (x > most) {
      most = x;
      best = s;
    }
  }
  return best;
}

/** Chantier 06: the HUD pill — a wave on its way, the shelter, or an unread report. */
export function ThreatBadge() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.slowGame);
  const now = useUi((s) => s.slowNow);
  const unread = useUi((s) => s.unreadWave);
  const unfolded = useUi((s) => s.threatOpen);
  const f = game ? forecastWave(game) : null;
  // A wave less than an hour away unfolds the alert, once per wave.
  const soon = f && !unfolded && f.wave.at - now < REOPEN_BEFORE_MS ? f.wave.at : null;
  useEffect(() => {
    if (soon !== null && reopenedFor() !== soon) {
      rememberReopen(soon);
      setPanelOpen('threat', true);
    }
  }, [soon]);
  if (!game) return null;
  const open = () => uiStore.setState({ modal: 'defense', unreadWave: null });
  const shelter = game.threats.shelterUntil > now;
  if (!f && !shelter && !unread) return null;
  const odds = f?.odds ?? 'likely';
  const weak = f ? weakestSector(f.expected.sectors) : null;
  if (!unfolded) {
    const left = shelter ? game.threats.shelterUntil - now : f ? f.wave.at - now : null;
    return (
      <span class="threat-wrap pe">
        <button
          class={`threat-badge threat-pill parchment odds-${odds}`}
          onClick={open}
          aria-label={t('defense.button')}
        >
          <span class="threat-paw" aria-hidden="true">
            🐾
          </span>
          {left !== null ? <span>{formatDuration(lang, left)}</span> : <strong>!</strong>}
        </button>
        <button
          class="btn btn-icon btn-small fold-btn threat-fold"
          aria-label={t('defense.unfold')}
          aria-expanded={false}
          onClick={() => setPanelOpen('threat', true)}
        >
          ▸
        </button>
      </span>
    );
  }
  return (
    <span class="threat-wrap pe">
      <button class={`threat-badge parchment odds-${odds}`} onClick={open}>
        <span class="threat-paw" aria-hidden="true">
          🐾
        </span>
        {shelter ? (
          <span>
            {t('defense.badgeShelter', {
              duration: formatDuration(lang, game.threats.shelterUntil - now),
            })}
          </span>
        ) : f ? (
          <span>
            {t('defense.badge', { duration: formatDuration(lang, f.wave.at - now) })} ·{' '}
            <strong>{t(`defense.odds.${f.odds}`)}</strong>
            {weak && (
              <span class="small">
                {' '}
                · {t('defense.weakSector', { sector: `@defense.sectors.${weak}` })}
              </span>
            )}
          </span>
        ) : (
          <span>{t('defense.badgeReport')}</span>
        )}
      </button>
      <button
        class="btn btn-icon btn-small fold-btn threat-fold"
        aria-label={t('defense.fold')}
        aria-expanded={true}
        onClick={() => setPanelOpen('threat', false)}
      >
        ◂
      </button>
    </span>
  );
}

const REOPEN_BEFORE_MS = 3_600_000;
const REOPEN_KEY = 'kiwar.threatReopened';

/** The wave (its time) that last unfolded the alert by itself. */
function reopenedFor(): number | null {
  try {
    const v = localStorage.getItem(REOPEN_KEY);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

function rememberReopen(at: number): void {
  try {
    localStorage.setItem(REOPEN_KEY, String(at));
  } catch {
    // ignore
  }
}

function lootList(t: Translate, lang: 'fr' | 'en', loot: Resources): string {
  const parts = RESOURCE_IDS.filter((id) => loot[id] >= 1).map(
    (id) => `${formatNumber(lang, Math.floor(loot[id]))} ${t(`resources.${id}`)}`,
  );
  return parts.length ? parts.join(', ') : t('defense.won');
}

function SideCard({
  side,
  threat,
  defense,
  parts,
  holds,
}: {
  side: 'ground' | 'air';
  threat: number;
  defense: number;
  parts: string[];
  /** Nothing breaks through on this side, sector by sector. */
  holds: boolean;
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const max = Math.max(threat, defense, 1);
  return (
    <div class={`side-card side-${side} ${holds ? 'holds' : 'breaks'}`}>
      <h4>{t(side === 'ground' ? 'defense.ferrets' : 'defense.bats')}</h4>
      <div class="side-bar">
        <span class="side-threat" style={{ width: `${(threat / max) * 100}%` }} />
      </div>
      <p class="small">{t('defense.threat', { value: formatNumber(lang, one(threat)) })}</p>
      <div class="side-bar">
        <span class="side-defense" style={{ width: `${(defense / max) * 100}%` }} />
      </div>
      <p class="small">
        <strong>{t('defense.defenseValue', { value: formatNumber(lang, one(defense)) })}</strong>
      </p>
      {parts.map((p) => (
        <p key={p} class="small muted">
          {p}
        </p>
      ))}
    </div>
  );
}

/**
 * Chantier 12: defense against threat in each sector (front facing the alien planet, two
 * flanks), what breaks through and the guards sent there. Without a wave: the defense alone.
 */
function SectorTable({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const f = forecastWave(game);
  const n = (x: number) => formatNumber(lang, one(x));
  const defense = f?.defense ?? defenseNow(game);
  const clash = f?.expected.sectors;
  return (
    <section class="field">
      <h3>{t('defense.sectorsTitle')}</h3>
      <p class="small muted">{t('defense.sectorsHint')}</p>
      <ul class="sector-list">
        {SECTOR_IDS.map((s) => {
          const c = clash?.[s];
          const through = c ? c.through.ground + c.through.air : 0;
          const guards = defense.guards.filter((g) => g.sector === s).length;
          const cell = (side: 'ground' | 'air') => {
            const d = defense.sectors[s][side];
            const ok = !c || c.through[side] <= 1e-9;
            return (
              <span class={c ? (ok ? 'bonus' : 'warn') : ''}>
                {t(side === 'ground' ? 'defense.ferrets' : 'defense.bats')}{' '}
                {c ? t('defense.sectorThreat', { defense: n(d), threat: n(c.threat[side]) }) : n(d)}
                {c && (ok ? ' ✓' : ' ✗')}
              </span>
            );
          };
          return (
            <li key={s} class={`sector-row sector-${s} ${through > 1e-9 ? 'breaks' : ''}`}>
              <strong>{t(`defense.sectors.${s}`)}</strong>
              <span class="sector-cells small">
                {cell('ground')}
                {cell('air')}
                {guards > 0 && (
                  <span class="muted">{t('defense.sectorGuards', { count: guards })}</span>
                )}
                {through > 1e-9 && (
                  <span class="warn">{t('defense.sectorThrough', { value: n(through) })}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Kiwis who can stand guard (at home: working, idle or already posted). */
function guardCandidates(game: GameState): { v: Villager; power: Sides }[] {
  return game.villagers
    .filter((v) => v.job.kind === 'work' || v.job.kind === 'idle' || v.job.kind === 'guard')
    .map((v) => ({ v, power: guardPower(v, game) }))
    .sort((a, b) => b.power.air + b.power.ground - (a.power.air + a.power.ground));
}

function GarrisonPicker({ game }: { game: GameState }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const jobLabel = useJobLabel();
  const posted = garrisonOf(game).map((v) => v.id);
  const list = guardCandidates(game);
  const set = (ids: VillagerId[]) => actions.dispatch({ type: 'setGarrison', villagerIds: ids });
  return (
    <section class="field">
      <h3>{t('defense.garrisonTitle')}</h3>
      <p class="small muted">{t('defense.garrisonHint')}</p>
      <p class="small muted">
        {game.automation.garrison ? t('defense.garrisonAuto') : t('defense.garrisonManual')}
      </p>
      {list.length === 0 && <p class="small">{t('defense.noGuards')}</p>}
      <ul class="crew-list">
        {list.map(({ v, power }) => {
          const on = v.job.kind === 'guard';
          return (
            <li key={v.id}>
              <label class={`crew-row ${on ? 'is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => set(on ? posted.filter((id) => id !== v.id) : [...posted, v.id])}
                />
                <KiwiPortrait
                  shiny={v.shiny}
                  classId={v.classId}
                  titan={!!v.kikiwiwi}
                  seed={v.id}
                  size={34}
                />
                <span class="kiwi-row-main">
                  <span class="kiwi-row-name">
                    {v.name}{' '}
                    <span class="small muted">{t('common.levelShort', { level: v.level })}</span>
                  </span>
                  <span class="small muted">{jobLabel(game, v)}</span>
                </span>
                <span class="crew-numbers small">
                  <span>
                    {t('defense.ferrets')} {formatNumber(lang, one(power.ground))}
                  </span>
                  <span class={power.air > 0 ? 'bonus' : 'muted'}>
                    {t('defense.bats')} {formatNumber(lang, one(power.air))}
                  </span>
                </span>
              </label>
              {on && (
                <select
                  class="pin-select small"
                  aria-label={t('battle.pin', { name: v.name })}
                  value={game.threats.pins[v.id] ?? ''}
                  onChange={(e) => {
                    const value = (e.target as HTMLSelectElement).value;
                    actions.dispatch({
                      type: 'pinGuard',
                      villagerId: v.id,
                      sector: value === '' ? null : (value as SectorId),
                    });
                  }}
                >
                  <option value="">{t('battle.pinAuto')}</option>
                  {SECTOR_IDS.map((sec) => (
                    <option key={sec} value={sec}>
                      {t(`defense.sectors.${sec}`)}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Chantier 36: the predators announced, pack by pack (sector), and where they come in. */
function WavePlan({ f }: { f: WaveForecast }) {
  const t = useT();
  const squads = f.wave.squads ?? [];
  if (squads.length === 0) return null;
  return (
    <section class="field wave-plan">
      <h3>{t('battle.plan.title')}</h3>
      <p class="small muted">{t('battle.plan.hint')}</p>
      <ul class="wave-packs">
        {SECTOR_IDS.map((sec) => {
          const here = squads.filter((q) => q.sector === sec);
          if (here.length === 0) return null;
          return (
            <li key={sec} class="small">
              <strong>{t(`defense.sectors.${sec}`)}</strong>{' '}
              {here
                .map((q) =>
                  t('battle.plan.squad', { count: q.count, name: t(`battle.enemies.${q.kind}`) }),
                )
                .join(', ')}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Chantier 36: how the garrison fights. */
function PostureChoice({ game }: { game: GameState }) {
  const t = useT();
  const posture = game.threats.posture;
  return (
    <section class="field">
      <h3>{t('battle.posture.title')}</h3>
      <div class="posture-choice" role="radiogroup" aria-label={t('battle.posture.title')}>
        {POSTURES.map((p) => (
          <button
            key={p}
            role="radio"
            aria-checked={posture === p}
            class={`btn btn-small ${posture === p ? 'is-on' : ''}`}
            onClick={() => actions.dispatch({ type: 'setPosture', posture: p })}
          >
            {t(`battle.posture.${p}`)}
          </button>
        ))}
      </div>
      <p class="small muted">{t(`battle.posture.${posture}Hint`)}</p>
    </section>
  );
}

function ReportItem({ r, now, t }: { r: WaveReport; now: number; t: Translate }) {
  const lang = useUi((s) => s.lang);
  const n = (x: number) => formatNumber(lang, one(x));
  return (
    <li class={`wave-report ${r.victory ? 'won' : 'lost'}`}>
      <p>
        <strong>{t(r.victory ? 'defense.won' : 'defense.lost')}</strong>{' '}
        <span class="small muted">
          {t('defense.reportLine', {
            ago: formatDuration(lang, now - r.at),
            ground: n(r.threat.ground),
            air: n(r.threat.air),
            defense: `${n(r.defense.ground)} / ${n(r.defense.air)}`,
          })}
        </span>
      </p>
      {r.ammoUsed > 0 && (
        <p class="small muted">{t('defense.reportAmmo', { count: Math.round(r.ammoUsed) })}</p>
      )}
      {Object.values(r.loot).some((x) => x >= 1) && (
        <p class="small">{t('defense.reportLoot', { list: lootList(t, lang, r.loot) })}</p>
      )}
      {r.damaged.length > 0 && (
        <p class="small">
          {t('defense.reportDamaged', {
            list: r.damaged.map((d) => t(`buildings.${d.type}.name`)).join(', '),
          })}
        </p>
      )}
      {r.pathsLost > 0 && <p class="small">{t('defense.reportPaths', { count: r.pathsLost })}</p>}
      {r.injured.length > 0 && (
        <p class="small">
          {t('defense.reportHurt', { names: r.injured.map((k) => k.name).join(', ') })}
        </p>
      )}
      {r.dead.length > 0 && (
        <p class="small warn">
          {t('defense.reportDead', { names: r.dead.map((k) => k.name).join(', ') })}
        </p>
      )}
      {r.log && (
        <button class="btn btn-small" onClick={() => actions.replayBattle(r.id)}>
          {t('battle.watch')}
        </button>
      )}
    </li>
  );
}

/**
 * Chantier 31: what can still be done before the strike — every wave has several answers.
 * Shelter has its own box below.
 */
function WaveActions({ game, f }: { game: GameState; f: WaveForecast }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const leaks = !f.expected.victory;
  const fromReserves = RESOURCE_IDS.some((id) => f.expected.lootReserve[id] > 0);
  const collectable = reserveHolders(game).some((b) => canCollect(game, b));
  const damaged = game.buildings.filter((b) => b.damaged).length;
  const room = turretLimit(game) - turretCount(game);
  const items: { key: string; text: string; act?: () => void; label?: string }[] = [];
  if (collectable && (fromReserves || leaks))
    items.push({
      key: 'collect',
      text: fromReserves
        ? t('defense.actions.collectLoot', { list: lootList(t, lang, f.expected.lootReserve) })
        : t('defense.actions.collect'),
      act: () => actions.collect(null),
      label: t('defense.actions.collectGo'),
    });
  if (f.defense.ammo.share < 1)
    items.push({
      key: 'ammo',
      text: t('defense.actions.ammo', {
        missing: Math.ceil(f.defense.ammo.need - f.defense.ammo.have),
      }),
    });
  // Chantier 36: a pack whose gate no turret reaches runs in unopposed.
  for (const g of uncoveredGates(game, f.wave))
    items.push({
      key: `gate-${g.sector}-${g.side}`,
      text: t(g.side === 'air' ? 'battle.gateAir' : 'battle.gateGround', {
        sector: t(`defense.sectors.${g.sector}`).toLowerCase(),
      }),
      act: () => uiStore.setState({ modal: 'plans', plansTab: 'buildings' }),
      label: t('defense.actions.turretGo'),
    });
  if (leaks) items.push({ key: 'guard', text: t('defense.actions.guard') });
  if (leaks && room > 0)
    items.push({
      key: 'turret',
      text: t('defense.actions.turret', { count: room }),
      act: () => uiStore.setState({ modal: 'plans', plansTab: 'buildings' }),
      label: t('defense.actions.turretGo'),
    });
  if (damaged > 0)
    items.push({ key: 'repair', text: t('defense.actions.repair', { count: damaged }) });
  if (items.length === 0) return null;
  return (
    <section class="wave-actions">
      <h4>{t('defense.actions.title')}</h4>
      <ul>
        {items.map((i) => (
          <li key={i.key} class="small">
            <span>{i.text}</span>
            {i.act && (
              <button type="button" class="btn btn-small" onClick={i.act}>
                {i.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DefenseModal() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game);
  const now = useUi((s) => s.now);
  if (!game) return null;
  const close = () => uiStore.setState({ modal: 'none' });
  const f = forecastWave(game);
  const th = game.threats;
  const n = (x: number) => formatNumber(lang, one(x));
  const protectedNow =
    nest(game).level < THREATS.protectionNestLevel || now < game.createdAt + THREATS.protectionMs;
  const expected = f?.expected;
  const consequences: string[] = [];
  if (f && expected && !expected.victory) {
    if (f.sheltered) consequences.push(t('defense.sheltered'));
    if (expected.damaged > 0) consequences.push(t('defense.damaged', { count: expected.damaged }));
    consequences.push(t('defense.loot', { list: lootList(t, lang, expected.loot) }));
    if (expected.injured > 0) consequences.push(t('defense.injured', { count: expected.injured }));
    if (expected.deaths > 0) consequences.push(t('defense.deaths'));
  }
  return (
    <Modal title={t('defense.title')} onClose={close} class="modal-defense">
      {f ? (
        <>
          <p class={`defense-head odds-${f.odds}`}>
            {t('defense.strikesIn', { duration: formatDuration(lang, f.wave.at - now) })}{' '}
            <strong>{t(`defense.odds.${f.odds}`)}</strong>
          </p>
          <div class="side-cards">
            <SideCard
              side="ground"
              threat={f.threat.ground}
              defense={f.defense.ground}
              holds={f.expected.victory}
              parts={[
                t('defense.turrets', { value: n(f.defense.turrets.ground) }),
                t('defense.garrison', { value: n(f.defense.garrison.ground) }),
                t('defense.militia', { value: n(f.defense.militia) }),
              ]}
            />
            <SideCard
              side="air"
              threat={f.threat.air}
              defense={f.defense.air}
              holds={f.expected.victory}
              parts={[
                t('defense.turrets', { value: n(f.defense.turrets.air) }),
                t('defense.garrison', { value: n(f.defense.garrison.air) }),
              ]}
            />
          </div>
          {f.defense.ammo.need > 0 && (
            <p class={`small ${f.defense.ammo.share < 1 ? 'warn' : 'muted'}`}>
              {f.defense.ammo.share < 1
                ? t('defense.ammoShort', { share: Math.round(f.defense.ammo.share * 100) })
                : t('defense.ammo', {
                    have: Math.floor(f.defense.ammo.have),
                    need: f.defense.ammo.need,
                  })}
            </p>
          )}
          <p class="small">
            {t('defense.expected')}{' '}
            {expected?.victory ? t('defense.expectedWin') : consequences.join(' · ')}
          </p>
          <WavePlan f={f} />
          <WaveActions game={game} f={f} />
          <div class="shelter-box">
            <button
              class="btn btn-primary"
              disabled={!f.canShelter}
              onClick={() => actions.dispatch({ type: 'shelter' })}
            >
              {t('defense.shelter')}
            </button>
            <p class="small muted">
              {f.sheltered
                ? t('defense.shelterOn', { duration: formatDuration(lang, SHELTER.afterMs) })
                : `${t('defense.shelterHint')} ${f.canShelter ? '' : t('defense.shelterFrom', { duration: formatDuration(lang, SHELTER.beforeMs) })}`}
            </p>
          </div>
        </>
      ) : (
        <p class="small">
          {protectedNow
            ? t('defense.protected')
            : th.shieldUntil > now
              ? t('defense.shield', { duration: formatDuration(lang, th.shieldUntil - now) })
              : t('defense.noWave')}
        </p>
      )}
      <SectorTable game={game} />
      <PostureChoice game={game} />
      <GarrisonPicker game={game} />
      <section class="field">
        <h3>{t('defense.reports')}</h3>
        {th.reports.length === 0 ? (
          <p class="small muted">{t('defense.noReports')}</p>
        ) : (
          <ul class="wave-reports">
            {[...th.reports].reverse().map((r) => (
              <ReportItem key={r.id} r={r} now={now} t={t} />
            ))}
          </ul>
        )}
      </section>
      {th.incidents.length > 0 && (
        <section class="field">
          <h3>{t('defense.incidents')}</h3>
          <ul class="incident-list">
            {[...th.incidents].reverse().map((i) => (
              <li key={i.at} class="small">
                {t('defense.incidentLine', {
                  ago: formatDuration(lang, now - i.at),
                  text:
                    i.kind === 'storm'
                      ? t('threats.incident.storm', { amount: i.amount })
                      : i.blocked
                        ? t(`threats.incident.${i.kind}Blocked`)
                        : t(`threats.incident.${i.kind}`, {
                            amount: i.amount,
                            resource: `@resources.${i.resource ?? 'pulp'}`,
                          }),
                })}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  );
}
