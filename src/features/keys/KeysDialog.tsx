import { Dialog } from '../../components/Dialog';

const MOD = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Strg';
const ALT = MOD === '⌘' ? '⌥' : 'Alt';

export const KEYS: [string, [string, string][]][] = [
  [
    'In einer Aufgabenzeile',
    [
      ['Enter', 'Speichern und neue Zeile darunter'],
      ['Enter in leerer Zeile', 'Eingabe beenden'],
      [`${MOD} + Enter`, 'Erledigt / wieder öffnen'],
      ['↑ / ↓', 'Vorherige / nächste Aufgabe'],
      [`${MOD} + Umschalt + ↑ / ↓`, 'Aufgabe verschieben'],
      ['Tab / Umschalt + Tab', 'Zwischen Titel, Person, Datum, Status wechseln'],
      ['Rücktaste in leerer Zeile', 'Zeile löschen'],
      [`${ALT} + P`, 'Person wählen'],
      [`${ALT} + M`, 'Mir zuweisen'],
      [`${ALT} + D`, 'Datum wählen'],
      [`${ALT} + S`, 'Unteraufgabe anlegen'],
      [`${MOD} + O`, 'Details öffnen'],
      ['Esc', 'Eingabe verlassen, Zeile bleibt ausgewählt'],
    ],
  ],
  [
    'Ausgewählte Zeile (nach Esc)',
    [
      ['↑ / ↓', 'Auswahl bewegen'],
      ['Enter', 'Titel bearbeiten'],
      ['Leertaste', 'Details öffnen'],
      ['Entf', 'Aufgabe löschen (mit Rückgängig)'],
      ['→ / ←', 'Unteraufgaben aus- / einklappen'],
    ],
  ],
  [
    'Überall',
    [
      ['N', 'Neue Aufgabe oben in der ersten Gruppe'],
      ['/', 'Suche'],
      ['G, dann M', 'Zu „Meine Aufgaben“'],
      ['G, dann I', 'Zum Eingang'],
      ['Esc', 'Details oder Dialog schließen'],
      [`${MOD} + Z`, 'Rückgängig'],
      ['?', 'Diese Übersicht'],
    ],
  ],
  [
    'Auswahlfelder',
    [
      ['Tippen', 'Filtern (Datum: „morgen“, „fr“, „12.10.“)'],
      ['↑ / ↓, Enter', 'Auswählen und übernehmen'],
      ['Esc', 'Schließen, Fokus zurück aufs Feld'],
    ],
  ],
];

export function KeysDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Tastenkürzel" onClose={onClose}>
      <div className="keys">
        {KEYS.map(([h, rows]) => (
          <div key={h}>
            <h3>{h}</h3>
            {rows.map(([k, d]) => (
              <div key={k} className="krow">
                <span>{d}</span>
                <kbd>{k}</kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
