import { useEffect } from 'react';
import { boot, useSession } from './app/session';
import { Onboarding } from './features/onboarding/Onboarding';
import { Workspace } from './features/workspace/Workspace';

export function App() {
  const phase = useSession((s) => s.phase);
  useEffect(() => {
    void boot();
  }, []);
  return phase === 'ready' ? <Workspace /> : <Onboarding />;
}
