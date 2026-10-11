import { useEffect } from 'react';
import { boot, useSession } from './app/session';
import { currentLang } from './i18n';
import { Onboarding } from './features/onboarding/Onboarding';
import { Workspace } from './features/workspace/Workspace';
import { usePrefs } from './store/prefs';
import { startNotifications } from './lib/notifications';
import { installCrashHandlers } from './app/crashReporting';
import { ErrorBoundary } from './components/ErrorBoundary';

export function App() {
  const phase = useSession((s) => s.phase);
  // Remounting the workspace on a language change re-renders every text at once
  const lang = usePrefs((s) => s.language ?? 'auto');
  const palette = usePrefs((s) => s.palette ?? 'standard');
  useEffect(() => {
    void boot();
    const stopNotifications = startNotifications();
    const removeCrashHandlers = installCrashHandlers();
    return () => {
      stopNotifications();
      removeCrashHandlers();
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = currentLang();
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset['palette'] = palette;
  }, [palette]);
  // Last resort: a crash outside every boundary below still shows a way back
  return (
    <ErrorBoundary name="app">
      {phase === 'ready' ? <Workspace key={lang} /> : <Onboarding />}
    </ErrorBoundary>
  );
}
