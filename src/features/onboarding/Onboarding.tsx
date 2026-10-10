import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Icon } from '../../components/Icon';
import { useApp } from '../../store/appStore';
import { t } from '../../i18n';
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
        {s.phase === 'checking' || s.phase === 'loading' ? <p className="onb-text" role="status">{t('common.loading')}</p> : null}
        {s.phase === 'unsupported' && <Unsupported />}
        {s.phase === 'welcome' && <Welcome />}
        {s.phase === 'reconnect' && <Reconnect name={s.dirName ?? 'data folder'} />}
        {s.phase === 'setup' && <Setup name={s.dirName ?? ''} notEmpty={s.dirNotEmpty} />}
        {s.phase === 'failed' && <Failed message={s.error ?? t('onb.unknownError')} />}
        {s.phase === 'who' && <Who />}
      </div>
    </main>
  );
}

function Unsupported() {
  return (
    <>
      <h1>{t('onb.unsupportedTitle')}</h1>
      <p className="onb-text">
        {t('onb.unsupportedText')} {t('onb.openFile', { file: 'index.html' })}
      </p>
    </>
  );
}

function Welcome() {
  return (
    <>
      <h1>{t('onb.welcome')}</h1>
      <p className="onb-text">{t('onb.welcomeText')}</p>
      <button type="button" className="btn primary lg" onClick={() => void pickFolder()} autoFocus>
        <Icon n="folder" />
        {t('onb.chooseFolder')}
      </button>
    </>
  );
}

function Reconnect({ name }: { name: string }) {
  return (
    <>
      <h1>{t('onb.back')}</h1>
      <p className="onb-text">{t('onb.reconnectText')}</p>
      <div className="onb-actions">
        <button type="button" className="btn primary lg" onClick={() => void reconnect()} autoFocus>
          {t('onb.continueWith', { name })}
        </button>
        <button type="button" className="btn lg" onClick={() => void pickFolder()}>
          {t('onb.chooseOther')}
        </button>
      </div>
    </>
  );
}

function Setup({ name, notEmpty }: { name: string; notEmpty: boolean }) {
  const [samples, setSamples] = useState(true);
  return (
    <>
      <h1>{t('onb.setupTitle')}</h1>
      {notEmpty ? (
        <p className="onb-text">
          {t('onb.notEmpty', { name })}
        </p>
      ) : (
        <p className="onb-text">{t('onb.empty', { name })}</p>
      )}
      <label className="onb-check">
        <input type="checkbox" checked={samples} onChange={(e) => setSamples(e.target.checked)} />
        {t('onb.samples')}
      </label>
      <div className="onb-actions">
        {notEmpty ? (
          <>
            <button type="button" className="btn primary lg" onClick={() => void initialize({ samples, subfolder: true })} autoFocus>
              {t('onb.createSub')}
            </button>
            <button type="button" className="btn lg" onClick={() => void initialize({ samples, subfolder: false })}>
              {t('onb.createHere')}
            </button>
          </>
        ) : (
          <button type="button" className="btn primary lg" onClick={() => void initialize({ samples, subfolder: false })} autoFocus>
            {t('onb.setup')}
          </button>
        )}
        <button type="button" className="btn lg" onClick={() => void pickFolder()}>
          {t('onb.chooseOther')}
        </button>
      </div>
    </>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <>
      <h1>{t('onb.failedTitle')}</h1>
      <p className="onb-text err" role="alert">{message}</p>
      <div className="onb-actions">
        <button type="button" className="btn primary lg" onClick={() => void pickFolder()} autoFocus>
          {t('onb.chooseFolderShort')}
        </button>
        <button type="button" className="btn lg" onClick={() => void forgetFolder()}>
          {t('onb.startOver')}
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
      <h1>{t('onb.who')}</h1>
      <p className="onb-text">{t('onb.whoText')}</p>
      {users.length > 0 && (
        <ul className="onb-users" aria-label={t('onb.teamMembers')}>
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
        <label htmlFor="onb-name">{users.length ? t('onb.notListed') : t('onb.yourName')}</label>
        <div className="onb-row">
          <input id="onb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('onb.namePlaceholder')} autoFocus={!users.length} />
          <button type="submit" className="btn primary" disabled={!name.trim()}>
            {t('onb.create')}
          </button>
        </div>
      </form>
    </>
  );
}
