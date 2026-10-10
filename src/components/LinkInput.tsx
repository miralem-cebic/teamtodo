import { useState, type KeyboardEvent, type RefObject } from 'react';
import { insertLink, normalizeUrl } from '../lib/links';
import { isMod } from '../hooks/listNav';
import { t } from '../i18n';

/** Small input under a text field that asks for the URL of a link. */
function LinkBar({ onSubmit, onCancel, onBlur }: { onSubmit: (url: string) => void; onCancel: () => void; onBlur: () => void }) {
  const [v, setV] = useState('');
  const valid = !v.trim() || normalizeUrl(v) !== null;
  return (
    <div className="link-bar">
      <input
        autoFocus
        onBlur={onBlur}
        value={v}
        placeholder={t('link.placeholder')}
        aria-label={t('link.url')}
        aria-invalid={!valid}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          e.stopPropagation();
          if (e.key === 'Enter' && normalizeUrl(v)) {
            e.preventDefault();
            onSubmit(v);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      {!valid && <span className="link-err">{t('link.invalid')}</span>}
    </div>
  );
}

/**
 * Ctrl/⌘ + K in a text field: asks for a URL and turns the selected text into a link.
 * Use `onKeyDown` in the field, and render `bar` right below it.
 */
export function useLinkInput(ref: RefObject<HTMLTextAreaElement>, text: string, commit: (next: string) => void) {
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const close = () => {
    setRange(null);
    requestAnimationFrame(() => ref.current?.focus());
  };
  return {
    /** The URL input is open (the field must stay in edit mode) */
    active: range !== null,
    /** Returns true if the key was handled */
    onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!isMod(e) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'k') return false;
      e.preventDefault();
      const el = ref.current;
      if (el) setRange({ start: el.selectionStart, end: el.selectionEnd });
      return true;
    },
    bar: range && (
      <LinkBar
        onCancel={close}
        onBlur={() => setRange(null)}
        onSubmit={(url) => {
          const r = insertLink(text, range.start, range.end, url);
          if (!r) return;
          commit(r.text);
          setRange(null);
          requestAnimationFrame(() => {
            ref.current?.focus();
            ref.current?.setSelectionRange(r.cursor, r.cursor);
          });
        }}
      />
    ),
  };
}
