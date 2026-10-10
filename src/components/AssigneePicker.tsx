import { useState } from 'react';
import { addUser, useApp } from '../store/appStore';
import type { ID } from '../data/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { t } from '../i18n';

interface Item {
  k: string;
  label: string;
  id?: ID | null;
  me?: boolean;
  isNew?: boolean;
  none?: boolean;
}

/** Person picker: "Assign to me" at the top, typing filters, unknown name → new person. */
export function AssigneePicker({ value, onPick }: { value: ID | null; onPick: (id: ID | null) => void }) {
  const users = useApp((s) => s.users);
  const meId = useApp((s) => s.meId);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const live = users.filter((u) => !u.deletedAt);
  const ql = q.trim().toLowerCase();
  const items: Item[] = [];
  if (!ql && meId && value !== meId) items.push({ k: 'me', label: t('assignee.toMe'), id: meId, me: true });
  live.filter((u) => u.name.toLowerCase().includes(ql)).forEach((u) => items.push({ k: u.id, label: u.name, id: u.id }));
  if (ql && !live.some((u) => u.name.toLowerCase() === ql)) items.push({ k: 'new', label: t('assignee.addNew', { name: q.trim() }), isNew: true });
  if (!ql && value) items.push({ k: 'none', label: t('assignee.remove'), id: null, none: true });

  const pick = (it: Item) => onPick(it.isNew ? addUser(q.trim()) : (it.id ?? null));
  const userOf = (it: Item) => live.find((u) => u.id === it.id);

  return (
    <div className="picker">
      <input
        className="pk-in"
        autoFocus
        placeholder={t('assignee.search')}
        value={q}
        aria-label={t('assignee.searchAria')}
        role="combobox"
        aria-expanded="true"
        aria-controls="pk-people"
        aria-activedescendant={items[hi] ? `pk-${items[hi]!.k}` : undefined}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(items.length - 1, h + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === 'Enter' && items[hi]) {
            e.preventDefault();
            pick(items[hi]!);
          }
        }}
      />
      <div className="pk-list" role="listbox" id="pk-people" aria-label="People">
        {items.map((it, i) => (
          <button
            key={it.k}
            id={`pk-${it.k}`}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={i === hi}
            className={'pk-it' + (i === hi ? ' hi' : '') + (it.id === value && !it.me ? ' cur' : '')}
            onMouseEnter={() => setHi(i)}
            onClick={() => pick(it)}
          >
            {userOf(it) ? <Avatar user={userOf(it)} /> : <span className="av ghost"><Icon n={it.none ? 'x' : 'plus'} s={12} /></span>}
            <span>{it.label}</span>
            {it.me && <span className="pk-hint">{t('filter.me')}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
