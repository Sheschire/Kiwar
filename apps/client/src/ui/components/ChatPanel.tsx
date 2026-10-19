import { useEffect, useRef, useState } from 'preact/hooks';
import { mutedUsers } from '../../game/chat';
import { chatActions } from '../chatActions';
import { CloseIcon } from '../icons';
import { useT, useUi } from '../store';

/** Team chat of the current shared universe. */
export function ChatPanel() {
  const t = useT();
  const open = useUi((s) => s.chatOpen);
  const messages = useUi((s) => s.chat);
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
