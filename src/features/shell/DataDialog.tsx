import { useCallback, useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { showToast } from '../../store/appStore';
import { backupNow, getRepo, restore, syncNow, useSession } from '../../app/session';
import type { BackupInfo } from '../../data/repository';
import { fmtDate } from '../../lib/dates';
import { KEEP_BACKUPS } from '../../data/maintenance';

const label = (name: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(name)) return `Tagessicherung ${fmtDate(name)}`;
  const m = /^vor-wiederherstellung-(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})/.exec(name);
  return m ? `Vor Wiederherstellung, ${fmtDate(m[1]!)} ${m[2]}:${m[3]}` : name;
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
      showToast(`Das hat nicht geklappt: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      void reload();
    }
  };

  return (
    <Dialog title="Daten und Sicherungen" onClose={onClose} wide>
      <p className="d-text">
        Datenordner: <strong>{dirName}</strong>. Jede Änderung wird sofort dort gespeichert. Einmal am Tag legt die App eine Komplettsicherung im Unterordner{' '}
        <code>backups</code> an und behält die letzten {KEEP_BACKUPS}.
      </p>
      <div className="d-row">
        <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => { await backupNow(); showToast('Sicherung angelegt'); })}>
          <Icon n="db" s={15} />
          Jetzt sichern
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => { await syncNow(); showToast('Abgeglichen'); })}>
          <Icon n="swap" s={15} />
          Jetzt abgleichen
        </button>
      </div>

      <h3 className="d-h">Sicherungen</h3>
      {backups === null ? (
        <p className="d-text">Lädt …</p>
      ) : !backups.length ? (
        <p className="d-text">Noch keine Sicherung vorhanden.</p>
      ) : (
        <ul className="backups" aria-label="Sicherungen">
          {backups.map((b) => (
            <li key={b.name} className="bk">
              <span className="bk-n">{label(b.name)}</span>
              <span className="bk-s">{size(b.size)}</span>
              {confirm === b.name ? (
                <span className="bk-confirm" role="alert">
                  Alles auf diesen Stand zurücksetzen? Der aktuelle Stand wird vorher gesichert.
                  <button type="button" className="btn sm primary" disabled={busy} autoFocus
                    onClick={() => void run(async () => { await restore(b.name); setConfirm(null); onClose(); })}>
                    Wiederherstellen
                  </button>
                  <button type="button" className="btn sm" onClick={() => setConfirm(null)}>Abbrechen</button>
                </span>
              ) : (
                <button type="button" className="btn sm" onClick={() => setConfirm(b.name)} aria-label={`${label(b.name)} wiederherstellen`}>
                  Wiederherstellen …
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {conflicts.length > 0 && (
        <>
          <h3 className="d-h">OneDrive-Konfliktkopien</h3>
          <p className="d-text">
            Diese Dateien hat OneDrive angelegt, weil zwei Rechner dieselbe Datei gleichzeitig geändert haben. Die App ignoriert sie, ihre Änderungen sind
            bereits zusammengeführt. Du kannst sie im Datenordner löschen.
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
