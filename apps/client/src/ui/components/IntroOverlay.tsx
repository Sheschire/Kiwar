import { useEffect } from 'preact/hooks';
import { BIOMES, FACES, RESOURCE_IDS, SEASONS, type BiomeId, type ResourceId } from '@kiwar/shared';
import { ResourceIcon } from '../icons';
import { chooseIntro, focusIntro, setIntroLayout, skipIntro } from '../intro';
import { useT, useUi } from '../store';

/** Characteristics of a biome read from its data, so the numbers never drift. */
function useTraits(biome: BiomeId): string[] {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const fmt = new Intl.NumberFormat(lang, { maximumFractionDigits: 2 });
  const v = (x: number) => fmt.format(x);
  const b = BIOMES[biome];
  const lines: string[] = [];
  const perResource = (
    table: Partial<Record<ResourceId, number>>,
    all: 'intro.traits.stockAll' | 'intro.traits.regenAll',
    one: 'intro.traits.stock' | 'intro.traits.regen',
  ) => {
    const values = RESOURCE_IDS.map((id) => table[id] ?? 1);
    if (values.every((x) => x === values[0]) && values[0] !== 1)
      lines.push(t(all, { value: v(values[0]!) }));
    else
      for (const id of RESOURCE_IDS)
        if ((table[id] ?? 1) !== 1)
          lines.push(t(one, { resource: `@resources.${id}`, value: v(table[id]!) }));
  };
  perResource(b.deposits.stock, 'intro.traits.stockAll', 'intro.traits.stock');
  perResource(b.deposits.regen, 'intro.traits.regenAll', 'intro.traits.regen');
  if (b.walk !== 1) lines.push(t('intro.traits.walk', { value: v(b.walk) }));
  for (const season of SEASONS) {
    const extra = b.seasons[season];
    if (!extra) continue;
    const parts: string[] = [];
    for (const [id, x] of Object.entries(extra.harvest ?? {}))
      parts.push(t('intro.traits.harvestPart', { resource: `@resources.${id}`, value: v(x) }));
    for (const [id, x] of Object.entries(extra.regen ?? {}))
      parts.push(
        id === 'all'
          ? t('intro.traits.regenPart', { value: v(x) })
          : t('intro.traits.regenOnePart', { resource: `@resources.${id}`, value: v(x) }),
      );
    if (extra.walk) parts.push(t('intro.traits.walkPart', { value: v(extra.walk) }));
    lines.push(
      t('intro.traits.season', {
        season: t(`cycles.seasons.${season}`),
        effects: parts.join(', '),
      }),
    );
  }
  if (b.floods)
    lines.push(t('intro.traits.floods', { season: t(`cycles.seasons.${b.floods}`).toLowerCase() }));
  if (b.threats.ferrets !== 1)
    lines.push(t('intro.traits.ferrets', { value: v(b.threats.ferrets) }));
  if (b.threats.bats !== 1) lines.push(t('intro.traits.bats', { value: v(b.threats.bats) }));
  return lines;
}

/**
 * Intro overlay (chantier 05): a skip hint while the kiwi is sliced, then the choice of a
 * face — side panel on desktop, bottom sheet on phones — and a short fade into the game.
 */
export function IntroOverlay() {
  const t = useT();
  const intro = useUi((s) => s.intro);
  const fade = useUi((s) => s.introFade);

  useEffect(() => {
    if (!intro) return;
    const layout = () => setIntroLayout(window.innerWidth, window.innerHeight);
    layout();
    window.addEventListener('resize', layout);
    return () => window.removeEventListener('resize', layout);
  }, [intro !== null]);

  if (!intro) return fade ? <div class="intro-fade" /> : null;
  const face = intro.focus;
  const biome = intro.biomes[face];
  const taken = intro.taken[face];
  const replay = intro.mode === 'replay';

  return (
    <div class={`intro intro-${intro.phase}`}>
      {intro.phase === 'playing' && (
        <>
          <div class="intro-flash" />
          <button class="btn intro-skip pe" onClick={skipIntro}>
            {t('intro.skip')}
          </button>
        </>
      )}
      {intro.phase !== 'playing' && (
        <aside class="intro-panel parchment pe" aria-label={t('intro.title')}>
          <div class="intro-head">
            <h2>{t(replay ? 'intro.replayTitle' : 'intro.title')}</h2>
            <div class="segmented intro-tabs" role="tablist">
              {FACES.map((f) => (
                <button
                  key={f}
                  role="tab"
                  aria-selected={f === face}
                  class={`btn ${f === face ? 'btn-active' : ''}`}
                  onClick={() => focusIntro(f, true)}
                >
                  <strong>{t(`faces.${f}`)}</strong>
                  <span class="small">{t(`biomes.${intro.biomes[f]}.name`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div class="intro-body">
            <p class="small muted">{t(`intro.faces.${face}`)}</p>
            <h3>{t(`biomes.${biome}.name`)}</h3>
            <p class="intro-tagline">{t(`biomes.${biome}.tagline`)}</p>
            {taken && <p class="small warn">{t('intro.taken', { name: taken })}</p>}
            {replay && intro.current === face && <p class="small bonus">{t('intro.yours')}</p>}
            <ul class="intro-gauges">
              {RESOURCE_IDS.map((id) => (
                <li key={id}>
                  <ResourceIcon id={id} size={16} />
                  <span class="small">{t(`resources.${id}`)}</span>
                  <span class="progress">
                    <span style={{ width: `${Math.round(intro.gauges[face][id] * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            <div class="intro-traits">
              <p>
                <strong class="bonus">{t('intro.pros')}</strong> {t(`biomes.${biome}.pros`)}
              </p>
              <p>
                <strong class="warn">{t('intro.cons')}</strong> {t(`biomes.${biome}.cons`)}
              </p>
              <p>
                <strong>{t('intro.style')}</strong> {t(`biomes.${biome}.style`)}
              </p>
              <Traits biome={biome} />
            </div>
            <p class="small muted">{t('intro.fair')}</p>
          </div>
          <div class="intro-actions">
            <button
              class="btn btn-primary"
              disabled={intro.phase !== 'choice' || (!replay && !!taken)}
              onClick={chooseIntro}
            >
              {replay ? t('intro.back') : t('intro.choose', { face: t(`faces.${face}`) })}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

function Traits({ biome }: { biome: BiomeId }) {
  const lines = useTraits(biome);
  if (lines.length === 0) return null;
  return (
    <ul class="tip-list small">
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
