import { useCallback, useEffect, useState } from 'react';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { showToast } from '../../store/appStore';
import { backupNow, getRepo, restore, syncNow, useSession } from '../../app/session';
import type { BackupInfo } from '../../data/repository';
import { fmtDate } from '../../lib/dates';
import { KEEP_BACKUPS } from '../../data/maintenance';
import { t } from '../../i18n';

const label = (name: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(name)) return t('data.daily', { date: fmtDate(name) });
  const m = /^before-restore-(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})/.exec(name);
  return m ? t('data.beforeRestore', { date: `${fmtDate(m[1]!)} ${m[2]}:${m[3]}` }) : name;
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
      showToast(t('data.failed', { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
      void reload();
    }
  };

  return (
    <Dialog title={t('nav.data')} onClose={onClose} wide>
      <p className="d-text">
        {t('data.folder')}: <strong>{dirName}</strong>. {t('data.intro')} {t('data.introBackup', { n: KEEP_BACKUPS })}
      </p>
      <div className="d-row">
        <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => { await backupNow(); showToast(t('data.backupCreated')); })}>
          <Icon n="db" s={15} />
          {t('data.backupNow')}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void run(async () => { await syncNow(); showToast(t('data.synced')); })}>
          <Icon n="swap" s={15} />
          {t('data.syncNow')}
        </button>
      </div>

      <h3 className="d-h">{t('data.backups')}</h3>
      {backups === null ? (
        <p className="d-text">{t('common.loading')}</p>
      ) : !backups.length ? (
        <p className="d-text">{t('data.none')}</p>
      ) : (
        <ul className="backups" aria-label={t('data.backups')}>
          {backups.map((b) => (
            <li key={b.name} className="bk">
              <span className="bk-n">{label(b.name)}</span>
              <span className="bk-s">{size(b.size)}</span>
              {confirm === b.name ? (
                <span className="bk-confirm" role="alert">
                  {t('data.confirm')}
                  <button type="button" className="btn sm primary" disabled={busy} autoFocus
                    onClick={() => void run(async () => { await restore(b.name); setConfirm(null); onClose(); })}>
                    {t('data.restore')}
                  </button>
                  <button type="button" className="btn sm" onClick={() => setConfirm(null)}>{t('common.cancel')}</button>
                </span>
              ) : (
                <button type="button" className="btn sm" onClick={() => setConfirm(b.name)} aria-label={t('data.restoreNamed', { name: label(b.name) })}>
                  {t('data.restoreDots')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {conflicts.length > 0 && (
        <>
          <h3 className="d-h">{t('data.conflicts')}</h3>
          <p className="d-text">{t('data.conflictText')}</p>
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
