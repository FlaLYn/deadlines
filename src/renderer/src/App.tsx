import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { AuthUser } from '../../shared/types';
import Dashboard from './Dashboard';
import KeySetup from './KeySetup';
import Login from './Login';

type Gate =
  | { phase: 'booting' }
  | { phase: 'login' }
  | { phase: 'key-setup'; user: AuthUser }
  | { phase: 'app'; user: AuthUser };

export default function App() {
  const [gate, setGate] = useState<Gate>({ phase: 'booting' });

  /**
   * A returning account with its own saved key goes straight to the dashboard.
   */
  const enter = useCallback(async (user: AuthUser) => {
    const keys = await window.deadlines.keys.status();
    const ready = keys.ok && keys.data.configured;
    setGate({ phase: ready ? 'app' : 'key-setup', user });
  }, []);

  const sync = useCallback(async () => {
    const state = await window.deadlines.auth.state();
    if (state.status === 'signed-in') await enter(state.user);
    else setGate({ phase: 'login' });
  }, [enter]);

  // The main process may already have restored a session before the window opened.
  useEffect(() => {
    void sync();
  }, [sync]);

  if (gate.phase === 'booting') {
    return (
      <div className="boot-screen">
        <div>
          <Loader2 size={22} className="spin" />
          Opening your workspace…
        </div>
      </div>
    );
  }

  if (gate.phase === 'login') {
    return <Login onSignedIn={(user) => void enter(user)} />;
  }

  if (gate.phase === 'key-setup') {
    return (
      <KeySetup
        user={gate.user}
        onReady={() => setGate({ phase: 'app', user: gate.user })}
        onSkip={() => setGate({ phase: 'app', user: gate.user })}
      />
    );
  }

  return (
    <Dashboard
      // Remounts on account switch so no previous workspace state leaks across.
      key={gate.user.sub}
      user={gate.user}
      onSignedOut={() => void sync()}
    />
  );
}
