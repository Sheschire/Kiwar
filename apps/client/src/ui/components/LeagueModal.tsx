import { useEffect, useState } from 'preact/hooks';
import {
  featPoints,
  featRarity,
  featsOf,
  LEAGUE_COSMETICS,
  nextTiers,
  parseFeatKey,
  rankSeason,
  type FeatKey,
  type GameState,
  type LeagueCosmetic,
  type LeagueFeat,
  type LeagueTitle,
  type LeagueView,
  type UniverseInfo,
} from '@kiwar/shared';
import { formatDuration, formatNumber, type Lang } from '../../i18n/i18n';
import { actions } from '../actions';
import { uiStore, useT, useUi, type Translate } from '../store';
import { Modal } from './Modal';

/**
 * Chantier 56: the League screen — the season's ranking and its time left, the feats passed
 * and the next steps, every member's record and titles, and the podium's cosmetic. In solo,
 * only the colony's own feats (read from its state, no points).
 */

/** The name of a feat (`wavesHeld:40` → "40 waves held"). */
export function featName(t: Translate, key: FeatKey): string {
  const parsed = parseFeatKey(key);
  if (!parsed) return key;
  return t(`league.feats.${parsed.id}`, parsed.tier === null ? undefined : { n: parsed.tier });
}

export function titleName(t: Translate, title: Pick<LeagueTitle, 'rank' | 'season'>): string {
  const key = title.rank === 1 ? 'title1' : title.rank === 2 ? 'title2' : 'title3';
  return t(`league.${key}`, { n: title.season });
}

const MEDALS = ['🥇', '🥈', '🥉'];

function FeatRow(props: { feat: FeatKey; points?: number; at?: number; past?: boolean }) {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const rarity = featRarity(props.feat);
  return (
    <li class={`league-feat rarity-${rarity}`}>
      <span class="league-feat-name">{featName(t, props.feat)}</span>
      <span class="small muted">
        {props.past
          ? t('league.beforeLeagues')
          : props.at
            ? new Date(props.at).toLocaleDateString(lang)
            : t(`league.rarity.${rarity}`)}
      </span>
      {props.points !== undefined && props.points > 0 && (
        <span class="league-points">{t('league.points', { points: props.points })}</span>
      )}
    </li>
  );
}

function NextSteps(props: { game: GameState }) {
  const t = useT();
  const next = nextTiers(props.game);
  if (next.length === 0) return null;
  return (
    <section class="field">
      <h3>{t('league.next')}</h3>
      <ul class="league-feats">
        {next.map((n) => (
          <li key={n.key} class={`league-feat rarity-${featRarity(n.key)}`}>
            <span class="league-feat-name">{featName(t, n.key)}</span>
            <span class="progress league-progress">
              <span style={{ width: `${Math.min(100, (n.value / n.target) * 100)}%` }} />
            </span>
            <span class="small muted">
              {t('league.progress', { value: n.value, target: n.target })}
            </span>
            <span class="league-points">{t('league.points', { points: featPoints(n.key) })}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Solo: the colony's own feats, read from its state. */
function SoloFeats(props: { game: GameState }) {
  const t = useT();
  const feats = featsOf(props.game);
  return (
    <>
      <p class="small muted">{t('league.soloHint')}</p>
      <section class="field">
        <h3>{t('league.passed')}</h3>
        {feats.length === 0 ? (
          <p class="small muted">{t('league.none')}</p>
        ) : (
          <ul class="league-feats">
            {feats.map((f) => (
              <FeatRow key={f} feat={f} />
            ))}
          </ul>
        )}
      </section>
      <NextSteps game={props.game} />
    </>
  );
}

function nameOf(universe: UniverseInfo, userId: string): string {
  return universe.members.find((m) => m.userId === userId)?.displayName ?? '?';
}

function SeasonTab(props: {
  view: LeagueView;
  universe: UniverseInfo;
  me: string | undefined;
  lang: Lang;
  onChange: (view: LeagueView) => void;
}) {
  const t = useT();
  const { view, universe, me } = props;
  const ranking = rankSeason(view.feats.filter((f) => f.season === view.season.n));
  return (
    <>
      <section class="field">
        <div class="row league-season-head">
          <strong>{t('league.season', { n: view.season.n })}</strong>
          <span class="small muted">
            {t('league.endsIn', {
              time: formatDuration(props.lang, Math.max(0, view.season.endsAt - view.now)),
            })}
          </span>
        </div>
        <p class="small muted">{t('league.resetHint')}</p>
      </section>
      <Reward view={view} me={me} onChange={props.onChange} />
      <section class="field">
        {ranking.length === 0 ? (
          <p class="small muted">{t('league.noPoints')}</p>
        ) : (
          <ol class="league-ranking">
            {ranking.map((r, i) => (
              <li key={r.userId} class={r.userId === me ? 'is-me' : ''}>
                <span class="league-rank">{MEDALS[i] ?? `${i + 1}.`}</span>
                <span class="league-name">
                  {nameOf(universe, r.userId)}
                  {r.userId === me && <span class="small muted"> ({t('league.you')})</span>}
                </span>
                <span class="small muted">{t('league.featsCount', { count: r.feats })}</span>
                <span class="league-points">
                  {t('league.points', { points: formatNumber(props.lang, r.points) })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

/** A podium's pick, then what the colony shows. */
function Reward(props: {
  view: LeagueView;
  me: string | undefined;
  onChange: (view: LeagueView) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const mine = props.view.titles.filter((x) => x.userId === props.me);
  if (mine.length === 0) return null;
  const toPick = mine.find((x) => !x.cosmetic);
  const picked = [...new Set(mine.map((x) => x.cosmetic).filter((c): c is LeagueCosmetic => !!c))];
  const worn = new Set(props.view.players.find((p) => p.userId === props.me)?.worn ?? []);
  const run = async (change: Parameters<typeof actions.league>[0]) => {
    setBusy(true);
    const next = await actions.league(change);
    setBusy(false);
    if (next) props.onChange(next);
  };
  return (
    <section class="field league-reward">
      <h3>{t('league.rewardTitle')}</h3>
      <ul class="league-titles">
        {mine.map((x) => (
          <li key={x.season}>
            {MEDALS[x.rank - 1]} {titleName(t, x)}
          </li>
        ))}
      </ul>
      {toPick && (
        <>
          <p class="small">{t('league.rewardPick', { n: toPick.season })}</p>
          <div class="league-cosmetics">
            {LEAGUE_COSMETICS.map((c) => (
              <button
                key={c}
                class="btn"
                disabled={busy}
                onClick={() => void run({ reward: { season: toPick.season, cosmetic: c } })}
              >
                {t(`league.cosmetics.${c}`)}
              </button>
            ))}
          </div>
        </>
      )}
      {picked.length > 0 && (
        <div class="league-worn">
          <span class="small muted">{t('league.wear')}</span>
          {picked.map((c) => (
            <label key={c} class="check">
              <input
                type="checkbox"
                checked={worn.has(c)}
                disabled={busy}
                onChange={() =>
                  void run({
                    worn: worn.has(c) ? [...worn].filter((x) => x !== c) : [...worn, c],
                  })
                }
              />
              {t(`league.cosmetics.${c}`)}
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function FeatList(props: { feats: LeagueFeat[] }) {
  const t = useT();
  if (props.feats.length === 0) return <p class="small muted">{t('league.none')}</p>;
  const sorted = [...props.feats].sort((a, b) => b.at - a.at);
  return (
    <ul class="league-feats">
      {sorted.map((f) => (
        <FeatRow key={f.feat} feat={f.feat} points={f.points} at={f.at} past={f.season === 0} />
      ))}
    </ul>
  );
}

function RecordTab(props: { view: LeagueView; universe: UniverseInfo; me: string | undefined }) {
  const t = useT();
  const members = [...props.universe.members].sort(
    (a, b) => Number(b.userId === props.me) - Number(a.userId === props.me),
  );
  return (
    <>
      {members.map((m) => {
        const titles = props.view.titles.filter((x) => x.userId === m.userId);
        const feats = props.view.feats.filter((f) => f.userId === m.userId);
        return (
          <details key={m.userId} class="field league-member" open={m.userId === props.me}>
            <summary>
              <strong>{m.displayName}</strong>{' '}
              <span class="small muted">{t('league.featsCount', { count: feats.length })}</span>
            </summary>
            {titles.length > 0 && (
              <ul class="league-titles">
                {titles.map((x) => (
                  <li key={x.season}>
                    {MEDALS[x.rank - 1]} {titleName(t, x)}
                  </li>
                ))}
              </ul>
            )}
            <FeatList feats={feats} />
          </details>
        );
      })}
    </>
  );
}

type Tab = 'season' | 'feats' | 'record';

export function LeagueModal() {
  const t = useT();
  const game = useUi((s) => s.slowGame);
  const universe = useUi((s) => s.universe);
  const me = useUi((s) => s.account?.userId);
  const lang = useUi((s) => s.lang);
  const [tab, setTab] = useState<Tab>('season');
  const [view, setView] = useState<LeagueView | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!universe) return;
    let live = true;
    void actions.league().then((v) => {
      if (!live) return;
      if (v) setView(v);
      else setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [universe?.id]);
  const close = () => uiStore.setState({ modal: 'none' });
  if (!game) return null;
  if (!universe) {
    return (
      <Modal title={t('league.soloTitle')} onClose={close} class="league-modal">
        <SoloFeats game={game} />
      </Modal>
    );
  }
  return (
    <Modal title={t('league.title')} onClose={close} class="league-modal">
      <div class="segmented" role="tablist">
        {(['season', 'feats', 'record'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            class={`btn ${tab === k ? 'btn-active' : ''}`}
            onClick={() => setTab(k)}
          >
            {t(
              k === 'season'
                ? 'league.tabSeason'
                : k === 'feats'
                  ? 'league.tabFeats'
                  : 'league.tabRecord',
            )}
          </button>
        ))}
      </div>
      {tab === 'feats' ? (
        <>
          <section class="field">
            <h3>{t('league.passed')}</h3>
            {view ? (
              <FeatList feats={view.feats.filter((f) => f.userId === me)} />
            ) : (
              <ul class="league-feats">
                {featsOf(game).map((f) => (
                  <FeatRow key={f} feat={f} />
                ))}
              </ul>
            )}
          </section>
          <NextSteps game={game} />
        </>
      ) : !view ? (
        <p class="small muted">{failed ? t('league.offline') : t('league.loading')}</p>
      ) : tab === 'season' ? (
        <SeasonTab view={view} universe={universe} me={me} lang={lang} onChange={setView} />
      ) : (
        <RecordTab view={view} universe={universe} me={me} />
      )}
    </Modal>
  );
}
