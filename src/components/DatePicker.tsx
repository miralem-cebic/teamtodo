import { useMemo, useState } from 'react';
import { addDays, fmtDate, fmtDue, fmtMonth, fromIsoDate, nextMonday, parseDateInput, toIsoDate, today } from '../lib/dates';
import type { ISODate } from '../data/types';
import { Icon } from './Icon';

interface Props {
  value: ISODate | null;
  time: string | null;
  onPick: (v: ISODate | null) => void;
  onTime: (v: string | null) => void;
}

/**
 * Datumsauswahl: Eingabefeld (versteht „morgen“, „fr“, „12.10.“), Schnellauswahl, Monatskalender,
 * optionale Uhrzeit, „Datum entfernen“. ↑/↓ wählt in der Schnellauswahl, Enter übernimmt.
 */
export function DatePicker({ value, time, onPick, onTime }: Props) {
  const t0 = today();
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [month, setMonth] = useState(() => {
    const d = value ? fromIsoDate(value) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const parsed = parseDateInput(q);

  const quick: { label: string; v: ISODate | null }[] = [
    { label: 'Heute', v: t0 },
    { label: 'Morgen', v: addDays(t0, 1) },
    { label: 'Nächste Woche', v: nextMonday() },
  ];
  const options = parsed ? [{ label: fmtDue(parsed), v: parsed }] : [...quick, ...(value ? [{ label: 'Datum entfernen', v: null }] : [])];

  const days = useMemo(() => {
    const first = new Date(month);
    const off = (first.getDay() + 6) % 7;
    first.setDate(1 - off);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(first);
      d.setDate(first.getDate() + i);
      return d;
    });
  }, [month]);

  return (
    <div className="dp">
      <input
        className="pk-in dp-in"
        autoFocus
        value={q}
        placeholder="z. B. morgen, fr, 12.10."
        aria-label="Datum eingeben"
        aria-invalid={!!q.trim() && !parsed}
        onChange={(e) => {
          setQ(e.target.value);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((h) => Math.min(options.length - 1, h + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((h) => Math.max(0, h - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            const o = options[hi];
            if (o) onPick(o.v);
          }
        }}
      />
      {q.trim() && !parsed ? <p className="dp-hint">Datum nicht erkannt</p> : null}
      <div className="dp-quick" role="listbox" aria-label="Schnellauswahl">
        {options.map((o, i) => (
          <button
            key={o.label}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={i === hi}
            className={'chip' + (o.v && value === o.v ? ' on' : '') + (i === hi ? ' hi' : '')}
            onClick={() => onPick(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="dp-head">
        <button type="button" className="icon-btn" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Vorheriger Monat">
          <Icon n="chevL" />
        </button>
        <span>{fmtMonth(month)}</span>
        <button type="button" className="icon-btn" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Nächster Monat">
          <Icon n="chevR" />
        </button>
      </div>
      <div className="dp-grid">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((w) => (
          <span key={w} className="dp-wd">{w}</span>
        ))}
        {days.map((d) => {
          const iso = toIsoDate(d);
          return (
            <button
              key={iso}
              type="button"
              className={'dp-d' + (d.getMonth() !== month.getMonth() ? ' out' : '') + (iso === t0 ? ' today' : '') + (iso === value ? ' sel' : '')}
              onClick={() => onPick(iso)}
              aria-label={fmtDate(iso)}
              aria-pressed={iso === value}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="dp-foot">
        {value ? (
          <label className="dp-time">
            <Icon n="status" s={14} />
            <input type="time" value={time ?? ''} onChange={(e) => onTime(e.target.value || null)} aria-label="Uhrzeit" />
          </label>
        ) : (
          <span />
        )}
        {value && (
          <button type="button" className="link" onClick={() => onPick(null)}>
            Datum entfernen
          </button>
        )}
      </div>
    </div>
  );
}
