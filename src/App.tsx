import { useEffect } from 'react';
import { boot, useSession } from './app/session';
import { currentLang } from './i18n';
import { Onboarding } from './features/onboarding/Onboarding';
import { Workspace } from './features/workspace/Workspace';
import { usePrefs } from './store/prefs';

export function App() {
  const phase = useSession((s) => s.phase);
  // Remounting the workspace on a language change re-renders every text at once
  const lang = usePrefs((s) => s.language ?? 'auto');
  const palette = usePrefs((s) => s.palette ?? 'standard');
  useEffect(() => {
    void boot();
  }, []);
  useEffect(() => {
    document.documentElement.lang = currentLang();
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.palette = palette;
  }, [palette]);
  return phase === 'ready' ? <Workspace key={lang} /> : <Onboarding />;
}
