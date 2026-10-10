import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useApp } from '../../store/appStore';
import { chooseUser, createUserAndChoose, forgetFolder, initialize, pickFolder, reconnect, useSession } from '../../app/session';

/** Start screens shown before the actual app. */
export function Onboarding() {
  const s = useSession();
  return (
    <main className="onb">
      <div className="onb-card">
        <div className="brand onb-brand">
          <span className="logo" aria-hidden="true"><Icon n="check" s={14} /></span>
          teamtodo
        </div>
        {s.phase === 'checking' || s.phase === 'loading' ? <p className="onb-text" role="status">Loading …</p> : null}
        {s.phase === 'unsupported' && <Unsupported />}
        {s.phase === 'welcome' && <Welcome />}
        {s.phase === 'reconnect' && <Reconnect name={s.dirName ?? 'data folder'} />}
        {s.phase === 'setup' && <Setup name={s.dirName ?? ''} notEmpty={s.dirNotEmpty} />}
        {s.phase === 'failed' && <Failed message={s.error ?? 'Unknown error.'} />}
        {s.phase === 'who' && <Who />}
      </div>
    </main>
  );
}

function Unsupported() {
  return (
    <>
      <h1>Please open in Chrome or Edge</h1>
      <p className="onb-text">
        This app saves directly into a folder on your computer. Only current versions of Google Chrome and Microsoft Edge can do that.
        Open the file <code>index.html</code> there via right-click → "Open with".
      </p>
    </>
  );
}

function Welcome() {
  return (
    <>
      <h1>Willkommen</h1>
      <p className="onb-text">
        Choose the folder where your team's tasks are saved, for example a shared OneDrive folder. Everyone in the team chooses the same folder.
      </p>
      <button type="button" className="btn primary lg" onClick={() => void pickFolder()} autoFocus>
        <Icon n="folder" />
        Choose data folder
      </button>
    </>
  );
}

function Reconnect({ name }: { name: string }) {
  return (
    <>
      <h1>Welcome back</h1>
      <p className="onb-text">For security reasons, the browser asks once on every start whether the app may access the folder.</p>
      <div className="onb-actions">
        <button type="button" className="btn primary lg" onClick={() => void reconnect()} autoFocus>
          Continue with folder "{name}"
        </button>
        <button type="button" className="btn lg" onClick={() => void pickFolder()}>
          Choose another folder
        </button>
      </div>
    </>
  );
}

function Setup({ name, notEmpty }: { name: string; notEmpty: boolean }) {
  const [samples, setSamples] = useState(true);
  return (
    <>
      <h1>Set up a new data folder</h1>
      {notEmpty ? (
        <p className="onb-text">
          The folder "{name}" already contains other files. The app should create its own subfolder "teamtodo" in it.
        </p>
      ) : (
        <p className="onb-text">The folder "{name}" is empty. The app will create its files here.</p>
      )}
      <label className="onb-check">
        <input type="checkbox" checked={samples} onChange={(e) => setSamples(e.target.checked)} />
        Start with sample data (projects, tasks, team)
      </label>
      <div className="onb-actions">
        {notEmpty ? (
          <>
            <button type="button" className="btn primary lg" onClick={() => void initialize({ samples, subfolder: true })} autoFocus>
              Create subfolder "teamtodo"
            </button>
            <button type="button" className="btn lg" onClick={() => void initialize({ samples, subfolder: false })}>
              Create here anyway
            </button>
          </>
        ) : (
          <button type="button" className="btn primary lg" onClick={() => void initialize({ samples, subfolder: false })} autoFocus>
            Set up
          </button>
        )}
        <button type="button" className="btn lg" onClick={() => void pickFolder()}>
          Choose another folder
        </button>
      </div>
    </>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <>
      <h1>That didn't work</h1>
      <p className="onb-text err" role="alert">{message}</p>
      <div className="onb-actions">
        <button type="button" className="btn primary lg" onClick={() => void pickFolder()} autoFocus>
          Choose folder
        </button>
        <button type="button" className="btn lg" onClick={() => void forgetFolder()}>
          Start over
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
      <p className="onb-text">The choice only applies to this browser. You can change it later at the bottom left.</p>
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
        <label htmlFor="onb-name">{users.length ? 'Not listed? Add new' : 'Your name'}</label>
        <div className="onb-row">
          <input id="onb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoFocus={!users.length} />
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            Create
          </button>
        </div>
      </form>
    </>
  );
}
