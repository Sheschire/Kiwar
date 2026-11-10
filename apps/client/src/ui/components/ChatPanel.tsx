import { useEffect, useRef, useState } from 'preact/hooks';
import { mutedUsers, type BattleLine, type ChatMessage, type FeatLine } from '../../game/chat';
import { featName } from './LeagueModal';
import { chatActions } from '../chatActions';
import { CloseIcon, TrophyIcon } from '../icons';
import { useT, useUi } from '../store';

const timeOf = (m: ChatMessage | FeatLine | BattleLine): string =>
  'at' in m ? m.at : m.created_at;

/** Team chat of the current shared universe. */
export function ChatPanel() {
  const t = useT();
  const open = useUi((s) => s.chatOpen);
  const chat = useUi((s) => s.chat);
  const feats = useUi((s) => s.chatFeats);
  const battles = useUi((s) => s.chatBattles);
  const universe = useUi((s) => s.universe);
  // Chantier 56: the feats of the league fall between the messages, by time.
  const messages: (
    ChatMessage | (FeatLine & { kind: 'feat' }) | (BattleLine & { kind: 'battle' })
  )[] = [
    ...chat,
    ...feats.map((f) => ({ ...f, kind: 'feat' as const })),
    // Chantier 57: the battles between players too.
    ...battles.map((b) => ({ ...b, kind: 'battle' as const })),
  ].sort((a, b) => Date.parse(timeOf(a)) - Date.parse(timeOf(b)));
  const me = useUi((s) => s.account?.userId);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const muted = mutedUsers();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, open]);

  if (!open) return null;
  const send = async () => {
    if (!text.trim()) return;
    if (await chatActions.send(text)) setText('');
  };

  return (
    <aside class="chat parchment pe" aria-label={t('chat.title')}>
      <header class="sheet-header">
        <h2>{t('chat.title')}</h2>
        <button
          class="btn btn-icon btn-ghost"
          aria-label={t('common.close')}
          onClick={() => chatActions.open(false)}
        >
          <CloseIcon />
        </button>
      </header>
      <ul class="chat-list" ref={listRef}>
        {messages.length === 0 && <li class="muted small">{t('chat.empty')}</li>}
        {messages.map((m) => {
          if ('kind' in m && m.kind === 'battle')
            return (
              <li key={`battle-${m.id}`} class="chat-feat small">
                <span class="pvp-tag">{t('pvp.tag')}</span>{' '}
                {t(`pvp.chat.${m.outcome}`, {
                  attacker: m.attacker_name,
                  defender: m.defender_name,
                  loot: m.loot,
                })}
              </li>
            );
          if ('kind' in m) {
            const name = universe?.members.find((x) => x.userId === m.user_id)?.displayName ?? '?';
            return (
              <li key={`feat-${m.id}`} class="chat-feat small">
                <TrophyIcon size={16} /> {t('league.chat', { name, feat: featName(t, m.feat) })}
                {m.points > 0 && (
                  <span class="muted"> · {t('league.points', { points: m.points })}</span>
                )}
              </li>
            );
          }
          const hidden = muted.includes(m.user_id);
          const mine = m.user_id === me;
          return (
            <li key={m.id} class={`chat-msg ${mine ? 'mine' : ''}`}>
              <button
                class="chat-author"
                onClick={() => setMenu(menu === m.id ? null : m.id)}
                disabled={mine}
              >
                {m.display_name}
              </button>
              <span class="chat-time small muted">
                {new Date(m.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <p class={hidden ? 'muted small' : ''}>{hidden ? t('chat.mutedHidden') : m.body}</p>
              {menu === m.id && !mine && (
                <div class="row">
                  <button
                    class="btn btn-small"
                    onClick={() => (chatActions.mute(m.user_id, !hidden), setMenu(null))}
                  >
                    {hidden ? t('chat.unmute') : t('chat.mute')}
                  </button>
                  <button
                    class="btn btn-small"
                    onClick={() => (void chatActions.report(m.id), setMenu(null))}
                  >
                    {t('chat.report')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <form
        class="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          class="input"
          maxLength={280}
          placeholder={t('chat.placeholder')}
          value={text}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
        />
        <button class="btn btn-primary" type="submit" disabled={!text.trim()}>
          {t('chat.send')}
        </button>
      </form>
    </aside>
  );
}
