import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { requestFocus, type FocusScope } from '../store/appStore';
import { Icon, type IconName } from './Icon';

/** Steuert ein Popover, das an einem Auslöser-Element hängt. */
export function usePop() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const ref = useRef<HTMLElement | null>(null);
  ref.current = anchor;
  const open = useCallback((e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    const el = e.currentTarget;
    setAnchor((a) => (a ? null : el));
  }, []);
  /** `refocus`: Fokus zurück auf den Auslöser (nach Auswahl oder Esc) */
  const close = useCallback((refocus?: boolean) => {
    const a = ref.current;
    setAnchor(null);
    if (!a) return;
    const back = a.dataset.returnFocus;
    delete a.dataset.returnFocus;
    if (!refocus) return;
    if (back) {
      // Per Tastenkürzel aus dem Titelfeld geöffnet: zurück in den Titel (die Zeile kann inzwischen umgezogen sein)
      const [id, scope] = back.split('|') as [string, FocusScope];
      setTimeout(() => requestFocus(id, scope), 0);
    } else setTimeout(() => a.isConnected && a.focus(), 0);
  }, []);
  return { anchor, open, close };
}

interface PopoverProps {
  anchor: HTMLElement;
  onClose: (refocus: boolean) => void;
  children: ReactNode;
  width?: number;
  label?: string;
}

export function Popover({ anchor, onClose, children, width = 260, label }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(width, vw - 16);
    let left = r.left;
    if (left + w > vw - 8) left = Math.max(8, vw - w - 8);
    const h = ref.current?.offsetHeight ?? 0;
    let top = r.bottom + 4;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 4);
    setPos({ left, top, w });
  }, [anchor, width]);

  useEffect(() => {
    const md = (e: Event) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && !anchor.contains(t)) onClose(false);
    };
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onClose(true);
      }
    };
    const sc = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose(false);
    };
    document.addEventListener('mousedown', md, true);
    document.addEventListener('keydown', kd, true);
    document.addEventListener('scroll', sc, true);
    return () => {
      document.removeEventListener('mousedown', md, true);
      document.removeEventListener('keydown', kd, true);
      document.removeEventListener('scroll', sc, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      className="pop"
      role="dialog"
      aria-label={label}
      style={{ width: pos ? pos.w : width, left: pos ? pos.left : -9999, top: pos ? pos.top : -9999 }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onBlur={(e) => {
        // Fokus verlässt das Popover per Tab → schließen
        const next = e.relatedTarget as Node | null;
        if (next && ref.current && !ref.current.contains(next)) onClose(false);
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export type MenuItem =
  | { sep: true }
  | { head: string }
  | {
      label: string;
      onClick: () => void;
      icon?: IconName;
      dot?: string;
      avatar?: ReactNode;
      danger?: boolean;
      active?: boolean;
      /** Fokus nach Auswahl nicht auf den Auslöser zurücksetzen (z. B. weil ein Eingabefeld erscheint) */
      keepFocus?: boolean;
    };

export function Menu({ items, onClose, label }: { items: MenuItem[]; onClose: (refocus: boolean) => void; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const b = el?.querySelector<HTMLButtonElement>('.mi.active') ?? el?.querySelector<HTMLButtonElement>('.mi');
    b?.focus();
  }, []);
  return (
    <div
      ref={ref}
      className="menu"
      role="menu"
      aria-label={label}
      onKeyDown={(e) => {
        const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.mi') ?? [])];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          btns[(i + 1) % btns.length]?.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          btns[(i - 1 + btns.length) % btns.length]?.focus();
        } else if (e.key.length === 1 && /\S/.test(e.key)) {
          // Tippen springt zum ersten passenden Eintrag
          const k = e.key.toLowerCase();
          const start = i + 1;
          const hit = [...btns.slice(start), ...btns.slice(0, start)].find((b) => b.textContent?.trim().toLowerCase().startsWith(k));
          hit?.focus();
        }
      }}
    >
      {items.map((it, i) =>
        'sep' in it ? (
          <div key={i} className="sep" />
        ) : 'head' in it ? (
          <div key={i} className="mhead">{it.head}</div>
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={'mi' + (it.danger ? ' danger' : '') + (it.active ? ' active' : '')}
            onClick={() => {
              it.onClick();
              onClose(!it.keepFocus);
            }}
          >
            {it.icon && <Icon n={it.icon} />}
            {it.dot && <span className={'dot c-' + it.dot} />}
            {it.avatar}
            <span className="mi-l">{it.label}</span>
            {it.active && <Icon n="check" className="mi-check" />}
          </button>
        ),
      )}
    </div>
  );
}
