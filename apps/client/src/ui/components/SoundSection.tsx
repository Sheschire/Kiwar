import { BUSES } from '../../audio/catalog';
import { audio } from '../../audio/engine';
import { actions } from '../actions';
import { useT, useUi } from '../store';

const SLIDERS = ['master', ...BUSES] as const;

/** Volume sliders and mute switch of the settings modal. */
export function SoundSection() {
  const t = useT();
  const settings = useUi((s) => s.audio);
  return (
    <div class="field">
      <h3>{t('settings.sound')}</h3>
      <label class="check">
        <input
          type="checkbox"
          checked={settings.muted}
          onChange={(e) => actions.setAudio({ muted: e.currentTarget.checked })}
        />
        {t('settings.mute')}
      </label>
      <div class={`volumes ${settings.muted ? 'is-muted' : ''}`}>
        {SLIDERS.map((key) => (
          <label key={key} class="volume">
            <span>{t(`audio.${key}`)}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(settings[key] * 100)}
              disabled={settings.muted}
              onInput={(e) => actions.setAudio({ [key]: Number(e.currentTarget.value) / 100 })}
              // Let the player hear the level they just picked.
              onChange={() => {
                if (key === 'sfx') audio.play('harvest.gather');
                else if (key === 'ui' || key === 'master') audio.play('ui.click');
              }}
            />
            <output>{Math.round(settings[key] * 100)}</output>
          </label>
        ))}
      </div>
    </div>
  );
}
