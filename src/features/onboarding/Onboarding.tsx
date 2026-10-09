import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useApp } from '../../store/appStore';
import { chooseUser, createUserAndChoose, forgetFolder, initialize, pickFolder, reconnect, useSession } from '../../app/session';

/** Startbildschirme vor der eigentlichen App. */
export function Onboarding() {
  const s = useSession();
  return (
    <main className="onb">
      <div className="onb-card">
        <div className="brand onb-brand">
          <span className="logo" aria-hidden="true"><Icon n="check" s={14} /></span>
          teamtodo
        </div>
        {s.phase === 'checking' || s.phase === 'loading' ? <p className="onb-text" role="status">Lädt …</p> : null}
        {s.phase === 'unsupported' && <Unsupported />}
        {s.phase === 'welcome' && <Welcome />}
        {s.phase === 'reconnect' && <Reconnect name={s.dirName ?? 'Datenordner'} />}
        {s.phase === 'setup' && <Setup name={s.dirName ?? ''} notEmpty={s.dirNotEmpty} />}
        {s.phase === 'failed' && <Failed message={s.error ?? 'Unbekannter Fehler.'} />}
        {s.phase === 'who' && <Who />}
      </div>
    </main>
  );
}

function Unsupported() {
  return (
    <>
      <h1>Bitte in Chrome oder Edge öffnen</h1>
      <p className="onb-text">
        Diese App speichert direkt in einen Ordner auf deinem Rechner. Das können nur aktuelle Versionen von Google Chrome und Microsoft Edge.
        Öffne die Datei <code>index.html</code> dort per Rechtsklick → „Öffnen mit“.
      </p>
    </>
  );
}

function Welcome() {
  return (
    <>
      <h1>Willkommen</h1>
      <p className="onb-text">
        Wähle den Ordner, in dem eure Aufgaben gespeichert werden, zum Beispiel einen geteilten OneDrive-Ordner. Alle im Team wählen denselben Ordner.
      </p>
      <button type="button" className="btn primary lg" onClick={() => void pickFolder()} autoFocus>
        <Icon n="folder" />
        Datenordner wählen
      </button>
    </>
  );
}

function Reconnect({ name }: { name: string }) {
  return (
    <>
      <h1>Willkommen zurück</h1>
      <p className="onb-text">Der Browser fragt aus Sicherheitsgründen bei jedem Start einmal nach, ob die App auf den Ordner zugreifen darf.</p>
      <div className="onb-actions">
        <button type="button" className="btn primary lg" onClick={() => void reconnect()} autoFocus>
          Weiter mit Ordner „{name}“
        </button>
        <button type="button" className="btn lg" onClick={() => void pickFolder()}>
          Anderen Ordner wählen
        </button>
      </div>
    </>
  );
}

function Setup({ name, notEmpty }: { name: string; notEmpty: boolean }) {
  const [samples, setSamples] = useState(true);
  return (
    <>
      <h1>Neuen Datenordner einrichten</h1>
      {notEmpty ? (
        <p className="onb-text">
          Der Ordner „{name}“ enthält bereits andere Dateien. Am besten legt die App darin einen eigenen Unterordner „teamtodo“ an.
        </p>
      ) : (
        <p className="onb-text">Der Ordner „{name}“ ist leer. Die App legt hier ihre Dateien an.</p>
      )}
      <label className="onb-check">
        <input type="checkbox" checked={samples} onChange={(e) => setSamples(e.target.checked)} />
        Mit Beispieldaten starten (Projekte, Aufgaben, Team)
      </label>
      <div className="onb-actions">
        {notEmpty ? (
          <>
            <button type="button" className="btn primary lg" onClick={() => void initialize({ samples, subfolder: true })} autoFocus>
              Unterordner „teamtodo“ anlegen
            </button>
            <button type="button" className="btn lg" onClick={() => void initialize({ samples, subfolder: false })}>
              Trotzdem hier anlegen
            </button>
          </>
        ) : (
          <button type="button" className="btn primary lg" onClick={() => void initialize({ samples, subfolder: false })} autoFocus>
            Einrichten
          </button>
        )}
        <button type="button" className="btn lg" onClick={() => void pickFolder()}>
          Anderen Ordner wählen
        </button>
      </div>
    </>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <>
      <h1>Das hat nicht geklappt</h1>
      <p className="onb-text err" role="alert">{message}</p>
      <div className="onb-actions">
        <button type="button" className="btn primary lg" onClick={() => void pickFolder()} autoFocus>
          Ordner wählen
        </button>
        <button type="button" className="btn lg" onClick={() => void forgetFolder()}>
          Von vorn beginnen
        </button>
      </div>
    </>
  );
}

function Who() {
  const all = useApp((s) => s.users);
  const users = all.filter((u) => !u.deletedAt);
  const [name, setName] = useState('');
  return (
    <>
      <h1>Wer bist du?</h1>
      <p className="onb-text">Die Auswahl gilt nur für diesen Browser. Du kannst sie später unten links ändern.</p>
      {users.length > 0 && (
        <ul className="onb-users" aria-label="Teammitglieder">
          {users.map((u, i) => (
            <li key={u.id}>
              <button type="button" className="onb-user" onClick={() => chooseUser(u.id)} autoFocus={i === 0}>
                <Avatar user={u} size={28} />
                <span>{u.name}</span>
                <Icon n="chevR" s={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="onb-new"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) createUserAndChoose(name.trim());
        }}
      >
        <label htmlFor="onb-name">{users.length ? 'Nicht dabei? Neu anlegen' : 'Dein Name'}</label>
        <div className="onb-row">
          <input id="onb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vor- und Nachname" autoFocus={!users.length} />
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            Anlegen
          </button>
        </div>
      </form>
    </>
  );
}
