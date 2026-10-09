import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { addAttachmentMeta, removeAttachment, showToast, useApp } from '../../store/appStore';
import { getRepo } from '../../app/session';
import { classifyError, ERROR_TEXT } from '../../data/repository';
import { newId, nowIso } from '../../data/schema';
import type { Attachment, TaskState } from '../../data/types';

// Anhänge liegen als echte Dateien in attachments/<taskId>/<dateiname>.

const urlCache = new Map<string, string>();
const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const isImage = (a: Attachment) => a.mimeType.startsWith('image/');
const opensInBrowser = (a: Attachment) => isImage(a) || a.mimeType === 'application/pdf' || a.mimeType.startsWith('text/') || a.mimeType.startsWith('video/') || a.mimeType.startsWith('audio/');

async function objectUrl(taskId: string, a: Attachment): Promise<string> {
  const key = `${taskId}/${a.fileName}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const repo = getRepo();
  if (!repo) throw new Error('Kein Datenordner');
  const file = await repo.readAttachment(taskId, a.fileName);
  const url = URL.createObjectURL(file.type ? file : new Blob([file], { type: a.mimeType }));
  urlCache.set(key, url);
  return url;
}

export async function addFiles(task: TaskState, files: FileList | File[]) {
  const repo = getRepo();
  const me = useApp.getState().meId;
  if (!repo || !me) return;
  for (const f of [...files]) {
    try {
      const fileName = await repo.writeAttachment(task.id, f.name, f);
      addAttachmentMeta(task.id, { id: newId(), fileName, size: f.size, mimeType: f.type || 'application/octet-stream', addedAt: nowIso(), addedBy: me });
    } catch (e) {
      showToast(`„${f.name}“ konnte nicht gespeichert werden. ${ERROR_TEXT[classifyError(e)]}`);
    }
  }
}

function Thumb({ taskId, a }: { taskId: string; a: Attachment }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (isImage(a)) objectUrl(taskId, a).then((u) => live && setSrc(u), () => undefined);
    return () => {
      live = false;
    };
  }, [taskId, a]);
  return src ? <img src={src} alt="" /> : <span className="att-ic"><Icon n="clip" s={15} /></span>;
}

export function Attachments({ t }: { t: TaskState }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const list = t.attachments.filter((a) => !a.removedAt);

  const open = async (a: Attachment) => {
    try {
      const url = await objectUrl(t.id, a);
      if (opensInBrowser(a)) window.open(url, '_blank', 'noopener');
      else {
        const link = document.createElement('a');
        link.href = url;
        link.download = a.fileName;
        link.click();
      }
    } catch (e) {
      showToast(`Datei nicht gefunden. ${e instanceof DOMException ? 'Wurde sie im Ordner gelöscht oder ist sie noch nicht synchronisiert?' : ''}`);
    }
  };

  return (
    <div
      className={'atts' + (over ? ' drop' : '')}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        void addFiles(t, e.dataTransfer.files);
      }}
    >
      {list.map((a) => (
        <div key={a.id} className="att">
          <button type="button" className="att-open" onClick={() => void open(a)} title={opensInBrowser(a) ? 'Öffnen' : 'Herunterladen'}>
            <Thumb taskId={t.id} a={a} />
            <span className="att-b">
              <span className="att-n">{a.fileName}</span>
              <span className="att-s">{fmtSize(a.size)}</span>
            </span>
          </button>
          <button type="button" className="icon-btn" onClick={() => removeAttachment(t.id, a.id)} aria-label={`${a.fileName} entfernen`}>
            <Icon n="x" s={14} />
          </button>
        </div>
      ))}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addFiles(t, e.target.files);
          e.target.value = '';
        }}
      />
      <button type="button" className="add-btn" onClick={() => input.current?.click()}>
        <Icon n="clip" s={14} />
        Datei anhängen oder hierher ziehen
      </button>
    </div>
  );
}
