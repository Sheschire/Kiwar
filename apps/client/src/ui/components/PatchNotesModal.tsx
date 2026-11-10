import { PATCH_NOTES } from '../../i18n/patchNotes';
import { markNotesSeen } from '../patchNotes';
import { uiStore, useT, useUi } from '../store';
import { Modal } from './Modal';

function formatDate(date: string, lang: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "What's new": the patch notes, newest first, the unread ones marked. */
export function PatchNotesModal() {
  const t = useT();
  const lang = useUi((s) => s.lang);
  const fresh = useUi((s) => s.patchNotesFresh);
  const close = () => {
    markNotesSeen();
    uiStore.setState({ modal: 'none', patchNotesFresh: 0 });
  };
  return (
    <Modal
      title={t('patchNotes.title')}
      onClose={close}
      class="patch-notes-modal"
      footer={
        <button class="btn btn-primary" onClick={close}>
          {t('patchNotes.ok')}
        </button>
      }
    >
      <ol class="patch-notes">
        {PATCH_NOTES.map((note, i) => (
          <li key={note.id} class={`patch-note ${i < fresh ? 'is-new' : ''}`}>
            <header class="patch-note-head">
              <h3>{note.title[lang]}</h3>
              {i < fresh && <span class="patch-note-badge">{t('patchNotes.new')}</span>}
              <time dateTime={note.date}>{formatDate(note.date, lang)}</time>
            </header>
            <ul>
              {note.items[lang].map((line, j) => (
                <li key={j}>{line}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
