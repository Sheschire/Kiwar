import { AUTO_TASKS, taskNeeds, type AutoTask, type GameState } from '@kiwar/shared';
import { actions } from '../actions';
import { Icon, type IconName } from '../iconSet';
import { useT, useUi } from '../store';

/** Chantier 15: the glyph of each automatic task. */
const TASK_ICONS: Record<AutoTask, IconName> = {
  build: 'queue',
  research: 'research',
  meteor: 'target',
  stardust: 'stardust',
  repair: 'defenseGround',
  garrison: 'guard',
  redirect: 'storage',
  forge: 'forge',
  equip: 'guard',
};

/** How many tasks wait for the player (manual tasks with nobody on them). */
export function manualNeeds(game: GameState): number {
  const needs = taskNeeds(game);
  return AUTO_TASKS.filter((k) => !game.automation[k] && needs[k] > 0).length;
}

/**
 * Chantier 15: one switch per task of the automation (on by default). A manual task waits for
 * the player; a badge says when it has nobody.
 */
export function AutomationPanel() {
  const t = useT();
  const game = useUi((s) => s.game)!;
  const needs = taskNeeds(game);
  return (
    <div class="automation">
      <p class="small muted">{t('automation.intro')}</p>
      <ul class="automation-list">
        {AUTO_TASKS.map((task) => {
          const on = game.automation[task];
          const waiting = !on && needs[task] > 0;
          return (
            <li key={task} class={`automation-row ${waiting ? 'is-alert' : ''}`}>
              <Icon name={TASK_ICONS[task]} size={26} />
              <span class="automation-main">
                <strong>
                  {t(`automation.tasks.${task}.name`)}
                  {waiting && (
                    <span class="badge badge-alert">
                      {t('automation.waiting', { count: needs[task] })}
                    </span>
                  )}
                </strong>
                <span class="small muted">
                  {on ? t(`automation.tasks.${task}.auto`) : t(`automation.tasks.${task}.manual`)}
                </span>
              </span>
              <button
                class={`btn btn-small auto-switch ${on ? 'btn-active' : ''}`}
                role="switch"
                aria-checked={on}
                onClick={() => actions.dispatch({ type: 'setAutomation', task, on: !on })}
              >
                {on ? t('automation.on') : t('automation.off')}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
