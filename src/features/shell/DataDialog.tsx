import { useCallback, useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { showToast } from '../../store/appStore';
import { backupNow, getRepo, restore, syncNow, useSession } from '../../app/session';
import type { BackupInfo } from '../../data/repository';
import { fmtDate } from '../../lib/dates';
import { KEEP_BACKUPS } from '../../data/maintenance';

const label = (name: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(name)) return `Daily backup ${fmtDate(name)}`;
  const m = /^before-restore-(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})/.exec(name);
  return m ? `Before restore, ${fmtDate(m[1]!)} ${m[2]}:${m[3]}` : name;
};
const size = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

export function DataDialog({ onClose }: { onClose: () => void }) {
  const dirName = useSession((s) => s.dirName);
  const conflicts = useSession((s) => s.conflictCopies);
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => setBackups((await getRepo()?.listBackups()) ?? []), []);
  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showToast(`That didn't work: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      void reload();
    }
  };

  return (
    <Dialog title="Data and backups" onClose={onClose} wide>
      <p className="d-text">
        Data folder: <strong>{dirName}</strong>. Every change is saved there immediately. Once a day, the app creates a full backup in the subfolder{' '}
        <code>backups</code> and keeps the last {KEEP_BACKUPS}.
      </p>
      <div className="d-row">
        <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => { await backupNow(); showToast('Backup created'); })}>
          <Icon n="db" s={15} />
          Back up now
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => { await syncNow(); showToast('Abgeglichen'); })}>
          <Icon n="swap" s={15} />
          Sync now
        </button>
      </div>

      <h3 className="d-h">Backups</h3>
      {backups === null ? (
        <p className="d-text">Loading …</p>
      ) : !backups.length ? (
        <p className="d-text">No backup yet.</p>
      ) : (
        <ul className="backups" aria-label="Backups">
          {backups.map((b) => (
            <li key={b.name} className="bk">
              <span className="bk-n">{label(b.name)}</span>
              <span className="bk-s">{size(b.size)}</span>
              {confirm === b.name ? (
                <span className="bk-confirm" role="alert">
                  Reset everything to this state? The current state is backed up first.
                  <button type="button" className="btn sm primary" disabled={busy} autoFocus
                    onClick={() => void run(async () => { await restore(b.name); setConfirm(null); onClose(); })}>
                    Restore
                  </button>
                  <button type="button" className="btn sm" onClick={() => setConfirm(null)}>Abbrechen</button>
                </span>
              ) : (
                <button type="button" className="btn sm" onClick={() => setConfirm(b.name)} aria-label={`${label(b.name)} restore`}>
                  Restore …
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {conflicts.length > 0 && (
        <>
          <h3 className="d-h">OneDrive conflict copies</h3>
          <p className="d-text">
            OneDrive created these files because two computers changed the same file at the same time. The app ignores them, their changes are
            already merged. You can delete them in the data folder.
          </p>
          <ul className="conflicts">
            {conflicts.map((c) => (
              <li key={c}><code>{c}</code></li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
}
