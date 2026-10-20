import {
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
import { forecastWave } from '../derived';
import { formatDuration, formatNumber } from '../../i18n/i18n';
import { actions } from '../actions';
import { uiStore, useT, useUi, type Translate } from '../store';
import { KiwiPortrait } from './KiwiPortrait';
import { Modal } from './Modal';
import { useJobLabel } from './VillageModal';

const one = (x: number) => Math.round(x * 10) / 10;

/** Chantier 06: the HUD pill — a wave on its way, the shelter, or an unread report. */
export function ThreatBadge() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const game = useUi((s) => s.game);
  const now = useUi((s) => s.now);
  const unread = useUi((s) => s.unreadWave);
  if (!game) return null;
  const open = () => uiStore.setState({ modal: 'defense', unreadWave: null });
  const f = forecastWave(game);
  const shelter = game.threats.shelterUntil > now;
  if (!f && !shelter && !unread) return null;
  const odds = f?.odds ?? 'likely';
  return (
    <button class={`threat-badge parchment pe odds-${odds}`} onClick={open}>
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
        </span>
      ) : (
        <span>{t('defense.badgeReport')}</span>
      )}
    </button>
  );
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
}: {
  side: 'ground' | 'air';
  threat: number;
  defense: number;
  parts: string[];
}) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const max = Math.max(threat, defense, 1);
  const holds = defense >= threat;
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
            </li>
          );
        })}
      </ul>
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
      {!r.victory && (
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
    </li>
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
