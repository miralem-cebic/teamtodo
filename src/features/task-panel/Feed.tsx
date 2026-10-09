import { Fragment, useRef, useState, type ReactNode } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { addComment, deleteComment, useApp } from '../../store/appStore';
import { usePrefs } from '../../store/prefs';
import { activityText } from '../../lib/activityText';
import { fmtTimestamp } from '../../lib/dates';
import type { TaskState, User } from '../../data/types';

const MOD = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Strg';

/** @Name im Text hervorheben */
export function renderMentions(text: string, users: User[]): ReactNode {
  const names = users
    .map((u) => u.name)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!names.length) return text;
  const re = new RegExp(`(@(?:${names.join('|')}))`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? <span key={i} className="mention">{part}</span> : <Fragment key={i}>{part}</Fragment>));
}

export function Feed({ t }: { t: TaskState }) {
  const users = useApp((s) => s.users);
  const meId = useApp((s) => s.meId);
  const showActivity = usePrefs((p) => p.showActivity !== false);
  const items = [
    ...t.comments.filter((c) => !c.deletedAt).map((c) => ({ kind: 'c' as const, id: c.id, at: c.at, c })),
    ...(showActivity ? t.activity.map((a) => ({ kind: 'a' as const, id: a.id, at: a.at, a })) : []),
  ].sort((x, y) => x.at.localeCompare(y.at));

  return (
    <div className="feed">
      <div className="feed-tools">
        <button type="button" className="link" onClick={() => usePrefs.setState({ showActivity: !showActivity })}>
          {showActivity ? 'Nur Kommentare zeigen' : 'Aktivität einblenden'}
        </button>
      </div>
      {!items.length && <p className="feed-empty">Noch keine Kommentare.</p>}
      {items.map((it) => {
        if (it.kind === 'c') {
          const u = users.find((x) => x.id === it.c.userId);
          return (
            <div key={it.id} className="cmt">
              <Avatar user={u} size={28} />
              <div className="cmt-b">
                <div className="cmt-h">
                  <strong>{u?.name ?? 'Unbekannt'}</strong>
                  <span>{fmtTimestamp(it.at)}</span>
                  {it.c.userId === meId && (
                    <button type="button" className="icon-btn cmt-del" onClick={() => deleteComment(t.id, it.c.id)} aria-label="Kommentar löschen">
                      <Icon n="trash" s={13} />
                    </button>
                  )}
                </div>
                <p>{renderMentions(it.c.text, users)}</p>
              </div>
            </div>
          );
        }
        const u = users.find((x) => x.id === it.a.userId);
        return (
          <div key={it.id} className="act">
            <span className="act-dot" />
            <span>
              {u?.name ?? 'Jemand'} {activityText(it.a, users)}
            </span>
            <span className="act-t">{fmtTimestamp(it.at)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function CommentBox({ t }: { t: TaskState }) {
  const users = useApp((s) => s.users);
  const meId = useApp((s) => s.meId);
  const me = users.find((u) => u.id === meId);
  const [v, setV] = useState('');
  const [m, setM] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const sugg = m !== null ? users.filter((u) => !u.deletedAt && u.name.toLowerCase().startsWith(m.toLowerCase())).slice(0, 6) : [];

  const onChange = (val: string) => {
    setV(val);
    const pos = ref.current?.selectionStart ?? val.length;
    const mm = /(?:^|\s)@([\wäöüÄÖÜß-]*)$/.exec(val.slice(0, pos));
    setM(mm ? mm[1]! : null);
    setHi(0);
  };
  const insert = (u: User) => {
    const el = ref.current!;
    const pos = el.selectionStart;
    const before = v.slice(0, pos).replace(/@([\wäöüÄÖÜß-]*)$/, `@${u.name} `);
    setV(before + v.slice(pos));
    setM(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  };
  const send = () => {
    if (!v.trim()) return;
    addComment(t.id, v);
    setV('');
    setM(null);
  };

  return (
    <div className="cbox">
      <Avatar user={me} size={28} />
      <div className="cbox-in">
        {sugg.length > 0 && (
          <div className="msugg" role="listbox" aria-label="Person erwähnen">
            {sugg.map((u, i) => (
              <button key={u.id} type="button" role="option" aria-selected={i === hi} className={'pk-it' + (i === hi ? ' hi' : '')}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(u);
                }}>
                <Avatar user={u} />
                <span>{u.name}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={ref}
          className="c-in"
          rows={1}
          value={v}
          placeholder="Kommentar schreiben, mit @ erwähnen"
          aria-label="Kommentar"
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTimeout(() => setM(null), 120)}
          onKeyDown={(e) => {
            if (sugg.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
              e.preventDefault();
              setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : -1) + sugg.length) % sugg.length);
            } else if (sugg.length && (e.key === 'Enter' || e.key === 'Tab')) {
              e.preventDefault();
              insert(sugg[hi]!);
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (sugg.length) setM(null);
              else e.currentTarget.blur();
            }
          }}
        />
        <div className="cbox-foot">
          <span className="hint"><kbd>{MOD}</kbd>+<kbd>Enter</kbd> sendet</span>
          <button type="button" className="btn primary sm" onClick={send} disabled={!v.trim()}>Kommentieren</button>
        </div>
      </div>
    </div>
  );
}
