import { Dialog } from '../../components/Dialog';

const MOD = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl';
const ALT = MOD === '⌘' ? '⌥' : 'Alt';

export const KEYS: [string, [string, string][]][] = [
  [
    'In a task row',
    [
      ['Enter', 'Save and new row below'],
      ['Enter in empty row', 'Leave input'],
      [`${MOD} + Enter`, 'Complete / reopen'],
      ['↑ / ↓', 'Previous / next task'],
      [`${MOD} + Umschalt + ↑ / ↓`, 'Move task'],
      ['Tab / Umschalt + Tab', 'Switch between title, person, date and status'],
      ['Backspace in empty row', 'Delete row'],
      [`${ALT} + P`, 'Choose person'],
      [`${ALT} + M`, 'Mir zuweisen'],
      [`${ALT} + D`, 'Choose date'],
      [`${ALT} + S`, 'Create subtask'],
      [`${MOD} + O`, 'Open details'],
      ['Esc', 'Leave input, row stays selected'],
    ],
  ],
  [
    'Selected row (after Esc)',
    [
      ['↑ / ↓', 'Auswahl bewegen'],
      ['Enter', 'Edit title'],
      ['Space', 'Open details'],
      ['Delete', 'Delete task (with undo)'],
      ['→ / ←', 'Expand / collapse subtasks'],
    ],
  ],
  [
    'Everywhere',
    [
      ['N', 'New task at the top of the first group'],
      ['/', 'Search'],
      ['G, dann M', 'Go to "My tasks"'],
      ['G, dann I', 'Go to inbox'],
      ['Esc', 'Close details or dialog'],
      [`${MOD} + Z`, 'Undo'],
      ['?', 'This overview'],
    ],
  ],
  [
    'Auswahlfelder',
    [
      ['Type', 'Filter (date: "tomorrow", "fr", "12.10.")'],
      ['↑ / ↓, Enter', 'Select and confirm'],
      ['Esc', 'Close, focus back to the field'],
    ],
  ],
];

export function KeysDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose}>
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
