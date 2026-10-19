import { useEffect, useRef, useState } from 'preact/hooks';
import { bindingSchema, type SoundBinding } from '../audio/binding';
import { BUILTIN_FILES } from '../audio/builtin';
import {
  defaultBinding,
  eventMeta,
  SOUND_EVENT_IDS,
  type EventGroup,
  type SoundEventId,
} from '../audio/catalog';
import { audio } from '../audio/engine';
import { SYNTH_PRESET_IDS } from '../audio/synth';
import type { AdminContext } from './AdminApp';
import { sourceLabel } from './SoundsTab';
import type { AdminStrings } from './strings';

const GROUPS: EventGroup[] = ['ui', 'build', 'colony', 'expedition', 'ambience', 'music'];

/** Event list + editor of the selected event's binding. */
export function BindingsTab({ ctx }: { ctx: AdminContext }) {
  const { s, manifest } = ctx;
  const wide = window.matchMedia?.('(min-width: 800px)').matches ?? true;
  const [selected, setSelected] = useState<SoundEventId | null>(wide ? 'ui.click' : null);

  return (
    <div class={`admin-bindings ${selected ? 'has-selection' : ''}`}>
      <aside class="event-list parchment admin-card">
        <h2>{s.bindings.events}</h2>
        {GROUPS.map((group) => (
          <div key={group} class="event-group">
            <h3>{s.groups[group]}</h3>
            {SOUND_EVENT_IDS.filter((id) => eventMeta(id).group === group).map((id) => (
              <button
                key={id}
                class={`event-item ${id === selected ? 'is-selected' : ''}`}
                aria-pressed={id === selected}
                onClick={() => setSelected(id)}
              >
                <span class="event-label">{s.events[id]}</span>
                <span class="event-id">
                  {id}
                  {manifest.bindings[id] && <em class="badge">{s.bindings.custom}</em>}
                  {eventMeta(id).reserved && (
                    <em class="badge badge-muted">{s.bindings.reserved}</em>
                  )}
                </span>
              </button>
            ))}
          </div>
        ))}
      </aside>
      {selected && (
        <BindingEditor key={selected} ctx={ctx} id={selected} onBack={() => setSelected(null)} />
      )}
    </div>
  );
}

function BindingEditor({
  ctx,
  id,
  onBack,
}: {
  ctx: AdminContext;
  id: SoundEventId;
  onBack(): void;
}) {
  const { s, manifest } = ctx;
  const meta = eventMeta(id);
  const [draft, setDraft] = useState<SoundBinding>(manifest.bindings[id] ?? defaultBinding(id));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const pending = useRef<SoundBinding | null>(null);
  const timer = useRef(0);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const save = async () => {
    window.clearTimeout(timer.current);
    const b = pending.current;
    pending.current = null;
    if (!b) return;
    const ok = await ctxRef.current.run((r) => r.saveBinding(id, b));
    setStatus(ok ? 'saved' : 'idle');
  };
  // Flush a pending change when switching event.
  useEffect(
    () => () => {
      void save();
    },
    [],
  );

  const update = (patch: Partial<SoundBinding>) => {
    const parsed = bindingSchema.safeParse({ ...draft, ...patch });
    if (!parsed.success) return;
    setDraft(parsed.data);
    pending.current = parsed.data;
    setStatus('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 500);
  };

  const reset = async () => {
    window.clearTimeout(timer.current);
    pending.current = null;
    setDraft(defaultBinding(id));
    const ok = await ctx.run((r) => r.saveBinding(id, null));
    setStatus(ok ? 'saved' : 'idle');
  };

  const assetName = (ref: string) => manifest.assets.find((a) => `asset:${a.id}` === ref)?.name;
  const available = [
    ...manifest.assets.map((a) => `asset:${a.id}`),
    ...BUILTIN_FILES.map((f) => `builtin:${f}`),
    ...SYNTH_PRESET_IDS.map((p) => `synth:${p}`),
  ].filter((ref) => !draft.sources.includes(ref));

  const c = draft.conditions;
  return (
    <section class="binding-editor parchment admin-card">
      <button class="btn btn-small back-btn" onClick={onBack}>
        ← {s.bindings.back}
      </button>
      <header class="editor-head">
        <div>
          <h2>{s.events[id]}</h2>
          <p class="small muted">
            <code>{id}</code> · {s.bindings.bus.replace('{bus}', meta.bus)}
            {meta.reserved && ` · ${s.bindings.reservedHint}`}
          </p>
        </div>
        <span class={`save-status small ${status}`}>
          {status === 'saving' ? s.bindings.saving : status === 'saved' ? s.bindings.saved : ''}
        </span>
      </header>

      <div class="row">
        <button
          class="btn btn-primary"
          disabled={draft.sources.length === 0}
          onClick={() => audio.preview(draft, meta.bus)}
        >
          ▶ {s.bindings.test}
        </button>
        <button class="btn" disabled={!manifest.bindings[id]} onClick={() => void reset()}>
          {s.bindings.reset}
        </button>
      </div>

      <Toggle
        label={s.bindings.enabled}
        value={draft.enabled}
        onChange={(v) => update({ enabled: v })}
      />

      <div class="field">
        <h3>{s.bindings.sources}</h3>
        {draft.sources.length === 0 && <p class="small muted">{s.bindings.noSource}</p>}
        <div class="source-chips">
          {draft.sources.map((ref) => (
            <span key={ref} class="source-chip">
              <button
                class="chip-play"
                aria-label={s.sounds.play}
                onClick={() => audio.preview(draft, meta.bus, ref)}
              >
                ▶ {sourceLabel(ref, assetName(ref))}
              </button>
              <button
                class="chip-remove"
                aria-label={s.sounds.remove}
                onClick={() => update({ sources: draft.sources.filter((x) => x !== ref) })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <select
          class="input"
          value=""
          onChange={(e) => {
            const ref = e.currentTarget.value;
            if (ref) update({ sources: [...draft.sources, ref] });
            e.currentTarget.value = '';
          }}
        >
          <option value="">{s.bindings.addSource}</option>
          {available.map((ref) => (
            <option key={ref} value={ref}>
              {sourceLabel(ref, assetName(ref))}
            </option>
          ))}
        </select>
      </div>

      <div class="param-grid">
        <Num s={s} k="volume" v={draft.volume} min={0} max={2} step={0.05} on={update} />
        <Num s={s} k="pitch" v={draft.pitch} min={-24} max={24} step={0.5} on={update} />
        <Num
          s={s}
          k="pitchVariation"
          v={draft.pitchVariation}
          min={0}
          max={12}
          step={0.1}
          on={update}
        />
        <Num s={s} k="probability" v={draft.probability} min={0} max={1} step={0.05} on={update} />
        <Num
          s={s}
          k="cooldownMs"
          v={draft.cooldownMs}
          min={0}
          max={600000}
          slider={10000}
          step={10}
          on={update}
        />
        <Num s={s} k="maxVoices" v={draft.maxVoices} min={1} max={16} step={1} on={update} />
        <Num
          s={s}
          k="fadeInMs"
          v={draft.fadeInMs}
          min={0}
          max={20000}
          slider={10000}
          step={50}
          on={update}
        />
        <Num
          s={s}
          k="fadeOutMs"
          v={draft.fadeOutMs}
          min={0}
          max={20000}
          slider={10000}
          step={50}
          on={update}
        />
      </div>

      <Toggle label={s.bindings.loop} value={draft.loop} onChange={(v) => update({ loop: v })} />
      <Toggle
        label={s.bindings.spatial}
        value={draft.spatial}
        onChange={(v) => update({ spatial: v })}
      />

      <div class="field">
        <h3>{s.bindings.conditions}</h3>
        <div class="param-grid">
          <Num
            s={s}
            k="zoomMin"
            v={c.zoomMin}
            min={0}
            max={1}
            step={0.05}
            on={(p) => update({ conditions: { ...c, ...p } })}
          />
          <Num
            s={s}
            k="zoomMax"
            v={c.zoomMax}
            min={0}
            max={1}
            step={0.05}
            on={(p) => update({ conditions: { ...c, ...p } })}
          />
        </div>
        <label class="param">
          <span>{s.bindings.timeOfDay}</span>
          <select
            class="input"
            value={c.timeOfDay}
            onChange={(e) =>
              update({
                conditions: {
                  ...c,
                  timeOfDay: e.currentTarget.value as SoundBinding['conditions']['timeOfDay'],
                },
              })
            }
          >
            {(['any', 'day', 'night'] as const).map((v) => (
              <option key={v} value={v}>
                {s.bindings[v]}
              </option>
            ))}
          </select>
        </label>
        <label class="param">
          <span>{s.bindings.seasons}</span>
          <input
            class="input"
            value={c.seasons.join(', ')}
            onChange={(e) =>
              update({
                conditions: {
                  ...c,
                  seasons: e.currentTarget.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean)
                    .slice(0, 8),
                },
              })
            }
          />
        </label>
        <p class="small muted">{s.bindings.conditionsHint}</p>
      </div>
    </section>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange(v: boolean): void;
}) {
  return (
    <label class="check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.currentTarget.checked)} />
      {label}
    </label>
  );
}

type NumKey =
  | 'volume'
  | 'pitch'
  | 'pitchVariation'
  | 'probability'
  | 'cooldownMs'
  | 'maxVoices'
  | 'fadeInMs'
  | 'fadeOutMs'
  | 'zoomMin'
  | 'zoomMax';

/** Slider + exact number input; `slider` caps the slider range below the allowed max. */
function Num({
  s,
  k,
  v,
  min,
  max,
  step,
  slider,
  on,
}: {
  s: AdminStrings;
  k: NumKey;
  v: number;
  min: number;
  max: number;
  step: number;
  slider?: number;
  on(patch: Record<string, number>): void;
}) {
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  const set = (raw: string) => {
    const x = Number(raw);
    if (Number.isFinite(x)) on({ [k]: clamp(Number.isInteger(step) ? Math.round(x) : x) });
  };
  return (
    <label class="param">
      <span>{s.bindings[k]}</span>
      <div class="param-inputs">
        <input
          type="range"
          min={min}
          max={slider ?? max}
          step={step}
          value={Math.min(v, slider ?? max)}
          onInput={(e) => set(e.currentTarget.value)}
        />
        <input
          class="input num"
          type="number"
          min={min}
          max={max}
          step={step}
          value={v}
          onChange={(e) => set(e.currentTarget.value)}
        />
      </div>
    </label>
  );
}
