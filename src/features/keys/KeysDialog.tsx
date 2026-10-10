import { Dialog } from '../../components/Dialog';
import { t } from '../../i18n';

const MOD = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl';
const ALT = MOD === '⌘' ? '⌥' : 'Alt';

export const keySections = (): [string, [string, string][]][] => [
  [
    t('keys.inRow'),
    [
      ['Enter', t('keys.saveNewRow')],
      [t('keys.enterEmpty'), t('keys.leaveInput')],
      [`${MOD} + Enter`, t('keys.complete')],
      ['↑ / ↓', t('keys.prevNext')],
      [`${MOD} + ${t('keys.shift')} + ↑ / ↓`, t('keys.moveTask')],
      [`Tab / ${t('keys.shift')} + Tab`, t('keys.switchFields')],
      [t('keys.backspaceEmpty'), t('keys.deleteRow')],
      [`${ALT} + P`, t('keys.choosePerson')],
      [`${ALT} + M`, t('assignee.toMe')],
      [`${ALT} + D`, t('keys.chooseDate')],
      [`${ALT} + S`, t('keys.createSubtask')],
      [`${MOD} + O`, t('keys.openDetails')],
      [`${MOD} + K`, t('keys.makeLink')],
      ['Esc', t('keys.escStays')],
    ],
  ],
  [
    t('keys.selectedRow'),
    [
      ['↑ / ↓', t('keys.moveSelection')],
      ['Enter', t('keys.editTitle')],
      ['Space', t('keys.openDetails')],
      ['Delete', t('keys.deleteUndo')],
      ['→ / ←', t('keys.expandCollapse')],
    ],
  ],
  [
    t('keys.everywhere'),
    [
      ['N', t('keys.newTask')],
      ['/', t('toolbar.search')],
      [t('keys.goMyKey'), t('keys.goMy')],
      [t('keys.goInboxKey'), t('keys.goInbox')],
      ['Esc', t('keys.closeDetails')],
      [`${MOD} + Z`, t('toast.undo')],
      ['?', t('keys.overview')],
    ],
  ],
  [
    t('keys.selectFields'),
    [
      [t('keys.type'), t('keys.filterHint')],
      ['↑ / ↓, Enter', t('keys.selectConfirm')],
      ['Esc', t('keys.closeFocus')],
    ],
  ],
];

export function KeysDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title={t('nav.shortcuts')} onClose={onClose}>
      <div className="keys">
        {keySections().map(([h, rows]) => (
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
