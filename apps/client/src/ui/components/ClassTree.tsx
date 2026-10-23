import { CLASS_IDS, CLASSES, inLine, type ClassId, type Villager } from '@kiwar/shared';
import { useT, useUi } from '../store';
import { KiwiPortrait } from './KiwiPortrait';
import { classRequirements } from './ClassCourses';

const TIERS = [1, 2, 3] as const;
const TIER_NAMES = { 1: 'school', 2: 'advanced', 3: 'master' } as const;

/**
 * Chantier 37: the tree of classes for one kiwi — the School's classes, the advanced ones and
 * the masters, with the path it walked and, for every other class, what it still lacks (green
 * when met, red otherwise).
 */
export function ClassTree({ v }: { v: Villager }) {
  const t = useT();
  const game = useUi((s) => s.game)!;
  // Classes the kiwi's class comes from (its path in the tree).
  const walked = (c: ClassId) => !!v.classId && c !== v.classId && inLine(v.classId, c);
  return (
    <details class="field class-tree">
      <summary>
        <h3>{t('classTree.title')}</h3>
      </summary>
      <p class="small muted">{t('classTree.hint')}</p>
      {TIERS.map((tier) => (
        <section key={tier} class="tree-tier">
          <h4 class="small-title">
            {t('classInfo.tier', { tier })} · {t(`classTree.tiers.${TIER_NAMES[tier]}`)}
          </h4>
          <ul class="tree-nodes">
            {CLASS_IDS.filter((c) => CLASSES[c].tier === tier).map((c) => {
              const current = v.classId === c;
              const past = walked(c);
              const reqs = current || past ? [] : classRequirements(game, v, c, t);
              const open = !current && !past && reqs.every((r) => r.ok);
              return (
                <li
                  key={c}
                  class={`tree-node ${current ? 'is-current' : ''} ${past ? 'is-past' : ''} ${
                    open ? 'is-open' : ''
                  }`}
                >
                  <div class="tree-head">
                    <KiwiPortrait shiny={v.shiny} classId={c} seed={v.id} size={32} />
                    <span>
                      <strong>{t(`classes.${c}.name`)}</strong>
                      <span class="small muted">
                        {current
                          ? t('classTree.current')
                          : past
                            ? t('classTree.past')
                            : open
                              ? t('classTree.open')
                              : t('classTree.missing', {
                                  count: reqs.filter((r) => !r.ok).length,
                                })}
                      </span>
                    </span>
                  </div>
                  <span class="small muted">{t(`classes.${c}.desc`)}</span>
                  {reqs.length > 0 && (
                    <span class="req-list">
                      {reqs.map((r) => (
                        <span key={r.label} class={`small req ${r.ok ? 'bonus' : 'warn'}`}>
                          {r.label}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </details>
  );
}
